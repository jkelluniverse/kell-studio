// KS-05 capture pipeline: notes and voice memos in, confirmed facts out.
// Statuses walk READY/TRANSCRIBING -> EXTRACTING -> REVIEW -> DONE, with
// FAILED + failureNote as the recoverable off-ramp. All background work is
// driven by tick() from the cron route — no long-running workers. Facts are
// created only through createFact (the KS-02 citation gate); model output
// becomes rows only after its excerpts are verified verbatim substrings.
import type { StorageAdapter } from "@/adapters/storage/types";
import type { TranscriptionAdapter } from "@/adapters/transcription/types";
import type { AIAdapter, ProposedFact } from "@/adapters/ai/types";
import { prisma } from "./prisma";
import { forTenant, scopedData, type ScopedDb } from "./scoped";
import { createFact, DomainRuleError } from "./domain";
import { NotFoundError } from "./studio";

export interface PipelineDeps {
  storage: StorageAdapter;
  transcription: TranscriptionAdapter;
  ai: AIAdapter;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export async function createNoteCapture(db: ScopedDb, projectId: string, body: string) {
  if (!body.trim()) throw new DomainRuleError("A note needs some words.");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project");
  return db.capture.create({
    data: scopedData({
      projectId,
      kind: "TEXT" as const,
      body: body.trim(),
      status: "EXTRACTING" as const,
    }),
  });
}

export async function createVoiceCapture(
  db: ScopedDb,
  tenantId: string,
  projectId: string,
  audioKey: string
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project");
  if (!audioKey.startsWith(`t/${tenantId}/p/${projectId}/`)) {
    throw new DomainRuleError("That recording doesn't belong to this project.");
  }
  return db.capture.create({
    data: scopedData({
      projectId,
      kind: "VOICE" as const,
      body: "",
      rawRef: audioKey,
      status: "TRANSCRIBING" as const,
    }),
  });
}

// ---------------------------------------------------------------------------
// The tick — cron-driven, idempotent, safe under double-fire
// ---------------------------------------------------------------------------

// KS-05 DECISION: the cron tick has no session, so discovering pending work
// is the second explicitly-named unscoped READ in the codebase (after
// resolveIntakeToken). It returns only ids + tenantIds; every actual read
// and write of capture data runs through forTenant(tenantId) per item.
export async function findPendingCaptureWork(): Promise<
  Array<{ id: string; tenantId: string }>
> {
  return prisma.capture.findMany({
    where: { status: { in: ["TRANSCRIBING", "EXTRACTING"] } },
    select: { id: true, tenantId: true },
    orderBy: { createdAt: "asc" },
    take: 25, // per tick; the next minute picks up the rest
  });
}

export async function tick(deps: PipelineDeps): Promise<{ processed: number }> {
  const work = await findPendingCaptureWork();
  let processed = 0;
  for (const item of work) {
    try {
      await processCapture(deps, forTenant(item.tenantId), item.id);
      processed += 1;
    } catch (err) {
      // One bad capture never blocks the rest of the queue.
      console.error(`tick: capture ${item.id} failed`, err);
    }
  }
  return { processed };
}

export async function processCapture(
  deps: PipelineDeps,
  db: ScopedDb,
  captureId: string
): Promise<void> {
  const capture = await db.capture.findUnique({ where: { id: captureId } });
  if (!capture) return;
  if (capture.status === "TRANSCRIBING") await stepTranscription(deps, db, capture.id);
  else if (capture.status === "EXTRACTING") await stepExtraction(deps, db, capture.id);
}

async function stepTranscription(deps: PipelineDeps, db: ScopedDb, captureId: string) {
  const capture = await db.capture.findUniqueOrThrow({ where: { id: captureId } });
  if (!capture.rawRef) {
    await db.capture.update({
      where: { id: captureId },
      data: { status: "FAILED", failureNote: "No audio was attached to this capture." },
    });
    return;
  }

  if (!capture.transcriptJobId) {
    // Submit: the provider fetches audio via a short-lived presigned GET.
    const audioUrl = await deps.storage.getSignedUrl(capture.rawRef, {
      expiresSeconds: 3600,
    });
    const { jobId } = await deps.transcription.submit(audioUrl);
    // Guarded write: only the first submitter records a job id.
    await db.capture.updateMany({
      where: { id: captureId, status: "TRANSCRIBING", transcriptJobId: null },
      data: { transcriptJobId: jobId },
    });
    return;
  }

  const result = await deps.transcription.poll(capture.transcriptJobId);
  if (result.status === "pending") return;
  if (result.status === "error") {
    await db.capture.update({
      where: { id: captureId },
      data: { status: "FAILED", failureNote: `Transcription failed: ${result.errorMessage}` },
    });
    return;
  }
  // Completed — guarded transition so a double-fire writes the body once.
  await db.capture.updateMany({
    where: { id: captureId, status: "TRANSCRIBING" },
    data: { body: result.text, status: "EXTRACTING" },
  });
}

async function stepExtraction(deps: PipelineDeps, db: ScopedDb, captureId: string) {
  // Claim FIRST: the status-transition count check is the concurrency
  // guard. A second tick finds count 0 and never calls the model.
  const claim = await db.capture.updateMany({
    where: { id: captureId, status: "EXTRACTING" },
    data: { status: "REVIEW" },
  });
  if (claim.count === 0) return;

  const capture = await db.capture.findUniqueOrThrow({
    where: { id: captureId },
    include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
  });

  try {
    const proposals = await deps.ai.extractFacts({
      captureBody: capture.body,
      projectContext: capture.project
        ? `Project: ${capture.project.name} for ${capture.project.client.name}`
        : "Project: (unassigned)",
    });
    const valid = validateProposals(capture.body, proposals);

    for (const proposal of valid) {
      await createFact(db, {
        projectId: capture.projectId!,
        kind: proposal.kind,
        body: proposal.body,
        citations: [{ captureId: capture.id, excerpt: proposal.excerpt }],
      });
    }

    if (valid.length === 0) {
      // Nothing to review is a normal outcome, not a failure.
      await db.capture.updateMany({
        where: { id: captureId, status: "REVIEW" },
        data: { status: "DONE" },
      });
    }
  } catch (err) {
    await db.capture.update({
      where: { id: captureId },
      data: {
        status: "FAILED",
        failureNote: `Extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    });
  }
}

/** Model output passes only when its excerpt is a verbatim substring. */
export function validateProposals(
  captureBody: string,
  proposals: ProposedFact[]
): ProposedFact[] {
  return proposals
    .filter((p) => p.body.trim() !== "" && captureBody.includes(p.excerpt))
    .slice(0, 8);
}

export async function retryCapture(db: ScopedDb, captureId: string) {
  const capture = await db.capture.findUnique({ where: { id: captureId } });
  if (!capture) throw new NotFoundError("Capture");
  if (capture.status !== "FAILED") {
    throw new DomainRuleError("Only a failed capture can be retried.");
  }
  const backTo =
    capture.kind === "VOICE" && capture.body.trim() === "" ? "TRANSCRIBING" : "EXTRACTING";
  return db.capture.update({
    where: { id: captureId },
    data: { status: backTo, failureNote: null, transcriptJobId: null },
  });
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export async function proposedFactCount(db: ScopedDb): Promise<number> {
  return db.fact.count({ where: { status: "PROPOSED" } });
}

async function requireProposed(db: ScopedDb, factId: string) {
  const fact = await db.fact.findUnique({ where: { id: factId } });
  if (!fact) throw new NotFoundError("Fact");
  if (fact.status !== "PROPOSED") {
    throw new DomainRuleError("Only a proposed fact can be changed here.");
  }
  return fact;
}

/** Discard a PROPOSED fact entirely — drafts leave no rows behind. */
export async function discardProposedFact(db: ScopedDb, factId: string) {
  await requireProposed(db, factId);
  return db.fact.delete({ where: { id: factId } }); // citations cascade
}

/** Inline-edit body/kind of a PROPOSED fact, keeping its citation. */
export async function editProposedFact(
  db: ScopedDb,
  factId: string,
  input: { body: string; kind: ProposedFact["kind"] }
) {
  if (!input.body.trim()) throw new DomainRuleError("A fact needs a sentence.");
  await requireProposed(db, factId);
  return db.fact.update({
    where: { id: factId },
    data: { body: input.body.trim(), kind: input.kind },
  });
}

/** Bring a retired fact back to confirmed. */
export async function unretireFact(db: ScopedDb, factId: string) {
  const fact = await db.fact.findUnique({ where: { id: factId } });
  if (!fact) throw new NotFoundError("Fact");
  if (fact.status !== "RETIRED") {
    throw new DomainRuleError("Only a retired fact can be brought back.");
  }
  return db.fact.update({ where: { id: factId }, data: { status: "CONFIRMED" } });
}

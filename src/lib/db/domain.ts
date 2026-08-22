// KS-02 domain mandates, enforced in the data layer rather than the UI:
// a Fact cannot exist without at least one citation, and a Decision cannot
// exist without a rationale. Every helper takes a tenant-scoped client from
// forTenant(), so tenant confinement is inherited, never re-implemented.
// An ESLint no-restricted-syntax rule blocks direct .fact/.decision/
// .reminder create calls outside src/lib/db/ — these helpers are the door.
import type { FactKind, PhaseStatus, ReminderKind } from "@prisma/client";
import { scopedData, type ScopedDb } from "./scoped";

/** Thrown when a Fact would be created without a valid citation. */
export class CitationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CitationRequiredError";
  }
}

/** Thrown when a Decision would be recorded without a rationale. */
export class RationaleRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RationaleRequiredError";
  }
}

// KS-02 DECISION: §4.3's checks (reminder target, phase block note,
// document content) say "throws" without naming an error class; one shared
// DomainRuleError keeps them catchable without inventing three classes.
export class DomainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainRuleError";
  }
}

// ---------------------------------------------------------------------------
// 4.1 The citation gate
// ---------------------------------------------------------------------------

export interface FactCitationInput {
  captureId: string;
  excerpt?: string;
}

export interface CreateFactInput {
  projectId: string;
  kind: FactKind;
  body: string;
  citations: FactCitationInput[];
}

/**
 * The only way to create a Fact. Verifies every cited capture is visible
 * within the caller's tenant scope, then creates the Fact and its
 * FactCitations in one transaction.
 */
export async function createFact(db: ScopedDb, input: CreateFactInput) {
  const { projectId, kind, body, citations } = input;
  if (!citations || citations.length === 0) {
    throw new CitationRequiredError(
      "A Fact requires at least one citation to a Capture."
    );
  }

  return db.$transaction(async (tx) => {
    const ids = [...new Set(citations.map((c) => c.captureId))];
    const found = await tx.capture.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new CitationRequiredError(
        `Cited capture(s) not found in this tenant: ${missing.join(", ")}.`
      );
    }

    const fact = await tx.fact.create({
      data: scopedData({ projectId, kind, body }),
    });
    await tx.factCitation.createMany({
      data: citations.map((c) =>
        scopedData({
          factId: fact.id,
          captureId: c.captureId,
          excerpt: c.excerpt ?? null,
        })
      ),
    });
    return fact;
  });
}

/** Marks a Fact CONFIRMED and stamps confirmedAt. */
export async function confirmFact(db: ScopedDb, factId: string) {
  return db.fact.update({
    where: { id: factId },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
}

/** Marks a Fact RETIRED — history is kept, never deleted. */
export async function retireFact(db: ScopedDb, factId: string) {
  return db.fact.update({
    where: { id: factId },
    data: { status: "RETIRED" },
  });
}

// ---------------------------------------------------------------------------
// 4.2 The rationale gate
// ---------------------------------------------------------------------------

export interface RecordDecisionInput {
  projectId: string;
  title: string;
  rationale: string;
  decidedOn: Date;
  captureId?: string;
  /** id of the decision this one supersedes */
  supersedes?: string;
}

/**
 * The only way to record a Decision. Rejects blank rationales; when
 * superseding, links the old decision in the same transaction.
 */
export async function recordDecision(db: ScopedDb, input: RecordDecisionInput) {
  const { projectId, title, rationale, decidedOn, captureId, supersedes } = input;
  if (typeof rationale !== "string" || rationale.trim() === "") {
    throw new RationaleRequiredError(
      "A Decision requires a non-empty rationale."
    );
  }

  return db.$transaction(async (tx) => {
    const decision = await tx.decision.create({
      data: scopedData({
        projectId,
        title,
        rationale,
        decidedOn,
        captureId: captureId ?? null,
      }),
    });
    if (supersedes) {
      await tx.decision.update({
        where: { id: supersedes },
        data: { supersededById: decision.id },
      });
    }
    return decision;
  });
}

// ---------------------------------------------------------------------------
// 4.3 Small app-layer checks
// ---------------------------------------------------------------------------

/** Sets a Phase's status; BLOCKED requires a non-empty blockedNote. */
export async function setPhaseStatus(
  db: ScopedDb,
  phaseId: string,
  status: PhaseStatus,
  blockedNote?: string
) {
  if (status === "BLOCKED" && (!blockedNote || blockedNote.trim() === "")) {
    throw new DomainRuleError(
      "Setting a Phase to BLOCKED requires a blockedNote saying why."
    );
  }
  return db.phase.update({
    where: { id: phaseId },
    data: { status, blockedNote: blockedNote ?? null },
  });
}

export interface CreateReminderInput {
  kind: ReminderKind;
  milestoneId?: string;
  ideaId?: string;
  remindOn: Date;
}

/** Creates a Reminder with exactly one target, matching its kind. */
export async function createReminder(db: ScopedDb, input: CreateReminderInput) {
  const { kind, milestoneId, ideaId, remindOn } = input;
  if ((milestoneId ? 1 : 0) + (ideaId ? 1 : 0) !== 1) {
    throw new DomainRuleError(
      "A Reminder targets exactly one of milestoneId or ideaId."
    );
  }
  if (kind === "MILESTONE" && !milestoneId) {
    throw new DomainRuleError("A MILESTONE reminder must set milestoneId.");
  }
  if (kind === "IDEA" && !ideaId) {
    throw new DomainRuleError("An IDEA reminder must set ideaId.");
  }
  return db.reminder.create({
    data: scopedData({
      kind,
      milestoneId: milestoneId ?? null,
      ideaId: ideaId ?? null,
      remindOn,
    }),
  });
}

export interface CreateDocumentInput {
  projectId: string;
  title: string;
  r2Key?: string;
  body?: string;
  mimeType?: string;
}

/** Creates a Document; at least one of r2Key/body must be present. */
export async function createDocument(db: ScopedDb, input: CreateDocumentInput) {
  const { projectId, title, r2Key, body, mimeType } = input;
  if (!r2Key && !body) {
    throw new DomainRuleError(
      "A Document needs at least one of r2Key or body."
    );
  }
  return db.document.create({
    data: scopedData({
      projectId,
      title,
      r2Key: r2Key ?? null,
      body: body ?? null,
      mimeType: mimeType ?? null,
    }),
  });
}

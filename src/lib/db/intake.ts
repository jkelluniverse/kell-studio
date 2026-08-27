// Intake service layer: builder mutations (scoped, session-side) and the
// public token path (no session).
//
// KS-04 DECISION: resolveIntakeToken is the explicitly-named cross-tenant
// entry KS-01 anticipated ("if a future prompt needs cross-tenant access
// ... it will add an explicitly named function"). The public page has no
// session, so the globally-unique token is looked up on the raw client and
// everything after runs through forTenant(form.tenantId). It is the ONLY
// unscoped read in the codebase and resolves a single row by unguessable
// token.
import { nanoid } from "nanoid";
import type { IntakeItemKind, Prisma } from "@prisma/client";
import type { StorageAdapter } from "@/adapters/storage/types";
import type { EmailAdapter } from "@/adapters/email/types";
import { prisma } from "./prisma";
import { forTenant, scopedData, type ScopedDb } from "./scoped";
import { DomainRuleError } from "./domain";
import { NotFoundError } from "./studio";
import {
  assertUploadAllowed,
  buildObjectKey,
  registerUpload,
} from "./files";

// ---------------------------------------------------------------------------
// Builder (scoped)
// ---------------------------------------------------------------------------

export async function createIntakeForm(
  db: ScopedDb,
  projectId: string,
  input: { title: string; intro?: string }
) {
  if (!input.title.trim()) throw new DomainRuleError("An intake needs a title.");
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project");
  return db.intakeForm.create({
    data: scopedData({
      projectId,
      title: input.title.trim(),
      intro: input.intro?.trim() || null,
      token: nanoid(32),
    }),
  });
}

/** Title and intro stay editable in every status; structure does not. */
export async function updateIntakeForm(
  db: ScopedDb,
  id: string,
  input: { title?: string; intro?: string }
) {
  const form = await db.intakeForm.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("Intake form");
  if (input.title !== undefined && !input.title.trim()) {
    throw new DomainRuleError("An intake needs a title.");
  }
  return db.intakeForm.update({
    where: { id },
    data: {
      title: input.title?.trim() ?? undefined,
      intro: input.intro !== undefined ? input.intro.trim() || null : undefined,
    },
  });
}

async function requireDraftForm(db: ScopedDb, formId: string) {
  const form = await db.intakeForm.findUnique({ where: { id: formId } });
  if (!form) throw new NotFoundError("Intake form");
  if (form.status !== "DRAFT") {
    throw new DomainRuleError(
      "This intake is no longer a draft — its questions are locked."
    );
  }
  return form;
}

export interface IntakeItemInput {
  kind: IntakeItemKind;
  prompt: string;
  required?: boolean;
  choices?: string[];
}

function validateItemInput(input: IntakeItemInput) {
  if (!input.prompt.trim()) throw new DomainRuleError("A question needs a prompt.");
  if (input.kind === "CHOICE") {
    const choices = (input.choices ?? []).map((c) => c.trim()).filter(Boolean);
    if (choices.length < 2) {
      throw new DomainRuleError("A choice question needs at least two options.");
    }
    return choices;
  }
  return [];
}

export async function addIntakeItem(
  db: ScopedDb,
  formId: string,
  input: IntakeItemInput
) {
  const choices = validateItemInput(input);
  await requireDraftForm(db, formId);
  return db.$transaction(async (tx) => {
    const last = await tx.intakeItem.findFirst({
      where: { formId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    return tx.intakeItem.create({
      data: scopedData({
        formId,
        order: (last?.order ?? 0) + 1,
        kind: input.kind,
        prompt: input.prompt.trim(),
        required: input.required ?? true,
        choices,
      }),
    });
  });
}

export async function updateIntakeItem(
  db: ScopedDb,
  itemId: string,
  input: IntakeItemInput
) {
  const choices = validateItemInput(input);
  const item = await db.intakeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError("Question");
  await requireDraftForm(db, item.formId);
  return db.intakeItem.update({
    where: { id: itemId },
    data: {
      kind: input.kind,
      prompt: input.prompt.trim(),
      required: input.required ?? true,
      choices,
    },
  });
}

export async function deleteIntakeItem(db: ScopedDb, itemId: string) {
  const item = await db.intakeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError("Question");
  await requireDraftForm(db, item.formId);
  return db.intakeItem.delete({ where: { id: itemId } });
}

/** Same transaction-safe swap as KS-03 phases: park on the negative order. */
export async function moveIntakeItem(
  db: ScopedDb,
  itemId: string,
  direction: "up" | "down"
) {
  return db.$transaction(async (tx) => {
    const item = await tx.intakeItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError("Question");
    const form = await tx.intakeForm.findUnique({ where: { id: item.formId } });
    if (form!.status !== "DRAFT") {
      throw new DomainRuleError(
        "This intake is no longer a draft — its questions are locked."
      );
    }
    const neighbor = await tx.intakeItem.findFirst({
      where: {
        formId: item.formId,
        order: direction === "up" ? { lt: item.order } : { gt: item.order },
      },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbor) return item;
    await tx.intakeItem.update({ where: { id: item.id }, data: { order: -item.order } });
    await tx.intakeItem.update({ where: { id: neighbor.id }, data: { order: item.order } });
    return tx.intakeItem.update({ where: { id: item.id }, data: { order: neighbor.order } });
  });
}

export async function openIntakeForm(db: ScopedDb, id: string) {
  const form = await db.intakeForm.findUnique({
    where: { id },
    include: { items: { select: { id: true } } },
  });
  if (!form) throw new NotFoundError("Intake form");
  if (form.status !== "DRAFT") {
    throw new DomainRuleError("Only a draft can be opened.");
  }
  if (form.items.length === 0) {
    throw new DomainRuleError("Add at least one question before opening.");
  }
  return db.intakeForm.update({
    where: { id },
    data: { status: "OPEN", openedAt: new Date() },
  });
}

export async function closeIntakeForm(db: ScopedDb, id: string) {
  const form = await db.intakeForm.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("Intake form");
  if (form.status !== "OPEN") {
    throw new DomainRuleError("Only an open intake can be closed.");
  }
  return db.intakeForm.update({
    where: { id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}

// KS-04 DECISION: deletes exist so test data can be cleaned through the UI
// (§9.10). A form deletes only with zero responses (items cascade); a
// response deletes its answers by cascade and unlinks — not deletes — its
// documents, which stay in the vault until removed there.
export async function deleteIntakeForm(db: ScopedDb, id: string) {
  const form = await db.intakeForm.findUnique({
    where: { id },
    include: { responses: { select: { id: true } } },
  });
  if (!form) throw new NotFoundError("Intake form");
  if (form.responses.length > 0) {
    throw new DomainRuleError(
      "This intake has responses — delete those first."
    );
  }
  return db.intakeForm.delete({ where: { id } });
}

export async function deleteIntakeResponse(db: ScopedDb, id: string) {
  const response = await db.intakeResponse.findUnique({ where: { id } });
  if (!response) throw new NotFoundError("Response");
  return db.intakeResponse.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Public token path (no session)
// ---------------------------------------------------------------------------

export interface ResolvedIntake {
  db: ScopedDb;
  tenantId: string;
  form: {
    id: string;
    projectId: string;
    title: string;
    intro: string | null;
    status: "DRAFT" | "OPEN" | "CLOSED";
  };
}

/** See the header comment — the one deliberate unscoped lookup. */
export async function resolveIntakeToken(
  token: string
): Promise<ResolvedIntake | null> {
  if (!token || token.length < 16) return null;
  const form = await prisma.intakeForm.findUnique({ where: { token } });
  if (!form) return null;
  return {
    db: forTenant(form.tenantId),
    tenantId: form.tenantId,
    form: {
      id: form.id,
      projectId: form.projectId,
      title: form.title,
      intro: form.intro,
      status: form.status,
    },
  };
}

/** Items for a public render — OPEN forms only, prompts only. */
export async function publicIntakeItems(resolved: ResolvedIntake) {
  return resolved.db.intakeItem.findMany({
    where: { formId: resolved.form.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      kind: true,
      prompt: true,
      required: true,
      choices: true,
      order: true,
    },
  });
}

/** Presign one public intake upload; validates form state, item, and file. */
export async function presignIntakeUpload(
  storage: StorageAdapter,
  resolved: ResolvedIntake,
  input: { itemId: string; filename: string; mimeType: string; sizeBytes: number }
): Promise<{ key: string; url: string }> {
  if (resolved.form.status !== "OPEN") {
    throw new DomainRuleError("This intake isn't accepting uploads.");
  }
  const item = await resolved.db.intakeItem.findUnique({
    where: { id: input.itemId },
  });
  if (!item || item.formId !== resolved.form.id || item.kind !== "FILE_REQUEST") {
    throw new NotFoundError("Upload question");
  }
  assertUploadAllowed(input.mimeType, input.sizeBytes);
  const key = buildObjectKey(resolved.tenantId, resolved.form.projectId, input.filename);
  const url = await storage.getSignedPutUrl(key, {
    contentType: input.mimeType,
    contentLength: input.sizeBytes,
  });
  return { key, url };
}

export interface SubmissionInput {
  respondentName?: string;
  respondentEmail?: string;
  /** Honeypot field — any content means a bot; drop silently. */
  website?: string;
  answers: Array<{
    itemId: string;
    valueText?: string;
    valueBool?: boolean;
    valueChoice?: string;
  }>;
  files: Array<{
    itemId: string;
    key: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}

export interface SubmissionDeps {
  email: EmailAdapter;
  /** Absolute base URL for the internal responses link in the email. */
  appBaseUrl: string;
  ownerEmail?: string;
}

/**
 * Writes IntakeResponse + Answers + Documents in one transaction, then
 * emails Jacob. Returns null for honeypot hits (the caller answers 200 and
 * nothing is written).
 */
export async function submitIntake(
  resolved: ResolvedIntake,
  deps: SubmissionDeps,
  input: SubmissionInput
) {
  if (input.website && input.website.trim() !== "") return null;
  if (resolved.form.status !== "OPEN") {
    throw new DomainRuleError("This intake isn't accepting responses.");
  }

  const { db, tenantId, form } = resolved;
  const items = await db.intakeItem.findMany({ where: { formId: form.id } });
  const byId = new Map(items.map((i) => [i.id, i]));

  const answers = input.answers.filter((a) => byId.has(a.itemId));
  const files = input.files.filter((f) => byId.get(f.itemId)?.kind === "FILE_REQUEST");

  for (const item of items) {
    if (!item.required) continue;
    if (item.kind === "FILE_REQUEST") {
      if (!files.some((f) => f.itemId === item.id)) {
        throw new DomainRuleError(`"${item.prompt}" needs at least one file.`);
      }
      continue;
    }
    const answer = answers.find((a) => a.itemId === item.id);
    const answered =
      answer &&
      (item.kind === "YES_NO"
        ? typeof answer.valueBool === "boolean"
        : item.kind === "CHOICE"
          ? Boolean(answer.valueChoice)
          : Boolean(answer.valueText?.trim()));
    if (!answered) {
      throw new DomainRuleError(`"${item.prompt}" needs an answer.`);
    }
  }
  for (const answer of answers) {
    const item = byId.get(answer.itemId)!;
    if (
      item.kind === "CHOICE" &&
      answer.valueChoice &&
      !item.choices.includes(answer.valueChoice)
    ) {
      throw new DomainRuleError(`"${answer.valueChoice}" isn't one of the options.`);
    }
  }

  const response = await db.$transaction(async (tx) => {
    const created = await tx.intakeResponse.create({
      data: scopedData({
        formId: form.id,
        submittedAt: new Date(),
        respondentName: input.respondentName?.trim() || null,
        respondentEmail: input.respondentEmail?.trim() || null,
      }),
    });
    if (answers.length > 0) {
      await tx.intakeAnswer.createMany({
        data: answers.map((a) => {
          const item = byId.get(a.itemId)!;
          return scopedData({
            responseId: created.id,
            itemId: a.itemId,
            valueText:
              item.kind === "SHORT_TEXT" || item.kind === "LONG_TEXT"
                ? a.valueText?.trim() || null
                : null,
            valueBool: item.kind === "YES_NO" ? (a.valueBool ?? null) : null,
            valueChoice: item.kind === "CHOICE" ? (a.valueChoice ?? null) : null,
          });
        }),
      });
    }
    for (const file of files) {
      await registerUpload(tx as unknown as ScopedDb, tenantId, {
        projectId: form.projectId,
        key: file.key,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        source: "CLIENT_INTAKE",
        intakeResponseId: created.id,
        intakeItemId: file.itemId,
      });
    }
    return created;
  });

  if (deps.ownerEmail) {
    const [project, count] = await Promise.all([
      db.project.findUnique({
        where: { id: form.projectId },
        select: { name: true, id: true },
      }),
      db.intakeResponse.count({ where: { formId: form.id } }),
    ]);
    const who = input.respondentName?.trim() || "Someone";
    const fromLine = input.respondentEmail?.trim()
      ? `${who} (${input.respondentEmail.trim()})`
      : who;
    await deps.email.send({
      to: deps.ownerEmail,
      subject: `New intake response — ${form.title}`,
      heading: "New intake response",
      paragraphs: [
        `${fromLine} just responded to "${form.title}"${project ? ` on ${project.name}` : ""}.`,
        `That makes ${count} response${count === 1 ? "" : "s"} so far.`,
      ],
      button: {
        label: "See the response",
        url: `${deps.appBaseUrl}/projects/${form.projectId}/intake/${form.id}`,
      },
    });
  }

  return response;
}

export type IntakeItemRow = Prisma.IntakeItemGetPayload<object>;

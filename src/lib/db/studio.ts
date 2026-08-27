// KS-03 service layer: everything the Clients/Projects UI mutates, as pure
// functions over a tenant-scoped client. The "use server" actions in
// src/app are thin wrappers that derive the scoped client from the session
// and call these — which is what makes the acceptance tests possible at the
// unit level with two-tenant fixtures.
import type { ClientStatus, MilestoneOwner, ProjectStatus } from "@prisma/client";
import { scopedData, type ScopedDb } from "./scoped";
import { DomainRuleError } from "./domain";

/** Thrown when an id does not resolve inside the caller's tenant scope. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

// KS-03 DECISION: dedupe walks -2, -3, ... within the tenant (the slug is
// unique per [tenantId, slug]); the scoped findFirst makes the check
// tenant-confined for free.
async function uniqueSlug(
  exists: (slug: string) => Promise<boolean>,
  name: string
): Promise<string> {
  const base = slugify(name);
  if (!(await exists(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface ClientInput {
  name: string;
  status?: ClientStatus;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateClientInput(input: ClientInput) {
  if (!input.name || input.name.trim() === "") {
    throw new DomainRuleError("A client needs a name.");
  }
  if (input.contactEmail && !EMAIL_SHAPE.test(input.contactEmail)) {
    throw new DomainRuleError("That email doesn't look like an email.");
  }
}

export async function createClient(db: ScopedDb, input: ClientInput) {
  validateClientInput(input);
  const slug = await uniqueSlug(
    async (s) => (await db.client.findFirst({ where: { slug: s } })) !== null,
    input.name
  );
  return db.client.create({
    data: scopedData({
      name: input.name.trim(),
      slug,
      status: input.status ?? "PROSPECT",
      contactName: input.contactName?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      notes: input.notes?.trim() || null,
    }),
  });
}

export async function updateClient(db: ScopedDb, id: string, input: ClientInput) {
  validateClientInput(input);
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Client");
  return db.client.update({
    where: { id },
    data: {
      name: input.name.trim(),
      status: input.status ?? existing.status,
      contactName: input.contactName?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
}

export async function deleteClient(db: ScopedDb, id: string) {
  const client = await db.client.findUnique({
    where: { id },
    include: { projects: { select: { id: true } } },
  });
  if (!client) throw new NotFoundError("Client");
  if (client.projects.length > 0) {
    throw new DomainRuleError(
      "This client still has projects — delete or move those first."
    );
  }
  return db.client.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProject(
  db: ScopedDb,
  clientId: string,
  input: { name: string; summary?: string }
) {
  if (!input.name || input.name.trim() === "") {
    throw new DomainRuleError("A project needs a name.");
  }
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new NotFoundError("Client");
  const slug = await uniqueSlug(
    async (s) => (await db.project.findFirst({ where: { slug: s } })) !== null,
    input.name
  );
  return db.project.create({
    data: scopedData({
      clientId,
      name: input.name.trim(),
      slug,
      summary: input.summary?.trim() || null,
    }),
  });
}

export async function setProjectStatus(
  db: ScopedDb,
  id: string,
  status: ProjectStatus
) {
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new NotFoundError("Project");
  return db.project.update({ where: { id }, data: { status } });
}

export async function updateProjectSummary(
  db: ScopedDb,
  id: string,
  summary: string
) {
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new NotFoundError("Project");
  return db.project.update({
    where: { id },
    data: { summary: summary.trim() || null },
  });
}

// KS-03 DECISION: project delete isn't in §5, but the manual cleanup path
// (§7.11: milestones → phases → project → client) needs it. Same guard
// pattern as client delete: only when the project has zero phases.
export async function deleteProject(db: ScopedDb, id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: { phases: { select: { id: true } } },
  });
  if (!project) throw new NotFoundError("Project");
  if (project.phases.length > 0) {
    throw new DomainRuleError(
      "This project still has build stages — delete those first."
    );
  }
  return db.project.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export async function addPhase(db: ScopedDb, projectId: string, name: string) {
  if (!name || name.trim() === "") {
    throw new DomainRuleError("A build stage needs a name.");
  }
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError("Project");
  return db.$transaction(async (tx) => {
    const last = await tx.phase.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    return tx.phase.create({
      data: scopedData({
        projectId,
        name: name.trim(),
        order: (last?.order ?? 0) + 1,
      }),
    });
  });
}

export async function renamePhase(db: ScopedDb, id: string, name: string) {
  if (!name || name.trim() === "") {
    throw new DomainRuleError("A build stage needs a name.");
  }
  const phase = await db.phase.findUnique({ where: { id } });
  if (!phase) throw new NotFoundError("Build stage");
  return db.phase.update({ where: { id }, data: { name: name.trim() } });
}

export async function setPhaseVisibility(
  db: ScopedDb,
  id: string,
  visibleToClient: boolean
) {
  const phase = await db.phase.findUnique({ where: { id } });
  if (!phase) throw new NotFoundError("Build stage");
  return db.phase.update({ where: { id }, data: { visibleToClient } });
}

/**
 * Swaps a phase with its neighbor. @@unique([projectId, order]) is
 * immediate in Postgres, so the swap parks the moving phase on its order's
 * negative (never a live value — appends start at 1) before the neighbor
 * slides over; all inside one transaction.
 */
export async function movePhase(db: ScopedDb, id: string, direction: "up" | "down") {
  return db.$transaction(async (tx) => {
    const phase = await tx.phase.findUnique({ where: { id } });
    if (!phase) throw new NotFoundError("Build stage");
    const neighbor = await tx.phase.findFirst({
      where: {
        projectId: phase.projectId,
        order: direction === "up" ? { lt: phase.order } : { gt: phase.order },
      },
      orderBy: { order: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbor) return phase; // already at the edge — no-op

    await tx.phase.update({ where: { id: phase.id }, data: { order: -phase.order } });
    await tx.phase.update({ where: { id: neighbor.id }, data: { order: phase.order } });
    return tx.phase.update({ where: { id: phase.id }, data: { order: neighbor.order } });
  });
}

export async function deletePhase(db: ScopedDb, id: string) {
  const phase = await db.phase.findUnique({
    where: { id },
    include: { milestones: { select: { id: true } } },
  });
  if (!phase) throw new NotFoundError("Build stage");
  if (phase.milestones.length > 0) {
    throw new DomainRuleError(
      "This stage still has milestones — delete those first."
    );
  }
  return db.phase.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  title: string;
  dueOn: Date;
  ownedBy?: MilestoneOwner;
  note?: string;
}

export async function addMilestone(
  db: ScopedDb,
  phaseId: string,
  input: MilestoneInput
) {
  if (!input.title || input.title.trim() === "") {
    throw new DomainRuleError("A milestone needs a title.");
  }
  if (!(input.dueOn instanceof Date) || isNaN(input.dueOn.getTime())) {
    throw new DomainRuleError("A milestone needs a due date.");
  }
  const phase = await db.phase.findUnique({ where: { id: phaseId } });
  if (!phase) throw new NotFoundError("Build stage");
  return db.milestone.create({
    data: scopedData({
      phaseId,
      title: input.title.trim(),
      dueOn: input.dueOn,
      ownedBy: input.ownedBy ?? "JACOB",
      note: input.note?.trim() || null,
    }),
  });
}

export async function setMilestoneDone(db: ScopedDb, id: string, done: boolean) {
  const milestone = await db.milestone.findUnique({ where: { id } });
  if (!milestone) throw new NotFoundError("Milestone");
  return db.milestone.update({
    where: { id },
    data: { doneAt: done ? new Date() : null },
  });
}

export async function deleteMilestone(db: ScopedDb, id: string) {
  const milestone = await db.milestone.findUnique({ where: { id } });
  if (!milestone) throw new NotFoundError("Milestone");
  return db.milestone.delete({ where: { id } });
}

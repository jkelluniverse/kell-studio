// What a client sees (KS-06). Every read here takes the scoped client AND
// the session's clientId, and every query carries both: a portal user sees
// their client's projects, the phases marked visible, the documents marked
// visible, and the project threads — nothing else. The BLOCKED phase state
// is translated to "Waiting" here, in the payload, so the blocked note never
// exists in anything the portal renders.
import type { PhaseStatus, ProjectStatus } from "@prisma/client";
import type { EmailAdapter } from "@/adapters/email/types";
import type { StorageAdapter } from "@/adapters/storage/types";
import { NAME_OWNER } from "@/lib/brand";
import { scopedData, type ScopedDb } from "./scoped";
import { DomainRuleError } from "./domain";
import { NotFoundError } from "./studio";
import {
  documentUrl,
  prepareUpload,
  registerUpload,
  type RegisterUploadInput,
  type UploadRequest,
} from "./files";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type PortalPhaseStatus = "NOT_STARTED" | "IN_PROGRESS" | "WAITING" | "DONE";

export const PORTAL_PHASE_LABEL: Record<PortalPhaseStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  DONE: "Done",
};

export const PORTAL_PROJECT_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "In progress",
  PAUSED: "Paused",
  DONE: "Done",
  ARCHIVED: "Archived",
};

export function toPortalPhaseStatus(status: PhaseStatus): PortalPhaseStatus {
  return status === "BLOCKED" ? "WAITING" : status;
}

/** "Stage 2 of 4 — In progress", over the phases the client can see. */
export function progressLine(phases: { status: PortalPhaseStatus }[]): string {
  if (phases.length === 0) return "Getting started";
  const current = phases.findIndex((p) => p.status !== "DONE");
  if (current === -1) return `All ${phases.length} stages done`;
  return `Stage ${current + 1} of ${phases.length} — ${PORTAL_PHASE_LABEL[phases[current]!.status]}`;
}

export const MAX_MESSAGE_CHARS = 5000;
export const NOTICE_BATCH_MINUTES = 10;

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface PortalProjectCard {
  id: string;
  name: string;
  status: ProjectStatus;
  statusLabel: string;
  progress: string;
}

export interface PortalPhase {
  id: string;
  name: string;
  status: PortalPhaseStatus;
  label: string;
  current: boolean;
}

export interface PortalActionItem {
  id: string;
  title: string;
  dueOn: Date;
  note: string | null;
  phaseName: string;
}

export interface PortalFile {
  id: string;
  title: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
  fromClient: boolean;
}

export interface ThreadMessage {
  id: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  authorId: string;
  authorName: string;
  from: "OWNER" | "CLIENT";
}

export interface PortalProjectPayload {
  id: string;
  name: string;
  clientName: string;
  status: ProjectStatus;
  statusLabel: string;
  progress: string;
  phases: PortalPhase[];
  actionItems: PortalActionItem[];
  files: PortalFile[];
  messages: ThreadMessage[];
}

// KS-06 DECISION: archived projects are not in the portal at all (a client
// has no reason to see a shelf); paused and done projects stay, labelled.
const PORTAL_PROJECT_FILTER = { status: { not: "ARCHIVED" as const } };

export async function portalProjects(
  db: ScopedDb,
  clientId: string
): Promise<PortalProjectCard[]> {
  const projects = await db.project.findMany({
    where: { clientId, ...PORTAL_PROJECT_FILTER },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      phases: {
        where: { visibleToClient: true },
        orderBy: { order: "asc" },
        select: { status: true },
      },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    statusLabel: PORTAL_PROJECT_LABEL[p.status],
    progress: progressLine(p.phases.map((ph) => ({ status: toPortalPhaseStatus(ph.status) }))),
  }));
}

export function threadMessage(m: {
  id: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  author: { id: string; name: string | null; email: string; role: string };
}): ThreadMessage {
  const from = m.author.role === "OWNER" ? "OWNER" : "CLIENT";
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    readAt: m.readAt,
    authorId: m.author.id,
    authorName: from === "OWNER" ? NAME_OWNER : (m.author.name ?? m.author.email),
    from,
  };
}

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  readAt: true,
  author: { select: { id: true, name: true, email: true, role: true } },
} as const;

/** The whole project view in one read; null when it isn't this client's. */
export async function portalProject(
  db: ScopedDb,
  clientId: string,
  projectId: string
): Promise<PortalProjectPayload | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, clientId, ...PORTAL_PROJECT_FILTER },
    select: {
      id: true,
      name: true,
      status: true,
      client: { select: { name: true } },
      phases: {
        where: { visibleToClient: true },
        orderBy: { order: "asc" },
        // No blockedNote here — by construction, not by omission in the UI.
        select: {
          id: true,
          name: true,
          status: true,
          milestones: {
            where: { doneAt: null, ownedBy: "CLIENT" },
            orderBy: { dueOn: "asc" },
            select: { id: true, title: true, dueOn: true, note: true },
          },
        },
      },
      documents: {
        where: { visibleToClient: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          source: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" }, select: MESSAGE_SELECT },
    },
  });
  if (!project) return null;

  const statuses = project.phases.map((p) => toPortalPhaseStatus(p.status));
  const currentIdx = statuses.findIndex((s) => s !== "DONE");
  return {
    id: project.id,
    name: project.name,
    clientName: project.client.name,
    status: project.status,
    statusLabel: PORTAL_PROJECT_LABEL[project.status],
    progress: progressLine(statuses.map((status) => ({ status }))),
    phases: project.phases.map((p, i) => ({
      id: p.id,
      name: p.name,
      status: statuses[i]!,
      label: PORTAL_PHASE_LABEL[statuses[i]!],
      current: i === currentIdx,
    })),
    actionItems: project.phases.flatMap((p) =>
      p.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        dueOn: m.dueOn,
        note: m.note,
        phaseName: p.name,
      }))
    ),
    files: project.documents.map((d) => ({
      id: d.id,
      title: d.title,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
      fromClient: d.source === "CLIENT_INTAKE" || d.source === "CLIENT_PORTAL",
    })),
    messages: project.messages.map(threadMessage),
  };
}

/** The internal side's view of the same thread. */
export async function projectThread(db: ScopedDb, projectId: string): Promise<ThreadMessage[]> {
  const rows = await db.projectMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: MESSAGE_SELECT,
  });
  return rows.map(threadMessage);
}

async function requireClientProject(db: ScopedDb, clientId: string, projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, clientId, ...PORTAL_PROJECT_FILTER },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
  });
  if (!project) throw new NotFoundError("Project");
  return project;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface NoticeDeps {
  email: EmailAdapter;
  appBaseUrl: string;
  ownerEmail?: string;
}

export async function portalPrepareUpload(
  db: ScopedDb,
  tenantId: string,
  clientId: string,
  storage: StorageAdapter,
  input: UploadRequest
) {
  await requireClientProject(db, clientId, input.projectId);
  return prepareUpload(db, tenantId, storage, input);
}

/** Registers a client's upload (source CLIENT_PORTAL, visible) and tells Jacob. */
export async function portalRegisterUpload(
  db: ScopedDb,
  tenantId: string,
  clientId: string,
  uploader: { name: string | null; email: string },
  deps: NoticeDeps,
  input: Omit<RegisterUploadInput, "source" | "intakeResponseId" | "intakeItemId">
) {
  const project = await requireClientProject(db, clientId, input.projectId);
  const doc = await registerUpload(db, tenantId, { ...input, source: "CLIENT_PORTAL" });
  if (deps.ownerEmail) {
    await deps.email.send({
      to: deps.ownerEmail,
      subject: `New file from ${project.client.name} — ${project.name}`,
      heading: `${uploader.name ?? uploader.email} added a file`,
      paragraphs: [`"${input.filename}" is in the vault for ${project.name}.`],
      button: { label: "Open the project", url: `${deps.appBaseUrl}/projects/${project.id}` },
    });
  }
  return doc;
}

export async function portalDocumentUrl(
  db: ScopedDb,
  storage: StorageAdapter,
  clientId: string,
  documentId: string,
  opts: { download?: boolean } = {}
): Promise<string> {
  const doc = await db.document.findFirst({
    where: { id: documentId, visibleToClient: true, project: { clientId, ...PORTAL_PROJECT_FILTER } },
    select: { id: true },
  });
  if (!doc) throw new NotFoundError("File");
  return documentUrl(db, storage, doc.id, opts);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Posts to a project thread and emails the other side — unless this author
 * already triggered a notice on this thread in the last ten minutes.
 */
export async function postProjectMessage(
  db: ScopedDb,
  deps: NoticeDeps,
  input: { projectId: string; authorId: string; body: string }
) {
  const body = input.body.trim();
  if (!body) throw new DomainRuleError("A message needs some words.");
  if (body.length > MAX_MESSAGE_CHARS) {
    throw new DomainRuleError(
      `Keep a message under ${MAX_MESSAGE_CHARS.toLocaleString("en-US")} characters — anything bigger belongs in Files.`
    );
  }
  const author = await db.user.findUnique({
    where: { id: input.authorId },
    select: { id: true, role: true, name: true, email: true, clientId: true, disabledAt: true },
  });
  if (!author || author.disabledAt) throw new NotFoundError("User");
  const fromClient = author.role === "CLIENT";
  if (fromClient && !author.clientId) throw new NotFoundError("Project");
  const project = fromClient
    ? await requireClientProject(db, author.clientId!, input.projectId)
    : await db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true, client: { select: { id: true, name: true } } },
      });
  if (!project) throw new NotFoundError("Project");

  const message = await db.projectMessage.create({
    data: scopedData({ projectId: project.id, authorId: author.id, body }),
  });

  const since = new Date(Date.now() - NOTICE_BATCH_MINUTES * 60_000);
  const recentNotice = await db.projectMessage.findFirst({
    where: { projectId: project.id, authorId: author.id, noticedAt: { gt: since } },
    select: { id: true },
  });
  if (recentNotice) return { message, noticed: false as const };

  let recipients: string[];
  if (fromClient) {
    recipients = deps.ownerEmail ? [deps.ownerEmail] : [];
  } else {
    // KS-06 DECISION: §5 says "the client user's email"; a client may have
    // more than one portal user, and every active one is a party to the
    // thread, so each gets the notice.
    const users = await db.user.findMany({
      where: { clientId: project.client.id, role: "CLIENT", disabledAt: null },
      select: { email: true },
    });
    recipients = users.map((u) => u.email);
  }
  if (recipients.length === 0) return { message, noticed: false as const };

  const fromName = fromClient ? (author.name ?? author.email) : NAME_OWNER;
  const url = fromClient
    ? `${deps.appBaseUrl}/projects/${project.id}#messages`
    : `${deps.appBaseUrl}/portal/projects/${project.id}#messages`;
  for (const to of recipients) {
    await deps.email.send({
      to,
      subject: `New message on ${project.name}`,
      heading: `${fromName} wrote on ${project.name}`,
      paragraphs: [body],
      button: { label: "Open the thread", url },
    });
  }
  await db.projectMessage.update({ where: { id: message.id }, data: { noticedAt: new Date() } });
  return { message, noticed: true as const };
}

/**
 * Marks the other side's messages read. For a CLIENT reader the clientId
 * confines the write to their own projects.
 */
export async function markThreadRead(
  db: ScopedDb,
  projectId: string,
  reader: { role: "OWNER" } | { role: "CLIENT"; clientId: string }
) {
  const otherRole = reader.role === "OWNER" ? "CLIENT" : "OWNER";
  return db.projectMessage.updateMany({
    where: {
      projectId,
      readAt: null,
      author: { role: otherRole },
      ...(reader.role === "CLIENT" ? { project: { clientId: reader.clientId } } : {}),
    },
    data: { readAt: new Date() },
  });
}

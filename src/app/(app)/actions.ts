"use server";

// Thin server-action wrappers over the src/lib/db service layer. Each one:
// derives the tenant from the session (requireScopedDb), calls the tested
// service function, revalidates, and turns domain errors into plain
// sentences. No business logic lives here.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClientStatus, PhaseStatus, ProjectStatus } from "@prisma/client";
import {
  createClient,
  updateClient,
  deleteClient,
  createProject,
  setProjectStatus,
  updateProjectSummary,
  deleteProject,
  addPhase,
  renamePhase,
  setPhaseVisibility,
  movePhase,
  deletePhase,
  addMilestone,
  setMilestoneDone,
  deleteMilestone,
  setPhaseStatus,
  CitationRequiredError,
  RationaleRequiredError,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { requireScopedDb } from "@/lib/session";

export type ActionState = { error?: string };

function messageOf(err: unknown): string {
  if (
    err instanceof DomainRuleError ||
    err instanceof NotFoundError ||
    err instanceof RationaleRequiredError ||
    err instanceof CitationRequiredError
  ) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function clientInputFrom(formData: FormData) {
  return {
    name: str(formData, "name"),
    status: (str(formData, "status") || "PROSPECT") as ClientStatus,
    contactName: str(formData, "contactName"),
    contactEmail: str(formData, "contactEmail"),
    contactPhone: str(formData, "contactPhone"),
    notes: str(formData, "notes"),
  };
}

// --- Clients ---------------------------------------------------------------

export async function createClientAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const db = await requireScopedDb();
  let id: string;
  try {
    const client = await createClient(db, clientInputFrom(formData));
    id = client.id;
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/clients/${id}`);
}

export async function updateClientAction(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await updateClient(db, id, clientInputFrom(formData));
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/clients/${id}`);
}

export async function deleteClientAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await deleteClient(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect("/clients");
}

// --- Projects --------------------------------------------------------------

export async function createProjectAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const db = await requireScopedDb();
  let id: string;
  try {
    const project = await createProject(db, clientId, {
      name: str(formData, "name"),
      summary: str(formData, "summary"),
    });
    id = project.id;
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/projects/${id}`);
}

export async function setProjectStatusAction(
  id: string,
  status: ProjectStatus
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await setProjectStatus(db, id, status);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function updateProjectSummaryAction(
  id: string,
  summary: string
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await updateProjectSummary(db, id, summary);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteProjectAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  let clientId: string;
  try {
    const project = await db.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundError("Project");
    clientId = project.clientId;
    await deleteProject(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/clients/${clientId}`);
}

// --- Phases ----------------------------------------------------------------

export async function addPhaseAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await addPhase(db, projectId, str(formData, "name"));
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function renamePhaseAction(
  id: string,
  name: string
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await renamePhase(db, id, name);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setPhaseStatusAction(
  id: string,
  status: PhaseStatus,
  blockedNote?: string
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await setPhaseStatus(db, id, status, blockedNote);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function movePhaseAction(
  id: string,
  direction: "up" | "down"
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await movePhase(db, id, direction);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setPhaseVisibilityAction(
  id: string,
  visibleToClient: boolean
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await setPhaseVisibility(db, id, visibleToClient);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deletePhaseAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await deletePhase(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

// --- Milestones ------------------------------------------------------------

export async function addMilestoneAction(
  phaseId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    const dueRaw = str(formData, "dueOn");
    await addMilestone(db, phaseId, {
      title: str(formData, "title"),
      dueOn: new Date(`${dueRaw}T00:00:00Z`),
      ownedBy: str(formData, "ownedBy") === "CLIENT" ? "CLIENT" : "JACOB",
      note: str(formData, "note"),
    });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setMilestoneDoneAction(
  id: string,
  done: boolean
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await setMilestoneDone(db, id, done);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteMilestoneAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await deleteMilestone(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

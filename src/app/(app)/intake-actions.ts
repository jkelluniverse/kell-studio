"use server";

// Intake builder server actions — thin wrappers, same discipline as
// actions.ts.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IntakeItemKind } from "@prisma/client";
import {
  createIntakeForm,
  updateIntakeForm,
  addIntakeItem,
  updateIntakeItem,
  deleteIntakeItem,
  moveIntakeItem,
  openIntakeForm,
  closeIntakeForm,
  deleteIntakeForm,
  deleteIntakeResponse,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { ActionState } from "./actions";

function messageOf(err: unknown): string {
  if (err instanceof DomainRuleError || err instanceof NotFoundError) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

export async function createIntakeFormAction(
  projectId: string
): Promise<ActionState> {
  const { db } = await requireSession();
  let id: string;
  try {
    const form = await createIntakeForm(db, projectId, { title: "New intake" });
    id = form.id;
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/projects/${projectId}/intake/${id}`);
}

export async function updateIntakeFormAction(
  id: string,
  input: { title?: string; intro?: string }
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await updateIntakeForm(db, id, input);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export interface ItemFields {
  kind: IntakeItemKind;
  prompt: string;
  required: boolean;
  choices: string[];
}

export async function addIntakeItemAction(
  formId: string,
  input: ItemFields
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await addIntakeItem(db, formId, input);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function updateIntakeItemAction(
  itemId: string,
  input: ItemFields
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await updateIntakeItem(db, itemId, input);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteIntakeItemAction(itemId: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await deleteIntakeItem(db, itemId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function moveIntakeItemAction(
  itemId: string,
  direction: "up" | "down"
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await moveIntakeItem(db, itemId, direction);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function openIntakeFormAction(id: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await openIntakeForm(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function closeIntakeFormAction(id: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await closeIntakeForm(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteIntakeFormAction(id: string): Promise<ActionState> {
  const { db } = await requireSession();
  let projectId: string;
  try {
    const form = await db.intakeForm.findUnique({ where: { id } });
    if (!form) throw new NotFoundError("Intake form");
    projectId = form.projectId;
    await deleteIntakeForm(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  redirect(`/projects/${projectId}`);
}

export async function deleteIntakeResponseAction(id: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await deleteIntakeResponse(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

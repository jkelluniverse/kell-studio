"use server";

import { revalidatePath } from "next/cache";
import type { FactKind } from "@prisma/client";
import {
  confirmFact,
  retireFact,
  unretireFact,
  discardProposedFact,
  editProposedFact,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { requireScopedDb } from "@/lib/session";
import type { ActionState } from "./actions";

function messageOf(err: unknown): string {
  if (err instanceof DomainRuleError || err instanceof NotFoundError) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

export async function confirmFactAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await confirmFact(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function editConfirmFactAction(
  id: string,
  input: { body: string; kind: FactKind }
): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await editProposedFact(db, id, input);
    await confirmFact(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function discardFactAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await discardProposedFact(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function retireFactAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await retireFact(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function unretireFactAction(id: string): Promise<ActionState> {
  const db = await requireScopedDb();
  try {
    await unretireFact(db, id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

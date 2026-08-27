"use server";

// Vault server actions — thin wrappers, same discipline as actions.ts.
import { revalidatePath } from "next/cache";
import { getStorage } from "@/adapters/storage";
import {
  prepareUpload,
  registerUpload,
  renameDocument,
  deleteDocument,
  documentUrl,
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

export interface UploadTicket {
  key?: string;
  url?: string;
  error?: string;
}

export async function prepareUploadAction(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadTicket> {
  const { db, tenantId } = await requireSession();
  try {
    return await prepareUpload(db, tenantId, getStorage(), input);
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function registerUploadAction(input: {
  projectId: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionState> {
  const { db, tenantId } = await requireSession();
  try {
    await registerUpload(db, tenantId, input);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function renameDocumentAction(
  id: string,
  title: string
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await renameDocument(db, id, title);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function deleteDocumentAction(id: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await deleteDocument(db, getStorage(), id);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function documentUrlAction(
  id: string,
  opts: { download?: boolean } = {}
): Promise<{ url?: string; error?: string }> {
  const { db } = await requireSession();
  try {
    return { url: await documentUrl(db, getStorage(), id, opts) };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

"use server";

// Internal-side portal administration (KS-06): invites, links, revocation,
// the owner's half of the message thread, and file visibility. Thin
// wrappers, same discipline as actions.ts.
import { revalidatePath } from "next/cache";
import {
  invitePortalUser,
  resendPortalLink,
  revokePortalUser,
  restorePortalUser,
  removePortalUser,
  postProjectMessage,
  setDocumentVisibility,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { noticeDeps } from "@/lib/notify";
import { requireSession } from "@/lib/session";
import type { ActionState } from "./actions";

function messageOf(err: unknown): string {
  if (err instanceof DomainRuleError || err instanceof NotFoundError) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function invitePortalUserAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await invitePortalUser(db, noticeDeps(), {
      clientId,
      name: str(formData, "name"),
      email: str(formData, "email"),
    });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function resendPortalLinkAction(userId: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await resendPortalLink(db, noticeDeps(), userId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function revokePortalUserAction(userId: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await revokePortalUser(db, userId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function restorePortalUserAction(userId: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await restorePortalUser(db, userId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function removePortalUserAction(userId: string): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await removePortalUser(db, userId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function postProjectMessageAction(
  projectId: string,
  body: string
): Promise<ActionState> {
  const { db, userId } = await requireSession();
  try {
    await postProjectMessage(db, noticeDeps(), { projectId, authorId: userId, body });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setDocumentVisibilityAction(
  id: string,
  visibleToClient: boolean
): Promise<ActionState> {
  const { db } = await requireSession();
  try {
    await setDocumentVisibility(db, id, visibleToClient);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

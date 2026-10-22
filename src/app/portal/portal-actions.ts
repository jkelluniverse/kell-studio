"use server";

// Portal server actions — thin wrappers over src/lib/db/portal*.ts, same
// discipline as the internal actions: the session decides the tenant and
// the client, never a payload.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { getStorage } from "@/adapters/storage";
import {
  requestLoginLink,
  portalPrepareUpload,
  portalRegisterUpload,
  portalDocumentUrl,
  postProjectMessage,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { noticeDeps } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { requirePortalUser } from "@/lib/session";

export type ActionState = { error?: string };
export type LoginState = { sent?: boolean; error?: string };

function messageOf(err: unknown): string {
  if (err instanceof DomainRuleError || err instanceof NotFoundError) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

/**
 * Always resolves { sent: true } — for an unknown email, a revoked user, or
 * a real one — so the form shows one sentence and never confirms an account.
 */
export async function requestLoginLinkAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const window = { limit: 5, windowMs: 15 * 60_000 };
  if (
    !rateLimit(`portal-login:ip:${ip}`, { ...window, limit: 20 }) ||
    !rateLimit(`portal-login:email:${email}`, window)
  ) {
    return { error: "Too many requests — give it a few minutes and try again." };
  }
  await requestLoginLink(noticeDeps(), email);
  return { sent: true };
}

/** Spends the link and opens the session; redirects to /portal on success. */
export async function consumeLoginLinkAction(token: string): Promise<ActionState> {
  try {
    await signIn("portal-link", { token, redirectTo: "/portal" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "This sign-in link has expired or was already used. Ask for a new one below." };
    }
    throw err; // the success redirect
  }
  return {};
}

export async function portalSignOutAction(): Promise<void> {
  await signOut({ redirectTo: "/portal/login" });
}

export interface UploadTicket {
  key?: string;
  url?: string;
  error?: string;
}

export async function portalPrepareUploadAction(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadTicket> {
  const { db, tenantId, clientId } = await requirePortalUser();
  try {
    return await portalPrepareUpload(db, tenantId, clientId, getStorage(), input);
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function portalRegisterUploadAction(input: {
  projectId: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionState> {
  const { db, tenantId, clientId, name, email } = await requirePortalUser();
  try {
    await portalRegisterUpload(db, tenantId, clientId, { name, email }, noticeDeps(), input);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function portalDocumentUrlAction(
  id: string
): Promise<{ url?: string; error?: string }> {
  const { db, clientId } = await requirePortalUser();
  try {
    return { url: await portalDocumentUrl(db, getStorage(), clientId, id) };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function portalPostMessageAction(
  projectId: string,
  body: string
): Promise<ActionState> {
  const { db, userId } = await requirePortalUser();
  try {
    await postProjectMessage(db, noticeDeps(), { projectId, authorId: userId, body });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

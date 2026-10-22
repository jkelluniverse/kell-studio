import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { activePortalUser, forTenant } from "@/lib/db";

/**
 * The one way internal UI code gets a database handle: tenantId comes from
 * the session, never from a form payload or URL. Owner-only — a CLIENT
 * session gets not-found here, the same answer the middleware gives, so no
 * internal route can confirm its own existence to a portal user.
 */
export async function requireSession() {
  const session = await auth();
  const user = session?.user;
  if (!user?.tenantId) redirect("/login");
  if (user.role !== "OWNER") notFound();
  return { db: forTenant(user.tenantId), tenantId: user.tenantId, userId: user.id };
}

/** Same, for callers that only need the scoped client. */
export async function requireScopedDb() {
  const { db } = await requireSession();
  return db;
}

/**
 * The portal gate (KS-06): a CLIENT session whose user is still active.
 * Revoked or deleted users are signed out on the spot — the cookie is
 * cleared by /portal/signout — and anyone else is sent to the portal login.
 */
export async function requirePortalUser() {
  const session = await auth();
  const user = session?.user;
  if (!user?.tenantId || user.role !== "CLIENT") redirect("/portal/login");
  const active = await activePortalUser(user.tenantId, user.id);
  if (!active) redirect("/portal/signout?ended=1");
  return {
    db: forTenant(user.tenantId),
    tenantId: user.tenantId,
    userId: active.id,
    clientId: active.clientId,
    name: active.name,
    email: active.email,
  };
}

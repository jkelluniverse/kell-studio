import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { forTenant } from "@/lib/db";

/**
 * The one way UI code gets a database handle: tenantId comes from the
 * session, never from a form payload or URL.
 */
export async function requireScopedDb() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  return forTenant(tenantId);
}

/** Same, when the caller also needs the tenantId (e.g. storage keys). */
export async function requireSession() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) redirect("/login");
  return { db: forTenant(tenantId), tenantId };
}

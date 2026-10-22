import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PortalLoginForm } from "@/components/portal-login-form";
import { NAME_CLIENT_PORTAL } from "@/lib/brand";
import { activePortalUser } from "@/lib/db";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ended?: string }>;
}) {
  const [{ ended }, session] = await Promise.all([searchParams, auth()]);
  const user = session?.user;
  if (user?.role === "OWNER") redirect("/home");
  if (user?.role === "CLIENT" && user.tenantId) {
    // Still active → straight in. Revoked → the form, like anyone else.
    if (await activePortalUser(user.tenantId, user.id)) redirect("/portal");
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-16">
      <p className="font-ui text-sm text-navy/60">{NAME_CLIENT_PORTAL}</p>
      <h1 className="mt-2 font-display text-4xl leading-tight text-navy">Sign in</h1>
      {ended === "1" && (
        <p className="mt-4 font-body text-navy/80">
          Your portal access has ended. If that&apos;s a surprise, check with Jacob.
        </p>
      )}
      <p className="mt-4 font-body text-lg leading-relaxed text-navy/80">
        Enter your email and we&apos;ll send you a link. No password to remember.
      </p>
      <PortalLoginForm />
    </main>
  );
}

import Link from "next/link";
import { NAME_CLIENT_PORTAL } from "@/lib/brand";
import { requirePortalUser } from "@/lib/session";
import { portalSignOutAction } from "@/app/portal/portal-actions";

export default async function PortalAuthedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { db, clientId } = await requirePortalUser();
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });

  return (
    <>
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 py-4">
        <Link href="/portal" className="font-display text-lg text-navy">
          {NAME_CLIENT_PORTAL}
        </Link>
        <div className="flex items-center gap-4 font-ui text-sm">
          <span className="hidden text-navy/60 sm:inline">{client?.name}</span>
          <form action={portalSignOutAction}>
            <button type="submit" className="text-navy/60 hover:text-emerald">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-4">{children}</main>
    </>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/auth";
import { NAME_STUDIO } from "@/lib/brand";
import { proposedFactCount } from "@/lib/db";
import { requireScopedDb } from "@/lib/session";
import { CaptureFab } from "@/components/capture-fab";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Owner-only: requireScopedDb answers a CLIENT session with not-found.
  const db = await requireScopedDb();

  const [projects, reviewCount, jar] = await Promise.all([
    db.project.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    proposedFactCount(db),
    cookies(),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
        <Link href="/home" className="font-display text-xl text-navy">
          {NAME_STUDIO}
        </Link>
        <nav className="flex items-center gap-4 font-ui text-sm text-navy">
          <Link href="/home" className="hover:text-emerald">
            Home
          </Link>
          <Link href="/clients" className="hover:text-emerald">
            Clients
          </Link>
          <Link href="/review" className="relative hover:text-emerald">
            Review
            {reviewCount > 0 && (
              <span className="absolute -right-3 -top-2 rounded-full bg-emerald px-1.5 font-ui text-[10px] text-white">
                {reviewCount}
              </span>
            )}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-navy/60 hover:text-emerald">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
      <CaptureFab
        projects={projects.map((p) => ({
          id: p.id,
          label: `${p.client.name} — ${p.name}`,
        }))}
        defaultProjectId={jar.get("lastProjectId")?.value}
      />
    </div>
  );
}

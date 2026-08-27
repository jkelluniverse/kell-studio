import Link from "next/link";
import { requireScopedDb } from "@/lib/session";

const GROUPS = ["ACTIVE", "PROSPECT", "PAST"] as const;
const GROUP_LABEL = { ACTIVE: "Active", PROSPECT: "Prospects", PAST: "Past" };

export default async function ClientsPage() {
  const db = await requireScopedDb();
  const clients = await db.client.findMany({
    include: { projects: { select: { status: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-navy">Clients</h1>
        <Link
          href="/clients/new"
          className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white"
        >
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <p className="mt-6 font-body text-navy">No clients yet.</p>
      ) : (
        GROUPS.map((group) => {
          const rows = clients.filter((c) => c.status === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className="mt-8">
              <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
                {GROUP_LABEL[group]}
              </h2>
              <ul className="mt-2 divide-y divide-navy/10">
                {rows.map((client) => {
                  const active = client.projects.filter(
                    (p) => p.status === "ACTIVE"
                  ).length;
                  const summary =
                    client.projects.length === 0
                      ? "No projects"
                      : `${active} active project${active === 1 ? "" : "s"}`;
                  return (
                    <li key={client.id}>
                      <Link href={`/clients/${client.id}`} className="block py-3">
                        <span className="font-ui text-navy">{client.name}</span>
                        <span className="block font-body text-sm text-navy/60">
                          {summary}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

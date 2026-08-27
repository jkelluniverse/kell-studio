import Link from "next/link";
import { SIGNATURE } from "@/lib/brand";
import { requireScopedDb } from "@/lib/session";

// Placeholder screen — KS-06 replaces it. Keep under 50 lines.
export default async function HomePage() {
  const db = await requireScopedDb();
  const projects = await db.project.findMany({
    where: { status: "ACTIVE" },
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex min-h-full flex-col">
      <h1 className="font-display text-4xl text-navy">Where I Left Off</h1>
      {projects.length === 0 ? (
        <p className="mt-6 font-body text-navy">
          No projects yet.{" "}
          <Link href="/clients/new" className="text-emerald underline underline-offset-2">
            Start with a client.
          </Link>
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-navy/10">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="block py-3 font-body text-navy hover:text-emerald"
              >
                {p.client.name} — {p.name} —{" "}
                <span className="font-ui text-sm">{p.status.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <footer className="mt-auto pt-12 font-ui text-sm text-navy">{SIGNATURE}</footer>
    </div>
  );
}

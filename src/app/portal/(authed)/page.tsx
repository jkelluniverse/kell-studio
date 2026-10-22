import Link from "next/link";
import { redirect } from "next/navigation";
import { portalProjects } from "@/lib/db";
import { requirePortalUser } from "@/lib/session";

export default async function PortalHome() {
  const { db, clientId, name } = await requirePortalUser();
  const projects = await portalProjects(db, clientId);

  // One project: skip the list and open it.
  if (projects.length === 1) redirect(`/portal/projects/${projects[0]!.id}`);

  return (
    <div>
      <h1 className="font-display text-3xl leading-tight text-navy">
        {name ? `Hello, ${name.split(" ")[0]}.` : "Hello."}
      </h1>
      {projects.length === 0 ? (
        <p className="mt-6 font-body text-lg leading-relaxed text-navy/80">
          Nothing to show yet. Your project will appear here once it&apos;s set
          up.
        </p>
      ) : (
        <>
          <p className="mt-2 font-body text-navy/60">Your projects</p>
          <ul className="mt-6 flex flex-col gap-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/portal/projects/${p.id}`}
                  className="block rounded-lg border border-navy/15 bg-white/60 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-display text-xl text-navy">{p.name}</span>
                    <span className="mt-1 shrink-0 font-ui text-xs text-navy/60">
                      {p.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 font-body text-navy/70">{p.progress}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

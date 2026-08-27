import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteClientAction } from "@/app/(app)/actions";
import { ActionButton } from "@/components/action-button";
import { requireScopedDb } from "@/lib/session";
import { PHASE_LABEL, fmtDate } from "@/lib/format";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await requireScopedDb();
  const client = await db.client.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { createdAt: "asc" },
        include: {
          phases: {
            orderBy: { order: "asc" },
            include: { milestones: { orderBy: { dueOn: "asc" } } },
          },
        },
      },
    },
  });
  if (!client) notFound();

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-navy">{client.name}</h1>
          <span className="mt-1 inline-block rounded-full border border-navy/20 px-2 py-0.5 font-ui text-xs text-navy">
            {client.status.charAt(0) + client.status.slice(1).toLowerCase()}
          </span>
        </div>
        <Link
          href={`/clients/${client.id}/edit`}
          className="font-ui text-sm text-emerald underline underline-offset-2"
        >
          Edit
        </Link>
      </div>

      {(client.contactName || client.contactEmail || client.contactPhone) && (
        <div className="mt-4 font-body text-sm text-navy">
          {client.contactName && <p>{client.contactName}</p>}
          {client.contactEmail && <p>{client.contactEmail}</p>}
          {client.contactPhone && <p>{client.contactPhone}</p>}
        </div>
      )}
      {client.notes && (
        <p className="mt-3 whitespace-pre-wrap font-body text-sm text-navy/80">
          {client.notes}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
          Projects
        </h2>
        <Link
          href={`/clients/${client.id}/projects/new`}
          className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white"
        >
          New project
        </Link>
      </div>

      {client.projects.length === 0 ? (
        <p className="mt-4 font-body text-navy">No projects yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {client.projects.map((project) => {
            const phases = project.phases;
            const currentIdx = phases.findIndex((p) => p.status !== "DONE");
            const progress =
              phases.length === 0
                ? "No stages yet"
                : currentIdx === -1
                  ? `All ${phases.length} phases done`
                  : `Phase ${currentIdx + 1} of ${phases.length} — ${PHASE_LABEL[phases[currentIdx]!.status]}`;
            const nextDue = phases
              .flatMap((p) => p.milestones)
              .filter((m) => !m.doneAt)
              .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())[0];
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded border border-navy/15 bg-white/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-ui text-navy">{project.name}</span>
                    <span className="font-ui text-xs text-navy/60">
                      {project.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 font-body text-sm text-navy/70">{progress}</p>
                  {nextDue && (
                    <p className="font-body text-sm text-navy/70">
                      Next milestone due {fmtDate(nextDue.dueOn)}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        {client.projects.length === 0 ? (
          <ActionButton
            action={deleteClientAction.bind(null, client.id)}
            label="Delete client"
          />
        ) : (
          <p className="font-body text-xs text-navy/50">
            This client can be deleted once it has no projects.
          </p>
        )}
      </div>
    </div>
  );
}

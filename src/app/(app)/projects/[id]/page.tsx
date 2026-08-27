import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProjectAction } from "@/app/(app)/actions";
import { ActionButton } from "@/components/action-button";
import { AddPhaseForm } from "@/components/add-phase-form";
import { InlineSummary } from "@/components/inline-summary";
import { PhaseCard } from "@/components/phase-card";
import { ProjectStatusSelect } from "@/components/project-status-select";
import { SIGNATURE } from "@/lib/brand";
import { requireScopedDb } from "@/lib/session";

// Later prompts append sections (captures, decisions, documents, AI) to
// this page — keep each section a sibling block under the header.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await requireScopedDb();
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      phases: {
        orderBy: { order: "asc" },
        include: { milestones: { orderBy: { dueOn: "asc" } } },
      },
    },
  });
  if (!project) notFound();

  return (
    <div className="flex min-h-full flex-col">
      <Link
        href={`/clients/${project.client.id}`}
        className="font-ui text-sm text-navy/60 hover:text-emerald"
      >
        {project.client.name}
      </Link>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-navy">{project.name}</h1>
        <ProjectStatusSelect projectId={project.id} status={project.status} />
      </div>

      <section className="mt-5">
        <InlineSummary projectId={project.id} summary={project.summary} />
      </section>

      <section className="mt-8">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
          Build stages
        </h2>
        {project.phases.length === 0 ? (
          <p className="mt-3 font-body text-navy">
            No stages yet. Add the first one below.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {project.phases.map((phase, i) => (
              <PhaseCard
                key={phase.id}
                phase={phase}
                isFirst={i === 0}
                isLast={i === project.phases.length - 1}
              />
            ))}
          </ul>
        )}
        <AddPhaseForm projectId={project.id} />
      </section>

      <section className="mt-10">
        {project.phases.length === 0 ? (
          <ActionButton
            action={deleteProjectAction.bind(null, project.id)}
            label="Delete project"
          />
        ) : (
          <p className="font-body text-xs text-navy/50">
            This project can be deleted once it has no build stages.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-12 font-ui text-sm text-navy">{SIGNATURE}</footer>
    </div>
  );
}

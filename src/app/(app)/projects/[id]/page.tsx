import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProjectAction } from "@/app/(app)/actions";
import { createIntakeFormAction } from "@/app/(app)/intake-actions";
import { ActionButton } from "@/components/action-button";
import { FileVault } from "@/components/file-vault";
import { AddPhaseForm } from "@/components/add-phase-form";
import { CapturesSection } from "@/components/captures-section";
import { FactsSection } from "@/components/facts-section";
import { InlineSummary } from "@/components/inline-summary";
import { PhaseCard } from "@/components/phase-card";
import { ProjectStatusSelect } from "@/components/project-status-select";
import { SIGNATURE } from "@/lib/brand";
import { requireScopedDb } from "@/lib/session";

// Later prompts append sections (captures, decisions, documents, AI) to
// this page — keep each section a sibling block under the header.
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retired?: string }>;
}) {
  const { id } = await params;
  const { retired } = await searchParams;
  const showRetired = retired === "1";
  const db = await requireScopedDb();
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      phases: {
        orderBy: { order: "asc" },
        include: { milestones: { orderBy: { dueOn: "asc" } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      captures: { orderBy: { capturedAt: "desc" }, take: 20 },
      facts: {
        where: { status: showRetired ? { in: ["CONFIRMED", "RETIRED"] } : "CONFIRMED" },
        orderBy: [{ kind: "asc" }, { confirmedAt: "desc" }],
        include: { citations: { select: { id: true, excerpt: true, captureId: true } } },
      },
      intakeForms: {
        orderBy: { createdAt: "desc" },
        include: { responses: { select: { id: true } } },
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
        <CapturesSection projectId={project.id} captures={project.captures} />
      </section>

      <section className="mt-10">
        <FactsSection
          projectId={project.id}
          facts={project.facts}
          showRetired={showRetired}
        />
      </section>

      <section className="mt-10">
        <FileVault
          projectId={project.id}
          documents={project.documents.map((d) => ({
            id: d.id,
            title: d.title,
            originalName: d.originalName,
            sizeBytes: d.sizeBytes,
            mimeType: d.mimeType,
            source: d.source,
            createdAt: d.createdAt,
          }))}
        />
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
            Intake
          </h2>
          <ActionButton
            action={createIntakeFormAction.bind(null, project.id)}
            label="New intake"
            className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white"
          />
        </div>
        {project.intakeForms.length === 0 ? (
          <p className="mt-3 font-body text-navy">
            No intakes yet. Create one to ask a client for answers and files.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-navy/10">
            {project.intakeForms.map((form) => (
              <li key={form.id}>
                <Link
                  href={`/projects/${project.id}/intake/${form.id}`}
                  className="flex items-center justify-between py-3"
                >
                  <span className="font-ui text-sm text-navy">{form.title}</span>
                  <span className="font-body text-xs text-navy/60">
                    {form.status === "DRAFT"
                      ? "Draft"
                      : form.status === "OPEN"
                        ? "Open"
                        : "Closed"}{" "}
                    · {form.responses.length} response
                    {form.responses.length === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
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

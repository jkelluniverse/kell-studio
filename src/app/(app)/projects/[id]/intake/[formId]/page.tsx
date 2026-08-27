import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteIntakeFormAction,
  deleteIntakeResponseAction,
} from "@/app/(app)/intake-actions";
import { ActionButton } from "@/components/action-button";
import { IntakeBuilder } from "@/components/intake-builder";
import { SIGNATURE } from "@/lib/brand";
import { fmtDate } from "@/lib/format";
import { requireScopedDb } from "@/lib/session";

export default async function IntakeBuilderPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>;
}) {
  const { id: projectId, formId } = await params;
  const db = await requireScopedDb();
  const form = await db.intakeForm.findUnique({
    where: { id: formId },
    include: {
      project: { select: { id: true, name: true } },
      items: { orderBy: { order: "asc" } },
      responses: {
        orderBy: { createdAt: "desc" },
        include: {
          answers: { include: { item: { select: { prompt: true, order: true } } } },
          documents: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!form || form.projectId !== projectId) notFound();

  const base = process.env.AUTH_URL ?? "";
  const shareUrl = `${base.replace(/\/$/, "")}/i/${form.token}`;

  return (
    <div className="flex min-h-full flex-col">
      <Link
        href={`/projects/${form.project.id}`}
        className="font-ui text-sm text-navy/60 hover:text-emerald"
      >
        {form.project.name}
      </Link>

      <div className="mt-2">
        <IntakeBuilder
          form={{
            id: form.id,
            title: form.title,
            intro: form.intro,
            status: form.status,
          }}
          items={form.items.map((i) => ({
            id: i.id,
            kind: i.kind,
            prompt: i.prompt,
            required: i.required,
            choices: i.choices,
          }))}
          shareUrl={shareUrl}
        />
      </div>

      <section className="mt-10">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
          Responses
        </h2>
        {form.responses.length === 0 ? (
          <p className="mt-3 font-body text-navy">
            No responses yet.
            {form.status === "OPEN" && " The link is live — send it out."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-4">
            {form.responses.map((response) => (
              <li key={response.id} className="rounded border border-navy/15 bg-white/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-ui text-sm text-navy">
                      {response.respondentName || "Unnamed"}
                      {response.respondentEmail && (
                        <span className="ml-2 font-body text-xs text-navy/60">
                          {response.respondentEmail}
                        </span>
                      )}
                    </p>
                    {response.submittedAt && (
                      <p className="font-body text-xs text-navy/50">
                        Submitted {fmtDate(response.submittedAt)}
                      </p>
                    )}
                  </div>
                  <ActionButton
                    action={deleteIntakeResponseAction.bind(null, response.id)}
                    label="Delete"
                  />
                </div>
                <dl className="mt-3 flex flex-col gap-2">
                  {response.answers
                    .slice()
                    .sort((a, b) => a.item.order - b.item.order)
                    .map((answer) => (
                      <div key={answer.id}>
                        <dt className="font-ui text-xs text-navy/60">{answer.item.prompt}</dt>
                        <dd className="font-body text-sm text-navy">
                          {answer.valueText ??
                            answer.valueChoice ??
                            (answer.valueBool === null ? "—" : answer.valueBool ? "Yes" : "No")}
                        </dd>
                      </div>
                    ))}
                </dl>
                {response.documents.length > 0 && (
                  <p className="mt-3 font-body text-xs text-navy/60">
                    Files: {response.documents.map((d) => d.title).join(", ")} — in the
                    project&apos;s Files section with the Client chip.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        {form.responses.length === 0 ? (
          <ActionButton
            action={deleteIntakeFormAction.bind(null, form.id)}
            label="Delete intake"
          />
        ) : (
          <p className="font-body text-xs text-navy/50">
            This intake can be deleted once its responses are deleted.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-12 font-ui text-sm text-navy">{SIGNATURE}</footer>
    </div>
  );
}

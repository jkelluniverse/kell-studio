import Link from "next/link";
import type { Fact, FactKind } from "@prisma/client";
import { retireFactAction, unretireFactAction } from "@/app/(app)/review-actions";
import { ActionButton } from "@/components/action-button";
import { FACT_KIND_LABEL } from "@/lib/format";

type FactWithCitations = Fact & {
  citations: Array<{ id: string; excerpt: string | null; captureId: string }>;
};

export function FactsSection({
  projectId,
  facts,
  showRetired,
}: {
  projectId: string;
  facts: FactWithCitations[];
  showRetired: boolean;
}) {
  const kinds = [...new Set(facts.map((f) => f.kind))] as FactKind[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Facts</h2>
        <Link
          href={showRetired ? `/projects/${projectId}` : `/projects/${projectId}?retired=1`}
          className="font-ui text-xs text-navy/50 underline underline-offset-2"
        >
          {showRetired ? "Hide retired" : "Including retired"}
        </Link>
      </div>

      {facts.length === 0 ? (
        <p className="mt-3 font-body text-navy">
          No confirmed facts yet. Captures propose them; you confirm them in Review.
        </p>
      ) : (
        kinds.map((kind) => (
          <div key={kind} className="mt-4">
            <h3 className="font-ui text-xs text-navy/40">{FACT_KIND_LABEL[kind]}</h3>
            <ul className="mt-1 flex flex-col gap-2">
              {facts
                .filter((f) => f.kind === kind)
                .map((fact) => (
                  <li key={fact.id} className="rounded border border-navy/15 bg-white/50 p-3">
                    <details>
                      <summary
                        className={`cursor-pointer font-body text-sm ${
                          fact.status === "RETIRED" ? "text-navy/40 line-through" : "text-navy"
                        }`}
                      >
                        {fact.body}
                      </summary>
                      <div className="mt-2 flex flex-col gap-1">
                        {fact.citations.map((citation) => (
                          <blockquote
                            key={citation.id}
                            className="border-l-2 border-emerald/50 pl-2 font-body text-xs text-navy/60"
                          >
                            {citation.excerpt ? `“${citation.excerpt}” ` : ""}
                            <Link
                              href={`/captures/${citation.captureId}`}
                              className="text-emerald underline"
                            >
                              source
                            </Link>
                          </blockquote>
                        ))}
                        <div className="mt-1">
                          {fact.status === "RETIRED" ? (
                            <ActionButton
                              action={unretireFactAction.bind(null, fact.id)}
                              label="Bring back"
                              className="font-ui text-xs text-emerald underline underline-offset-2"
                            />
                          ) : (
                            <ActionButton
                              action={retireFactAction.bind(null, fact.id)}
                              label="Retire"
                            />
                          )}
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

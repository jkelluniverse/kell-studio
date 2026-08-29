import Link from "next/link";
import { notFound } from "next/navigation";
import { retryCaptureAction } from "@/app/(app)/capture-actions";
import { ActionButton } from "@/components/action-button";
import { getStorage } from "@/adapters/storage";
import { CAPTURE_LABEL, FACT_KIND_LABEL, fmtRelative } from "@/lib/format";
import { requireScopedDb } from "@/lib/session";

export default async function CapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await requireScopedDb();
  const capture = await db.capture.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      citations: {
        include: { fact: { select: { id: true, body: true, kind: true, status: true } } },
      },
    },
  });
  if (!capture) notFound();

  const audioUrl = capture.rawRef
    ? await getStorage().getSignedUrl(capture.rawRef)
    : null;

  return (
    <div>
      {capture.project && (
        <Link
          href={`/projects/${capture.project.id}`}
          className="font-ui text-sm text-navy/60 hover:text-emerald"
        >
          {capture.project.name}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl text-navy">
          {capture.kind === "VOICE" ? "Voice memo" : "Note"}
        </h1>
        <span className="rounded-full border border-navy/20 px-2 py-0.5 font-ui text-xs text-navy/70">
          {CAPTURE_LABEL[capture.status]}
        </span>
        <span className="font-body text-xs text-navy/50">
          {fmtRelative(capture.capturedAt)}
        </span>
      </div>

      {capture.status === "FAILED" && (
        <div className="mt-3">
          <p className="font-body text-sm text-rust">{capture.failureNote}</p>
          <div className="mt-2">
            <ActionButton
              action={retryCaptureAction.bind(null, capture.id)}
              label="Retry"
              className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white"
            />
          </div>
        </div>
      )}

      {audioUrl && (
        <audio controls src={audioUrl} className="mt-4 w-full">
          Your browser can&apos;t play this recording.
        </audio>
      )}

      <p className="mt-4 whitespace-pre-wrap font-body text-navy">
        {capture.body || (capture.status === "TRANSCRIBING" ? "Transcribing…" : "")}
      </p>

      <section className="mt-8">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">
          Facts from this capture
        </h2>
        {capture.citations.length === 0 ? (
          <p className="mt-2 font-body text-sm text-navy/60">
            {capture.status === "DONE"
              ? "Nothing factual in this one — that's normal."
              : "None yet."}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {capture.citations.map((citation) => (
              <li key={citation.id} className="rounded border border-navy/15 bg-white/50 p-3">
                <p className="font-body text-sm text-navy">{citation.fact.body}</p>
                <p className="mt-1 font-ui text-xs text-navy/50">
                  {FACT_KIND_LABEL[citation.fact.kind]} ·{" "}
                  {citation.fact.status.toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

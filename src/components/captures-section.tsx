import Link from "next/link";
import type { Capture } from "@prisma/client";
import { CAPTURE_LABEL, fmtRelative } from "@/lib/format";

export function CapturesSection({
  captures,
}: {
  projectId: string;
  captures: Capture[];
}) {
  return (
    <div>
      <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Captures</h2>
      {captures.length === 0 ? (
        <p className="mt-3 font-body text-navy">
          No captures yet. The green button grabs a note or a voice memo.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-navy/10">
          {captures.map((capture) => (
            <li key={capture.id}>
              <Link href={`/captures/${capture.id}`} className="flex items-center gap-2 py-2">
                <span aria-hidden>{capture.kind === "VOICE" ? "🎤" : "📝"}</span>
                <span className="min-w-0 flex-1 truncate font-body text-sm text-navy">
                  {capture.body.split("\n")[0] ||
                    (capture.status === "TRANSCRIBING" ? "Transcribing…" : "Voice memo")}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-ui text-[10px] ${
                    capture.status === "FAILED"
                      ? "bg-rust text-white"
                      : capture.status === "REVIEW"
                        ? "bg-emerald text-white"
                        : "border border-navy/20 text-navy/70"
                  }`}
                >
                  {CAPTURE_LABEL[capture.status]}
                </span>
                <span className="font-body text-xs text-navy/50">
                  {fmtRelative(capture.capturedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

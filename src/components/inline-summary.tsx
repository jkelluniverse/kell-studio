"use client";

import { useState, useTransition } from "react";
import { updateProjectSummaryAction } from "@/app/(app)/actions";

export function InlineSummary({
  projectId,
  summary,
}: {
  projectId: string;
  summary: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(summary ?? "");
          setEditing(true);
        }}
        className="block w-full text-left"
      >
        {summary ? (
          <p className="font-body text-navy/85">{summary}</p>
        ) : (
          <p className="font-body text-navy/40">Tap to add a summary.</p>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        autoFocus
        className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
      />
      {error && <p className="font-body text-xs text-rust">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateProjectSummaryAction(projectId, draft);
              if (result?.error) setError(result.error);
              else setEditing(false);
            })
          }
          className="rounded bg-emerald px-3 py-1 font-ui text-sm text-white disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="font-ui text-sm text-navy/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

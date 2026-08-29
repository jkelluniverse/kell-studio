"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FactKind } from "@prisma/client";
import {
  confirmFactAction,
  discardFactAction,
  editConfirmFactAction,
} from "@/app/(app)/review-actions";
import { FACT_KIND_LABEL } from "@/lib/format";

export interface ReviewCard {
  id: string;
  body: string;
  kind: FactKind;
  projectName: string;
  clientName: string;
  excerpt: string | null;
  captureId: string;
}

export function ReviewQueue({ cards: initial }: { cards: ReviewCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [kindDraft, setKindDraft] = useState<FactKind>("PREFERENCE");

  const card = cards[0];
  if (!card) {
    return <p className="mt-6 font-body text-navy">Nothing to review.</p>;
  }

  const advance = () => {
    setCards((c) => c.slice(1));
    setEditing(false);
    setError(undefined);
    router.refresh(); // keeps the nav badge honest
  };

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else advance();
    });

  return (
    <div className="mt-6">
      <p className="font-ui text-xs text-navy/50">
        {card.clientName} — {card.projectName} · {cards.length} to review
      </p>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-lg text-navy focus:border-emerald focus:outline-none"
          />
          <select
            value={kindDraft}
            onChange={(e) => setKindDraft(e.target.value as FactKind)}
            className="self-start rounded border border-navy/30 bg-white px-2 py-1 font-ui text-sm text-navy"
          >
            {(Object.keys(FACT_KIND_LABEL) as FactKind[]).map((k) => (
              <option key={k} value={k}>
                {FACT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <p className="mt-2 font-display text-2xl leading-snug text-navy">{card.body}</p>
          <span className="mt-2 inline-block rounded-full border border-navy/20 px-2 py-0.5 font-ui text-xs text-navy/70">
            {FACT_KIND_LABEL[card.kind]}
          </span>
        </>
      )}

      {card.excerpt && (
        <blockquote className="mt-4 border-l-2 border-emerald/50 pl-3 font-body text-sm text-navy/70">
          “{card.excerpt}”{" "}
          <Link href={`/captures/${card.captureId}`} className="text-emerald underline">
            source
          </Link>
        </blockquote>
      )}

      {error && <p className="mt-3 font-body text-sm text-rust">{error}</p>}

      <div className="mt-6 flex gap-3">
        {editing ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => editConfirmFactAction(card.id, { body: bodyDraft, kind: kindDraft }))
              }
              className="flex-1 rounded bg-emerald py-3 font-ui text-white disabled:opacity-50"
            >
              Confirm edit
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-navy/30 px-4 py-3 font-ui text-sm text-navy"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmFactAction(card.id))}
              className="flex-1 rounded bg-emerald py-3 font-ui text-white disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setBodyDraft(card.body);
                setKindDraft(card.kind);
                setEditing(true);
              }}
              className="rounded border border-navy/30 px-4 py-3 font-ui text-sm text-navy"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => discardFactAction(card.id))}
              className="rounded border border-rust/40 px-4 py-3 font-ui text-sm text-rust"
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

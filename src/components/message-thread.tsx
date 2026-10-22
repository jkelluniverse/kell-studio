"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ThreadMessage } from "@/lib/db/portal";
import { fmtRelative } from "@/lib/format";

// One thread component for both sides. The server page passes the bound
// post action for its side; the component only knows which side the viewer
// is on so it can align and label bubbles.
export function MessageThread({
  messages,
  viewer,
  viewerUserId,
  post,
  placeholder,
  emptyLine,
  readOnly = false,
}: {
  messages: ThreadMessage[];
  viewer: "OWNER" | "CLIENT";
  viewerUserId?: string;
  post?: (body: string) => Promise<{ error?: string }>;
  placeholder: string;
  emptyLine: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function send() {
    if (!post) return;
    startTransition(async () => {
      const result = await post(draft);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setDraft("");
      router.refresh();
    });
  }

  return (
    <div>
      {messages.length === 0 ? (
        <p className="mt-3 font-body text-navy/70">{emptyLine}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.from === viewer && (!viewerUserId || m.authorId === viewerUserId);
            return (
              <li
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 font-body text-navy ${
                    mine ? "bg-emerald/10" : "bg-white/70 border border-navy/10"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                </div>
                <p className="mt-1 px-1 font-ui text-[11px] text-navy/50">
                  {mine ? "You" : m.authorName} · {fmtRelative(m.createdAt)}
                  {mine && m.readAt ? " · Seen" : ""}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly && post && (
        <form
          className="mt-5 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={placeholder}
            className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="font-body text-xs text-navy/50">
              Need to send a file? Use Files above — messages are words only.
            </span>
            <button
              type="submit"
              disabled={pending || draft.trim() === ""}
              className="shrink-0 rounded bg-emerald px-4 py-2 font-ui text-sm text-white disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <p className="font-body text-sm text-rust">{error}</p>}
        </form>
      )}
    </div>
  );
}

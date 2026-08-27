"use client";

import { useState } from "react";
import type { IntakeItemKind } from "@prisma/client";

export interface PublicItem {
  id: string;
  kind: IntakeItemKind;
  prompt: string;
  required: boolean;
  choices: string[];
}

interface UploadedFile {
  itemId: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const FIELD =
  "w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none";

export function IntakePublicForm({
  token,
  items,
}: {
  token: string;
  items: PublicItem[];
}) {
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function uploadFor(item: PublicItem, list: FileList | null) {
    if (!list) return;
    setError(undefined);
    for (const file of Array.from(list)) {
      setUploading((u) => ({ ...u, [item.id]: `Uploading ${file.name}…` }));
      try {
        const presign = await fetch(`/api/intake/${token}/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        const ticket = await presign.json();
        if (!presign.ok) throw new Error(ticket.error ?? "Upload refused.");
        const put = await fetch(ticket.url, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed — try again.");
        setFiles((f) => [
          ...f,
          {
            itemId: item.id,
            key: ticket.key,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    }
    setUploading((u) => ({ ...u, [item.id]: "" }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/intake/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondentName: form.get("respondentName"),
          respondentEmail: form.get("respondentEmail"),
          website: form.get("website"),
          answers: items
            .filter((i) => i.kind !== "FILE_REQUEST")
            .map((i) => ({
              itemId: i.id,
              valueText:
                i.kind === "SHORT_TEXT" || i.kind === "LONG_TEXT"
                  ? (answers[i.id] as string | undefined)
                  : undefined,
              valueBool: i.kind === "YES_NO" ? (answers[i.id] as boolean | undefined) : undefined,
              valueChoice: i.kind === "CHOICE" ? (answers[i.id] as string | undefined) : undefined,
            })),
          files,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="mt-8 font-body text-lg text-navy">
        Got it — Jacob has everything.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 font-ui text-sm text-navy">
          Your name
          <input name="respondentName" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 font-ui text-sm text-navy">
          Your email
          <input name="respondentEmail" type="email" className={FIELD} />
          <span className="font-body text-xs text-navy/50">
            So Jacob knows who this is from.
          </span>
        </label>
        {/* Honeypot — humans never see it; bots fill it and are dropped. */}
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
      </div>

      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-1.5">
          <label className="font-ui text-sm text-navy">
            {item.prompt}
            {item.required && <span className="text-rust"> *</span>}
          </label>

          {item.kind === "SHORT_TEXT" && (
            <input
              value={(answers[item.id] as string) ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              className={FIELD}
            />
          )}
          {item.kind === "LONG_TEXT" && (
            <textarea
              rows={4}
              value={(answers[item.id] as string) ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
              className={FIELD}
            />
          )}
          {item.kind === "YES_NO" && (
            <div className="flex gap-4">
              {[true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-1.5 font-body text-navy">
                  <input
                    type="radio"
                    name={`yn-${item.id}`}
                    checked={answers[item.id] === v}
                    onChange={() => setAnswers((a) => ({ ...a, [item.id]: v }))}
                    className="accent-emerald"
                  />
                  {v ? "Yes" : "No"}
                </label>
              ))}
            </div>
          )}
          {item.kind === "CHOICE" && (
            <div className="flex flex-col gap-1.5">
              {item.choices.map((choice) => (
                <label key={choice} className="flex items-center gap-1.5 font-body text-navy">
                  <input
                    type="radio"
                    name={`choice-${item.id}`}
                    checked={answers[item.id] === choice}
                    onChange={() => setAnswers((a) => ({ ...a, [item.id]: choice }))}
                    className="accent-emerald"
                  />
                  {choice}
                </label>
              ))}
            </div>
          )}
          {item.kind === "FILE_REQUEST" && (
            <div>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  void uploadFor(item, e.target.files);
                  e.target.value = "";
                }}
                className="font-body text-sm text-navy file:mr-3 file:rounded file:border-0 file:bg-emerald file:px-3 file:py-1.5 file:font-ui file:text-sm file:text-white"
              />
              {uploading[item.id] && (
                <p className="mt-1 font-body text-xs text-navy/60">{uploading[item.id]}</p>
              )}
              {files.filter((f) => f.itemId === item.id).length > 0 && (
                <ul className="mt-1 font-body text-xs text-navy/70">
                  {files
                    .filter((f) => f.itemId === item.id)
                    .map((f, i) => (
                      <li key={i}>✓ {f.filename}</li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}

      {error && <p className="font-body text-sm text-rust">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded bg-emerald px-5 py-2.5 font-ui text-white disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

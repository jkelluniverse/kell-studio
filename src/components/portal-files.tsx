"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  portalDocumentUrlAction,
  portalPrepareUploadAction,
  portalRegisterUploadAction,
} from "@/app/portal/portal-actions";
import type { PortalFile } from "@/lib/db/portal";
import { fmtBytes, fmtDate } from "@/lib/format";

type Progress = { name: string; pct: number; error?: string };

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("The upload didn't finish — try again."));
    xhr.onerror = () => reject(new Error("The upload didn't finish — try again."));
    xhr.send(file);
  });
}

export function PortalFiles({
  projectId,
  files,
  readOnly,
}: {
  projectId: string;
  files: PortalFile[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Progress[]>([]);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    for (const file of Array.from(list)) {
      const entry: Progress = { name: file.name, pct: 0 };
      setUploads((u) => [...u, entry]);
      const update = (patch: Partial<Progress>) =>
        setUploads((u) => u.map((e) => (e === entry ? Object.assign(entry, patch) : e)));
      try {
        const ticket = await portalPrepareUploadAction({
          projectId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (ticket.error || !ticket.url || !ticket.key) {
          throw new Error(ticket.error ?? "That file couldn't be uploaded.");
        }
        await putWithProgress(ticket.url, file, (pct) => update({ pct }));
        const result = await portalRegisterUploadAction({
          projectId,
          key: ticket.key,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (result.error) throw new Error(result.error);
        setUploads((u) => u.filter((e) => e !== entry));
      } catch (err) {
        update({ error: err instanceof Error ? err.message : "That file couldn't be uploaded." });
      }
    }
    router.refresh();
  }

  return (
    <div>
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded bg-emerald px-4 py-2.5 font-ui text-sm text-white"
          >
            Upload a file
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mt-2 font-body text-xs text-navy/50">
            Images, PDFs, office documents, text files, and zips — up to 100 MB each.
          </p>
        </>
      )}

      {uploads.map((u, i) => (
        <p key={i} className="mt-2 font-body text-sm text-navy">
          {u.name} —{" "}
          {u.error ? (
            <span className="text-rust">{u.error}</span>
          ) : (
            <span className="text-navy/60">{u.pct}%</span>
          )}
        </p>
      ))}

      {files.length === 0 && uploads.length === 0 ? (
        <p className="mt-3 font-body text-navy/70">No files yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-navy/10">
          {files.map((f) => (
            <PortalFileRow key={f.id} file={f} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PortalFileRow({ file, readOnly }: { file: PortalFile; readOnly: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const open = () =>
    startTransition(async () => {
      const result = await portalDocumentUrlAction(file.id);
      if (result.url) window.open(result.url, "_blank");
      else setError(result.error);
    });

  return (
    <li className="py-3">
      {readOnly ? (
        <p className="font-body text-navy">{file.title}</p>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={pending}
          className="block max-w-full truncate text-left font-body text-navy underline-offset-2 hover:text-emerald hover:underline"
        >
          {file.title}
        </button>
      )}
      <p className="font-body text-xs text-navy/50">
        {[fmtBytes(file.sizeBytes), fmtDate(file.createdAt), file.fromClient ? "From you" : "From Jacob"]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {error && <p className="font-body text-xs text-rust">{error}</p>}
    </li>
  );
}

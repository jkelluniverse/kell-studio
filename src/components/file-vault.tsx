"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDocumentAction,
  documentUrlAction,
  prepareUploadAction,
  registerUploadAction,
} from "@/app/(app)/file-actions";
import { fmtBytes, fmtDate } from "@/lib/format";
import { renameDocumentAction } from "@/app/(app)/file-actions";

export interface DocRow {
  id: string;
  title: string;
  originalName: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  source: "JACOB" | "CLIENT_INTAKE" | "SYSTEM";
  createdAt: Date;
}

const SOURCE_CHIP: Record<DocRow["source"], string> = {
  JACOB: "You",
  CLIENT_INTAKE: "Client",
  SYSTEM: "System",
};

function iconFor(mimeType: string | null): string {
  if (!mimeType) return "📄";
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType === "application/pdf") return "📕";
  if (mimeType.includes("zip")) return "🗜";
  if (mimeType.includes("sheet") || mimeType === "text/csv") return "📊";
  return "📄";
}

type Progress = { name: string; pct: number; error?: string };

/** PUT with progress via XHR (fetch has no upload progress). */
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
        : reject(new Error(`upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("upload failed (network)"));
    xhr.send(file);
  });
}

export function FileVault({
  projectId,
  documents,
}: {
  projectId: string;
  documents: DocRow[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Progress[]>([]);
  const [error, setError] = useState<string | undefined>();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(undefined);
    for (const file of Array.from(files)) {
      const entry: Progress = { name: file.name, pct: 0 };
      setUploads((u) => [...u, entry]);
      const update = (patch: Partial<Progress>) =>
        setUploads((u) => u.map((e) => (e === entry ? Object.assign(entry, patch) : e)));
      try {
        const ticket = await prepareUploadAction({
          projectId,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (ticket.error || !ticket.url || !ticket.key) {
          throw new Error(ticket.error ?? "upload refused");
        }
        await putWithProgress(ticket.url, file, (pct) => update({ pct }));
        const result = await registerUploadAction({
          projectId,
          key: ticket.key,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (result.error) throw new Error(result.error);
        setUploads((u) => u.filter((e) => e !== entry));
      } catch (err) {
        update({ error: err instanceof Error ? err.message : "upload failed" });
      }
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Files</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white"
        >
          Upload
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
      </div>

      {uploads.map((u, i) => (
        <div key={i} className="mt-2 font-body text-sm text-navy">
          {u.name} —{" "}
          {u.error ? (
            <span className="text-rust">{u.error}</span>
          ) : (
            <span className="text-navy/60">{u.pct}%</span>
          )}
        </div>
      ))}
      {error && <p className="mt-2 font-body text-sm text-rust">{error}</p>}

      {documents.length === 0 && uploads.length === 0 ? (
        <p className="mt-3 font-body text-navy">
          No files yet. Upload one, or request some through an intake.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-navy/10">
          {documents.map((doc) => (
            <FileRow key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({ doc }: { doc: DocRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(doc.title);
  const [error, setError] = useState<string | undefined>();

  const open = () =>
    startTransition(async () => {
      const result = await documentUrlAction(doc.id);
      if (result.url) window.open(result.url, "_blank");
      else setError(result.error);
    });

  return (
    <li className="flex items-center gap-2 py-2">
      <span aria-hidden>{iconFor(doc.mimeType)}</span>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await renameDocumentAction(doc.id, draft);
                if (result.error) setError(result.error);
                else {
                  setRenaming(false);
                  router.refresh();
                }
              });
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              className="flex-1 rounded border border-navy/30 bg-white px-2 py-1 font-body text-sm text-navy focus:border-emerald focus:outline-none"
            />
            <button type="submit" className="font-ui text-xs text-emerald">
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="font-ui text-xs text-navy/60"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={open}
            disabled={pending}
            className="block max-w-full truncate text-left font-body text-sm text-navy hover:text-emerald"
          >
            {doc.title}
          </button>
        )}
        <p className="font-body text-xs text-navy/50">
          {[fmtBytes(doc.sizeBytes), fmtDate(doc.createdAt)].filter(Boolean).join(" · ")}
          <span className="ml-2 rounded-full border border-navy/20 px-1.5 py-0.5 font-ui text-[10px] text-navy/70">
            {SOURCE_CHIP[doc.source]}
          </span>
        </p>
        {error && <p className="font-body text-xs text-rust">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => {
          setDraft(doc.title);
          setRenaming(true);
        }}
        className="font-ui text-xs text-navy/50 hover:text-emerald"
      >
        Rename
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete "${doc.title}"? The file is removed for good.`)) return;
          startTransition(async () => {
            const result = await deleteDocumentAction(doc.id);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className="font-ui text-xs text-rust hover:underline"
      >
        Delete
      </button>
    </li>
  );
}

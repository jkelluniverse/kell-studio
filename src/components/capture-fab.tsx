"use client";

// The ten-second doctrine: one tap opens the sheet, Note autofocuses, Voice
// is record -> stop -> done. Everything after save is background.
//
// KS-05 DECISION: single-blob MediaRecorder. valentinaapp records on
// dedicated hardware (no browser recording exists there to port), and
// chunked/crash-safe recording buys little for sub-two-minute memos.
// Revisit if a lost long memo ever actually happens.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createNoteCaptureAction,
  createVoiceCaptureAction,
  prepareVoiceUploadAction,
} from "@/app/(app)/capture-actions";

export interface CaptureProject {
  id: string;
  label: string;
}

type Mode = "closed" | "menu" | "note" | "voice";

export function CaptureFab({
  projects,
  defaultProjectId,
}: {
  projects: CaptureProject[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("closed");
  // Derived, not frozen: the layout (and this component) mounts once and
  // survives navigations, so projects arriving later must still win. A
  // picked id only sticks while it exists in the current list.
  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  const projectId =
    (pickedProjectId && projects.some((p) => p.id === pickedProjectId) && pickedProjectId) ||
    (defaultProjectId && projects.some((p) => p.id === defaultProjectId) && defaultProjectId) ||
    projects[0]?.id ||
    "";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (projects.length === 0) return null;

  const close = () => {
    setMode("closed");
    setNote("");
    setError(undefined);
  };

  async function saveNote() {
    setBusy(true);
    const result = await createNoteCaptureAction(projectId, note);
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      close();
      router.refresh();
    }
  }

  return (
    <>
      {mode === "closed" && (
        <button
          type="button"
          aria-label="Capture"
          onClick={() => setMode("menu")}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald text-2xl text-white shadow-lg"
        >
          +
        </button>
      )}

      {mode !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/30" onClick={close}>
          <div
            className="w-full max-w-md rounded-t-xl bg-cream p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              value={projectId}
              onChange={(e) => setPickedProjectId(e.target.value)}
              className="mb-4 w-full rounded border border-navy/30 bg-white px-3 py-2 font-ui text-sm text-navy"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            {mode === "menu" && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode("note")}
                  className="flex-1 rounded bg-emerald py-6 font-ui text-lg text-white"
                >
                  Note
                </button>
                <button
                  type="button"
                  onClick={() => setMode("voice")}
                  className="flex-1 rounded bg-navy py-6 font-ui text-lg text-white"
                >
                  Voice
                </button>
              </div>
            )}

            {mode === "note" && (
              <div className="flex flex-col gap-3">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  rows={5}
                  placeholder="What just happened?"
                  className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={saveNote}
                  className="rounded bg-emerald px-4 py-3 font-ui text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            )}

            {mode === "voice" && (
              <VoiceRecorder
                projectId={projectId}
                onDone={() => {
                  close();
                  router.refresh();
                }}
                onError={setError}
              />
            )}

            {error && <p className="mt-2 font-body text-sm text-rust">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function VoiceRecorder({
  projectId,
  onDone,
  onError,
}: {
  projectId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop()),
    []
  );

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => void upload(new Blob(chunksRef.current, { type: mimeType }));
      recorder.start();
      recorderRef.current = recorder;
      setElapsed(0);
      setRecording(true);
    } catch {
      onError("Microphone access was refused — check the browser permission.");
    }
  }

  function stop() {
    setRecording(false);
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function upload(blob: Blob) {
    setUploading(true);
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : "webm";
      const ticket = await prepareVoiceUploadAction({
        projectId,
        filename: `memo.${ext}`,
        mimeType: blob.type,
        sizeBytes: blob.size,
      });
      if (ticket.error || !ticket.url || !ticket.key) {
        throw new Error(ticket.error ?? "Upload refused.");
      }
      const put = await fetch(ticket.url, {
        method: "PUT",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!put.ok) throw new Error("Upload failed — try again.");
      const result = await createVoiceCaptureAction(projectId, ticket.key);
      if (result.error) throw new Error(result.error);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={uploading}
        onClick={recording ? stop : start}
        className={`flex h-24 w-24 items-center justify-center rounded-full font-ui text-white disabled:opacity-50 ${
          recording ? "bg-rust" : "bg-emerald"
        }`}
      >
        {uploading ? "…" : recording ? "Stop" : "Record"}
      </button>
      <p className="font-ui text-sm text-navy/70">
        {uploading
          ? "Saving — you're done."
          : recording
            ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
            : "Tap to record a memo."}
      </p>
    </div>
  );
}

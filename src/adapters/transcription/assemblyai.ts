// Ported from valentinaapp lib/transcription/assemblyai.ts, adapted for
// Studio. What carried over: the verified v2 REST shapes (submit via POST
// /v2/transcript with audio_url, poll via GET /v2/transcript/{id}, raw api
// key in the `authorization` header) and the ASSEMBLYAI_BASE_URL override
// for testing. Stripped: webhooks (Studio polls from the cron tick),
// speaker diarization and role mapping, cost estimation, deleteRemote, and
// all Psychefolio/session naming.
import type { TranscriptionAdapter } from "./types";

const base = () => process.env.ASSEMBLYAI_BASE_URL ?? "https://api.assemblyai.com";

function apiKey(): string {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new Error("ASSEMBLYAI_API_KEY is not set");
  return k;
}

type AaiTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  text?: string;
};

export function createAssemblyAITranscription(): TranscriptionAdapter {
  return {
    async submit(audioUrl) {
      const res = await fetch(`${base()}/v2/transcript`, {
        method: "POST",
        headers: { authorization: apiKey(), "content-type": "application/json" },
        body: JSON.stringify({ audio_url: audioUrl }),
      });
      if (!res.ok) throw new Error(`assemblyai submit failed: ${res.status}`);
      const data = (await res.json()) as { id: string };
      return { jobId: data.id };
    },

    async poll(jobId) {
      const res = await fetch(`${base()}/v2/transcript/${jobId}`, {
        headers: { authorization: apiKey() },
      });
      if (!res.ok) {
        return { status: "error", errorMessage: `poll failed: ${res.status}` };
      }
      const t = (await res.json()) as AaiTranscript;
      if (t.status === "error") {
        return { status: "error", errorMessage: t.error ?? "provider error" };
      }
      if (t.status !== "completed") return { status: "pending" };
      return { status: "completed", text: t.text ?? "" };
    },
  };
}

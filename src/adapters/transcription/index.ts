import type { TranscriptionAdapter } from "./types";
import { createAssemblyAITranscription } from "./assemblyai";
import { createFakeTranscription } from "./fake";

export type { TranscriptionAdapter } from "./types";

const globalStore = globalThis as unknown as {
  __studioTranscription?: TranscriptionAdapter;
};

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

/** AssemblyAI when configured; the instant fake otherwise (dev only). */
export function getTranscription(): TranscriptionAdapter {
  if (!globalStore.__studioTranscription) {
    globalStore.__studioTranscription = transcriptionConfigured()
      ? createAssemblyAITranscription()
      : createFakeTranscription();
  }
  return globalStore.__studioTranscription;
}

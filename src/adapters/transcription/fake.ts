import type { TranscriptionAdapter } from "./types";

export interface FakeTranscription extends TranscriptionAdapter {
  /** Text every job "transcribes" to; set per test. */
  cannedText: string;
  /** When true, poll reports a provider error instead of completing. */
  failNext: boolean;
  submitted: string[];
}

export function createFakeTranscription(
  cannedText = "The client wants the launch moved to June."
): FakeTranscription {
  const fake: FakeTranscription = {
    cannedText,
    failNext: false,
    submitted: [],
    async submit(audioUrl) {
      fake.submitted.push(audioUrl);
      return { jobId: `fake-job-${fake.submitted.length}` };
    },
    async poll() {
      if (fake.failNext) {
        fake.failNext = false;
        return { status: "error", errorMessage: "fake provider error" };
      }
      return { status: "completed", text: fake.cannedText };
    },
  };
  return fake;
}

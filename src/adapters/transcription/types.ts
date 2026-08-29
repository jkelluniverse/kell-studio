// The transcription adapter contract. One interface, providers behind it —
// nothing downstream knows which vendor ran. Audio reaches the provider via
// a short-lived presigned URL; bytes never proxy through this app.
export interface TranscriptionAdapter {
  /** Submit audio for async transcription. Returns the provider job id. */
  submit(audioUrl: string): Promise<{ jobId: string }>;
  /** Poll a job. `text` is present only when status is "completed". */
  poll(
    jobId: string
  ): Promise<
    | { status: "completed"; text: string }
    | { status: "pending" }
    | { status: "error"; errorMessage: string }
  >;
}

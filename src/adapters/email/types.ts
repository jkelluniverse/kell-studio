// The email adapter contract. One shape for every send: a branded plain
// message — heading, paragraphs, at most one button. No attachments, no
// images, no SMS — ever.
export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
}

export interface EmailAdapter {
  /** Resolves even on failure — email is best-effort, never blocks a save. */
  send(message: EmailMessage): Promise<{ ok: boolean }>;
}

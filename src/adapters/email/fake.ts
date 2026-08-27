import type { EmailAdapter, EmailMessage } from "./types";

export interface FakeEmail extends EmailAdapter {
  sent: EmailMessage[];
}

export function createFakeEmail(): FakeEmail {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { ok: true };
    },
  };
}

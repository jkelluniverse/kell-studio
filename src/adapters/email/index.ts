import type { EmailAdapter } from "./types";
import { createResendEmail } from "./resend";

export type { EmailAdapter, EmailMessage } from "./types";

const globalStore = globalThis as unknown as { __studioEmail?: EmailAdapter };

export function getEmail(): EmailAdapter {
  if (!globalStore.__studioEmail) {
    globalStore.__studioEmail = createResendEmail();
  }
  return globalStore.__studioEmail;
}

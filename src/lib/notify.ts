// The email-notice dependencies every notice-sending action shares.
import { getEmail } from "@/adapters/email";

export function appBaseUrl(): string {
  return (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function noticeDeps() {
  return {
    email: getEmail(),
    appBaseUrl: appBaseUrl(),
    ownerEmail: process.env.OWNER_EMAIL,
  };
}

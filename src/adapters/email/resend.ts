// Ported from valentinaapp lib/notify.ts, adapted for Studio.
// What carried over: Resend via its REST API (no SDK dependency), graceful
// degradation when unconfigured, and never logging message content — only
// coarse outcomes. Stripped: Valentina branding/locales, the Envelope
// template system, demo-tenant suppression, attachments, and everything
// else Psychefolio-specific. Studio's render is a minimal cream/navy card.
import { CREAM, EMERALD, NAVY, SIGNATURE } from "@/lib/brand";
import type { EmailAdapter, EmailMessage } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmailHtml(m: EmailMessage): string {
  const paragraphs = m.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${NAVY};">${escapeHtml(p)}</p>`
    )
    .join("");
  const button = m.button
    ? `<p style="margin:22px 0 6px;"><a href="${escapeHtml(m.button.url)}" style="display:inline-block;background:${EMERALD};color:#ffffff;font-family:Sora,Helvetica,Arial,sans-serif;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:4px;">${escapeHtml(m.button.label)}</a></p>`
    : "";
  return `<div style="background:${CREAM};padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="margin:0 0 18px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:24px;color:${NAVY};">${escapeHtml(m.heading)}</h1>
    ${paragraphs}${button}
    <p style="margin:28px 0 0;font-family:Sora,Helvetica,Arial,sans-serif;font-size:12px;color:${NAVY};">${escapeHtml(SIGNATURE)}</p>
  </div>
</div>`;
}

function renderText(m: EmailMessage): string {
  const lines = [m.heading, "", ...m.paragraphs];
  if (m.button) lines.push("", `${m.button.label}: ${m.button.url}`);
  lines.push("", SIGNATURE);
  return lines.join("\n");
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function createResendEmail(): EmailAdapter {
  return {
    async send(message) {
      if (!emailConfigured()) {
        console.warn("email: RESEND_API_KEY/EMAIL_FROM not set; send skipped");
        return { ok: false };
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: message.to,
            subject: message.subject,
            html: renderEmailHtml(message),
            text: renderText(message),
          }),
        });
        if (!res.ok) console.warn(`email: send failed with status ${res.status}`);
        return { ok: res.ok };
      } catch {
        console.warn("email: send failed (network)");
        return { ok: false };
      }
    },
  };
}

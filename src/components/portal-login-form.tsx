"use client";

import { useActionState } from "react";
import { requestLoginLinkAction, type LoginState } from "@/app/portal/portal-actions";

// The one answer the form ever gives — no account enumeration.
export const NEUTRAL_LOGIN_SENTENCE =
  "If that email has portal access, a sign-in link is on its way.";

export function PortalLoginForm() {
  const [state, formAction, pending] = useActionState(
    requestLoginLinkAction,
    {} as LoginState
  );

  if (state.sent) {
    return (
      <p className="mt-8 font-body text-lg leading-relaxed text-navy">
        {NEUTRAL_LOGIN_SENTENCE}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 font-ui text-sm text-navy">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          className="rounded border border-navy/30 bg-white px-3 py-3 font-body text-lg text-navy focus:border-emerald focus:outline-none"
        />
      </label>
      {state.error && <p className="font-body text-sm text-rust">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-emerald px-5 py-3 font-ui text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}

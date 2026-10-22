"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { consumeLoginLinkAction } from "@/app/portal/portal-actions";

export function PortalAuthContinue({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="mt-8 flex flex-col gap-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await consumeLoginLinkAction(token);
            setError(result?.error);
          })
        }
        className="self-start rounded bg-emerald px-5 py-3 font-ui text-white disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open my portal"}
      </button>
      {error && (
        <p className="font-body text-navy">
          {error}{" "}
          <Link href="/portal/login" className="text-emerald underline underline-offset-2">
            Send me a new link
          </Link>
        </p>
      )}
    </div>
  );
}

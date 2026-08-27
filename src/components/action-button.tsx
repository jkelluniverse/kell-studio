"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";

/**
 * A button that runs a bound server action and shows its plain-English
 * error next to itself when the domain rules say no.
 */
export function ActionButton({
  action,
  label,
  className,
}: {
  action: () => Promise<ActionState>;
  label: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setError(result?.error);
          })
        }
        className={className ?? "font-ui text-sm text-rust underline underline-offset-2 disabled:opacity-60"}
      >
        {label}
      </button>
      {error && <span className="font-body text-xs text-rust">{error}</span>}
    </span>
  );
}

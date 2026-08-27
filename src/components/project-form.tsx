"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/(app)/actions";

export function ProjectForm({
  action,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-ui text-sm text-navy">
        Name
        <input
          name="name"
          required
          className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 font-ui text-sm text-navy">
        Summary
        <textarea
          name="summary"
          rows={4}
          className="w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none"
        />
      </label>
      {state.error && <p className="font-body text-sm text-rust">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald px-4 py-2 font-ui text-white disabled:opacity-60"
      >
        Create project
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { addPhaseAction, type ActionState } from "@/app/(app)/actions";

export function AddPhaseForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(
    addPhaseAction.bind(null, projectId),
    {} as ActionState
  );

  return (
    <form action={formAction} className="mt-3 flex items-start gap-2">
      <input
        name="name"
        required
        placeholder="New build stage"
        className="flex-1 rounded border border-navy/30 bg-white px-3 py-2 font-body text-sm text-navy focus:border-emerald focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white disabled:opacity-60"
      >
        Add phase
      </button>
      {state.error && <p className="font-body text-xs text-rust">{state.error}</p>}
    </form>
  );
}

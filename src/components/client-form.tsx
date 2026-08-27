"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/(app)/actions";

const FIELD =
  "w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-navy focus:border-emerald focus:outline-none";
const LABEL = "flex flex-col gap-1 font-ui text-sm text-navy";

export interface ClientFormValues {
  name?: string;
  slug?: string;
  status?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export function ClientForm({
  action,
  initial = {},
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: ClientFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className={LABEL}>
        Name
        <input name="name" defaultValue={initial.name} required className={FIELD} />
        {initial.slug && (
          <span className="font-body text-xs text-navy/50">/{initial.slug}</span>
        )}
      </label>
      <label className={LABEL}>
        Status
        <select name="status" defaultValue={initial.status ?? "PROSPECT"} className={FIELD}>
          <option value="PROSPECT">Prospect</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST">Past</option>
        </select>
      </label>
      <label className={LABEL}>
        Contact name
        <input name="contactName" defaultValue={initial.contactName} className={FIELD} />
      </label>
      <label className={LABEL}>
        Email
        <input name="contactEmail" defaultValue={initial.contactEmail} className={FIELD} />
      </label>
      <label className={LABEL}>
        Phone
        <input name="contactPhone" defaultValue={initial.contactPhone} className={FIELD} />
      </label>
      <label className={LABEL}>
        Notes
        <textarea name="notes" defaultValue={initial.notes} rows={4} className={FIELD} />
      </label>
      {state.error && <p className="font-body text-sm text-rust">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald px-4 py-2 font-ui text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}

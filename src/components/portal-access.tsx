"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionState } from "@/app/(app)/actions";
import {
  invitePortalUserAction,
  removePortalUserAction,
  resendPortalLinkAction,
  restorePortalUserAction,
  revokePortalUserAction,
} from "@/app/(app)/portal-admin-actions";
import { fmtRelative } from "@/lib/format";

export interface PortalUserRow {
  id: string;
  name: string | null;
  email: string;
  lastSignInAt: Date | null;
  disabledAt: Date | null;
  messageCount: number;
}

const FIELD =
  "rounded border border-navy/30 bg-white px-2 py-1.5 font-body text-sm text-navy focus:border-emerald focus:outline-none";

export function PortalAccess({
  clientId,
  users,
}: {
  clientId: string;
  users: PortalUserRow[];
}) {
  return (
    <div>
      <h2 className="font-ui text-xs uppercase tracking-wide text-navy/50">Portal access</h2>
      {users.length === 0 ? (
        <p className="mt-3 font-body text-navy">
          Nobody has portal access yet. Invite someone below — they sign in by email link, no password.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-navy/10">
          {users.map((u) => (
            <PortalUserItem key={u.id} user={u} />
          ))}
        </ul>
      )}
      <InviteForm clientId={clientId} />
    </div>
  );
}

function PortalUserItem({ user }: { user: PortalUserRow }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | undefined>();
  const revoked = user.disabledAt !== null;

  const run = (fn: () => Promise<ActionState>, done?: string) =>
    startTransition(async () => {
      const result = await fn();
      setNote(result?.error ?? done);
    });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <div className="min-w-0 flex-1">
        <p className={`font-body text-sm ${revoked ? "text-navy/50 line-through" : "text-navy"}`}>
          {user.name ?? user.email}
        </p>
        <p className="font-body text-xs text-navy/50">
          {user.email} ·{" "}
          {revoked
            ? "Revoked"
            : user.lastSignInAt
              ? `Signed in ${fmtRelative(user.lastSignInAt)}`
              : "Never signed in"}
        </p>
        {note && <p className="font-body text-xs text-navy/70">{note}</p>}
      </div>
      {revoked ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePortalUserAction(user.id), "Access restored.")}
            className="font-ui text-xs text-emerald hover:underline"
          >
            Restore
          </button>
          {user.messageCount === 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Remove ${user.email} for good?`)) return;
                run(() => removePortalUserAction(user.id));
              }}
              className="font-ui text-xs text-rust hover:underline"
            >
              Remove
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resendPortalLinkAction(user.id), "Link sent.")}
            className="font-ui text-xs text-emerald hover:underline"
          >
            Resend link
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Revoke portal access for ${user.email}?`)) return;
              run(() => revokePortalUserAction(user.id));
            }}
            className="font-ui text-xs text-rust hover:underline"
          >
            Revoke
          </button>
        </>
      )}
    </li>
  );
}

function InviteForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    invitePortalUserAction.bind(null, clientId),
    {} as ActionState
  );

  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-ui text-sm text-emerald">Invite someone</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="name" required placeholder="Name" className={FIELD} />
        <input name="email" type="email" required placeholder="Email" className={FIELD} />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-emerald px-3 py-1.5 font-ui text-sm text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </form>
      {state.error && <p className="mt-1 font-body text-xs text-rust">{state.error}</p>}
    </details>
  );
}

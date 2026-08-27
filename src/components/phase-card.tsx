"use client";

import { useState, useTransition, useActionState } from "react";
import type { MilestoneOwner, PhaseStatus } from "@prisma/client";
import {
  addMilestoneAction,
  deleteMilestoneAction,
  deletePhaseAction,
  movePhaseAction,
  renamePhaseAction,
  setMilestoneDoneAction,
  setPhaseStatusAction,
  setPhaseVisibilityAction,
  type ActionState,
} from "@/app/(app)/actions";
import { PHASE_LABEL, fmtDate, isOverdue } from "@/lib/format";

export interface MilestoneData {
  id: string;
  title: string;
  dueOn: Date;
  doneAt: Date | null;
  ownedBy: MilestoneOwner;
  note: string | null;
}

export interface PhaseData {
  id: string;
  name: string;
  status: PhaseStatus;
  blockedNote: string | null;
  visibleToClient: boolean;
  milestones: MilestoneData[];
}

const CHIP: Record<PhaseStatus, string> = {
  NOT_STARTED: "bg-navy/10 text-navy/70",
  IN_PROGRESS: "bg-emerald text-white",
  BLOCKED: "bg-rust text-white",
  DONE: "bg-navy text-white",
};

const FIELD =
  "rounded border border-navy/30 bg-white px-2 py-1 font-body text-sm text-navy focus:border-emerald focus:outline-none";

export function PhaseCard({
  phase,
  isFirst,
  isLast,
}: {
  phase: PhaseData;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(phase.name);
  const [blockedDraft, setBlockedDraft] = useState<string | null>(null); // non-null = asking for note

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
    });

  return (
    <li className="rounded border border-navy/15 bg-white/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const result = await renamePhaseAction(phase.id, nameDraft);
                if (!result?.error) setRenaming(false);
                return result;
              });
            }}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              className={FIELD}
            />
            <button type="submit" className="font-ui text-sm text-emerald">
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="font-ui text-sm text-navy/60"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(phase.name);
              setRenaming(true);
            }}
            className="font-ui text-navy"
          >
            {phase.name}
          </button>
        )}
        <span className={`rounded-full px-2 py-0.5 font-ui text-xs ${CHIP[phase.status]}`}>
          {PHASE_LABEL[phase.status]}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Move up"
            disabled={isFirst || pending}
            onClick={() => run(() => movePhaseAction(phase.id, "up"))}
            className="rounded px-1.5 py-0.5 font-ui text-navy/60 disabled:opacity-25"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={isLast || pending}
            onClick={() => run(() => movePhaseAction(phase.id, "down"))}
            className="rounded px-1.5 py-0.5 font-ui text-navy/60 disabled:opacity-25"
          >
            ↓
          </button>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <select
          value={blockedDraft !== null ? "BLOCKED" : phase.status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as PhaseStatus;
            if (next === "BLOCKED") {
              setBlockedDraft(phase.blockedNote ?? "");
            } else {
              setBlockedDraft(null);
              run(() => setPhaseStatusAction(phase.id, next));
            }
          }}
          className={FIELD}
        >
          {(Object.keys(PHASE_LABEL) as PhaseStatus[]).map((s) => (
            <option key={s} value={s}>
              {PHASE_LABEL[s]}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 font-ui text-xs text-navy/70">
          <input
            type="checkbox"
            checked={phase.visibleToClient}
            disabled={pending}
            onChange={(e) =>
              run(() => setPhaseVisibilityAction(phase.id, e.target.checked))
            }
            className="accent-emerald"
          />
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Client sees this
        </label>

        {phase.milestones.length === 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => deletePhaseAction(phase.id))}
            className="font-ui text-xs text-rust underline underline-offset-2"
          >
            Delete
          </button>
        ) : (
          <span className="font-body text-xs text-navy/40">
            Deletable once its milestones are gone.
          </span>
        )}
      </div>

      {blockedDraft !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={blockedDraft}
            onChange={(e) => setBlockedDraft(e.target.value)}
            placeholder="Why is this blocked?"
            autoFocus
            className={`${FIELD} flex-1`}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await setPhaseStatusAction(
                  phase.id,
                  "BLOCKED",
                  blockedDraft
                );
                if (!result?.error) setBlockedDraft(null);
                return result;
              })
            }
            className="rounded bg-rust px-3 py-1 font-ui text-sm text-white disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setBlockedDraft(null)}
            className="font-ui text-sm text-navy/60"
          >
            Cancel
          </button>
        </div>
      )}
      {phase.status === "BLOCKED" && phase.blockedNote && blockedDraft === null && (
        <p className="mt-1 font-body text-sm text-rust">{phase.blockedNote}</p>
      )}
      {error && <p className="mt-1 font-body text-xs text-rust">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {phase.milestones.map((m) => (
          <MilestoneRow key={m.id} milestone={m} />
        ))}
      </ul>
      <AddMilestoneForm phaseId={phase.id} />
    </li>
  );
}

function MilestoneRow({ milestone }: { milestone: MilestoneData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const done = milestone.doneAt !== null;
  const overdue = isOverdue(milestone.dueOn, milestone.doneAt);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
    });

  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => run(() => setMilestoneDoneAction(milestone.id, e.target.checked))}
        aria-label={`Mark ${milestone.title} ${done ? "not done" : "done"}`}
        className="mt-1 accent-emerald"
      />
      <div className="min-w-0 flex-1">
        <p className={`font-body text-sm ${done ? "text-navy line-through" : "text-navy"}`}>
          {milestone.title}
          <span className={`ml-2 font-ui text-xs ${overdue ? "text-rust" : "text-navy/50"}`}>
            {fmtDate(milestone.dueOn)}
          </span>
          <span className="ml-2 rounded-full border border-navy/20 px-1.5 py-0.5 font-ui text-[10px] text-navy/70">
            {milestone.ownedBy === "JACOB" ? "On me" : "On client"}
          </span>
        </p>
        {milestone.note && (
          <p className="font-body text-xs text-navy/50">{milestone.note}</p>
        )}
        {error && <p className="font-body text-xs text-rust">{error}</p>}
      </div>
      <button
        type="button"
        aria-label={`Delete ${milestone.title}`}
        disabled={pending}
        onClick={() => run(() => deleteMilestoneAction(milestone.id))}
        className="px-1 font-ui text-navy/40 hover:text-rust"
      >
        ×
      </button>
    </li>
  );
}

function AddMilestoneForm({ phaseId }: { phaseId: string }) {
  const [state, formAction, pending] = useActionState(
    addMilestoneAction.bind(null, phaseId),
    {} as ActionState
  );

  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-ui text-xs text-emerald">
        Add milestone
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-2">
        <input name="title" required placeholder="Title" className={FIELD} />
        <input name="dueOn" type="date" required className={FIELD} />
        <select name="ownedBy" defaultValue="JACOB" className={FIELD}>
          <option value="JACOB">On me</option>
          <option value="CLIENT">On client</option>
        </select>
        <input name="note" placeholder="Note (optional)" className={FIELD} />
        {state.error && <p className="font-body text-xs text-rust">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-emerald px-3 py-1 font-ui text-sm text-white disabled:opacity-60"
        >
          Add
        </button>
      </form>
    </details>
  );
}

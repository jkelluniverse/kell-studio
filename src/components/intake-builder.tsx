"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntakeItemKind, IntakeStatus } from "@prisma/client";
import {
  addIntakeItemAction,
  closeIntakeFormAction,
  deleteIntakeItemAction,
  moveIntakeItemAction,
  openIntakeFormAction,
  updateIntakeFormAction,
  updateIntakeItemAction,
  type ItemFields,
} from "@/app/(app)/intake-actions";
import type { ActionState } from "@/app/(app)/actions";

export interface ItemRow {
  id: string;
  kind: IntakeItemKind;
  prompt: string;
  required: boolean;
  choices: string[];
}

const KIND_LABEL: Record<IntakeItemKind, string> = {
  SHORT_TEXT: "Short answer",
  LONG_TEXT: "Long answer",
  YES_NO: "Yes / no",
  CHOICE: "Multiple choice",
  FILE_REQUEST: "File request",
};

const FIELD =
  "w-full rounded border border-navy/30 bg-white px-3 py-2 font-body text-sm text-navy focus:border-emerald focus:outline-none";

export function IntakeBuilder({
  form,
  items,
  shareUrl,
}: {
  form: { id: string; title: string; intro: string | null; status: IntakeStatus };
  items: ItemRow[];
  shareUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const draft = form.status === "DRAFT";

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
      if (!result?.error) router.refresh();
    });

  return (
    <div>
      <EditableLine
        value={form.title}
        className="font-display text-3xl text-navy"
        onSave={(title) => run(() => updateIntakeFormAction(form.id, { title }))}
      />
      <EditableLine
        value={form.intro ?? ""}
        placeholder="Add a short intro your client will read."
        multiline
        className="mt-2 font-body text-navy/85"
        onSave={(intro) => run(() => updateIntakeFormAction(form.id, { intro }))}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-navy/20 px-2 py-0.5 font-ui text-xs text-navy">
          {form.status === "DRAFT" ? "Draft" : form.status === "OPEN" ? "Open" : "Closed"}
        </span>
        {form.status === "DRAFT" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => openIntakeFormAction(form.id))}
              className="rounded bg-emerald px-4 py-2 font-ui text-sm text-white disabled:opacity-60"
            >
              Open intake
            </button>
            <span className="font-body text-xs text-navy/50">
              Opening makes the link live and locks the questions.
            </span>
          </>
        )}
        {form.status === "OPEN" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeIntakeFormAction(form.id))}
              className="rounded border border-navy/30 px-4 py-2 font-ui text-sm text-navy disabled:opacity-60"
            >
              Close intake
            </button>
            <span className="font-body text-xs text-navy/50">
              Closing kills the link; responses stay.
            </span>
          </>
        )}
      </div>

      {form.status === "OPEN" && (
        <div className="mt-3 rounded border border-emerald/40 bg-white/60 p-3">
          <p className="font-body text-sm text-navy">
            Send this link to your client. No login needed.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-cream px-2 py-1 font-body text-xs text-navy">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded bg-emerald px-3 py-1 font-ui text-xs text-white"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 font-body text-sm text-rust">{error}</p>}

      <h2 className="mt-8 font-ui text-xs uppercase tracking-wide text-navy/50">
        Questions
      </h2>
      {!draft && (
        <p className="mt-1 font-body text-xs text-navy/50">
          Questions are locked once an intake opens — only the title and intro stay editable.
        </p>
      )}
      {items.length === 0 ? (
        <p className="mt-3 font-body text-navy">No questions yet. Add the first one below.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              item={item}
              editable={draft}
              isFirst={i === 0}
              isLast={i === items.length - 1}
            />
          ))}
        </ul>
      )}
      {draft && <AddItemForm formId={form.id} />}
    </div>
  );
}

function EditableLine({
  value,
  onSave,
  className,
  placeholder,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`block w-full text-left ${className} ${value ? "" : "text-navy/40"}`}
      >
        {value || placeholder || "Tap to edit"}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };
  return multiline ? (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      autoFocus
      rows={3}
      className={FIELD}
    />
  ) : (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      autoFocus
      className={FIELD}
    />
  );
}

function ItemCard({
  item,
  editable,
  isFirst,
  isLast,
}: {
  item: ItemRow;
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);

  const run = (fn: () => Promise<ActionState>, done?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      setError(result?.error);
      if (!result?.error) {
        done?.();
        router.refresh();
      }
    });

  if (editing) {
    return (
      <li className="rounded border border-navy/15 bg-white/50 p-3">
        <ItemFieldsForm
          initial={item}
          pending={pending}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={(fields) =>
            run(() => updateIntakeItemAction(item.id, fields), () => setEditing(false))
          }
        />
        {error && <p className="mt-1 font-body text-xs text-rust">{error}</p>}
      </li>
    );
  }

  return (
    <li className="rounded border border-navy/15 bg-white/50 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-body text-sm text-navy">
            {item.prompt}
            {item.required && <span className="text-rust"> *</span>}
          </p>
          <p className="font-ui text-xs text-navy/50">
            {KIND_LABEL[item.kind]}
            {item.kind === "CHOICE" && ` — ${item.choices.join(" / ")}`}
          </p>
          {error && <p className="font-body text-xs text-rust">{error}</p>}
        </div>
        {editable && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Move up"
              disabled={isFirst || pending}
              onClick={() => run(() => moveIntakeItemAction(item.id, "up"))}
              className="px-1.5 font-ui text-navy/60 disabled:opacity-25"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move down"
              disabled={isLast || pending}
              onClick={() => run(() => moveIntakeItemAction(item.id, "down"))}
              className="px-1.5 font-ui text-navy/60 disabled:opacity-25"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-1 font-ui text-xs text-navy/60 hover:text-emerald"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteIntakeItemAction(item.id))}
              className="px-1 font-ui text-xs text-rust"
            >
              ×
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function ItemFieldsForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ItemRow>;
  pending: boolean;
  submitLabel: string;
  onSubmit: (fields: ItemFields) => void;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<IntakeItemKind>(initial?.kind ?? "SHORT_TEXT");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [required, setRequired] = useState(initial?.required ?? true);
  const [choices, setChoices] = useState((initial?.choices ?? []).join("\n"));

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          kind,
          prompt,
          required,
          choices: choices.split("\n").map((c) => c.trim()).filter(Boolean),
        });
      }}
    >
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What do you want to ask for?"
        required
        className={FIELD}
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as IntakeItemKind)}
          className="rounded border border-navy/30 bg-white px-2 py-1 font-ui text-sm text-navy"
        >
          {(Object.keys(KIND_LABEL) as IntakeItemKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 font-ui text-xs text-navy/70">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="accent-emerald"
          />
          Required
        </label>
      </div>
      {kind === "CHOICE" && (
        <textarea
          value={choices}
          onChange={(e) => setChoices(e.target.value)}
          placeholder={"One option per line"}
          rows={3}
          className={FIELD}
        />
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-emerald px-3 py-1 font-ui text-sm text-white disabled:opacity-60"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="font-ui text-sm text-navy/60">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function AddItemForm({ formId }: { formId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="mt-4 rounded border border-dashed border-navy/25 p-3">
      <p className="mb-2 font-ui text-xs uppercase tracking-wide text-navy/50">
        Add a question
      </p>
      <ItemFieldsForm
        key={resetKey}
        pending={pending}
        submitLabel="Add"
        onSubmit={(fields) =>
          startTransition(async () => {
            const result = await addIntakeItemAction(formId, fields);
            setError(result?.error);
            if (!result?.error) {
              setResetKey((k) => k + 1);
              router.refresh();
            }
          })
        }
      />
      {error && <p className="mt-1 font-body text-xs text-rust">{error}</p>}
    </div>
  );
}

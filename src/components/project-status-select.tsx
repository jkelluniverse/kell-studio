"use client";

import { useState, useTransition } from "react";
import type { ProjectStatus } from "@prisma/client";
import { setProjectStatusAction } from "@/app/(app)/actions";

export function ProjectStatusSelect({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <span className="inline-flex flex-col gap-1">
      <select
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as ProjectStatus;
          startTransition(async () => {
            const result = await setProjectStatusAction(projectId, next);
            setError(result?.error);
          });
        }}
        className="rounded border border-navy/30 bg-white px-2 py-1 font-ui text-sm text-navy focus:border-emerald focus:outline-none"
      >
        <option value="ACTIVE">Active</option>
        <option value="PAUSED">Paused</option>
        <option value="DONE">Done</option>
        <option value="ARCHIVED">Archived</option>
      </select>
      {error && <span className="font-body text-xs text-rust">{error}</span>}
    </span>
  );
}

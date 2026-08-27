import type { PhaseStatus } from "@prisma/client";

export const PHASE_LABEL: Record<PhaseStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

// Milestone dates are stored at UTC midnight; format and compare in UTC so
// the date Jacob typed is the date he sees, whatever the phone's zone.
export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isOverdue(dueOn: Date, doneAt: Date | null): boolean {
  return !doneAt && dueOn.getTime() < Date.now();
}

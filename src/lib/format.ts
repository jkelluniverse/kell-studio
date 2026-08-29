import type { CaptureStatus, FactKind, PhaseStatus } from "@prisma/client";

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

export const CAPTURE_LABEL: Record<CaptureStatus, string> = {
  READY: "Ready",
  TRANSCRIBING: "Transcribing",
  EXTRACTING: "Reading",
  REVIEW: "In review",
  DONE: "Done",
  FAILED: "Failed",
};

export const FACT_KIND_LABEL: Record<FactKind, string> = {
  PREFERENCE: "Preference",
  CONSTRAINT: "Constraint",
  VOCABULARY: "Vocabulary",
  FEAR: "Fear",
  GOAL: "Goal",
  TOOL: "Tool",
  PERSON: "Person",
};

export function fmtRelative(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return fmtDate(d);
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

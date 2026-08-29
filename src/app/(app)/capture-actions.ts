"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { getStorage } from "@/adapters/storage";
import { getTranscription } from "@/adapters/transcription";
import { getAI } from "@/adapters/ai";
import {
  createNoteCapture,
  createVoiceCapture,
  processCapture,
  prepareUpload,
  retryCapture,
  DomainRuleError,
  NotFoundError,
} from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { ActionState } from "./actions";
import type { UploadTicket } from "./file-actions";

function messageOf(err: unknown): string {
  if (err instanceof DomainRuleError || err instanceof NotFoundError) {
    return err.message;
  }
  console.error(err);
  return "Something went wrong. Nothing was saved.";
}

function deps() {
  return { storage: getStorage(), transcription: getTranscription(), ai: getAI() };
}

// KS-05 DECISION: saving stays instant and background work still rides the
// tick, but the same tick logic runs once via after() right after a capture
// is created — so a note usually reaches /review in seconds while the cron
// remains the delivery guarantee (and the only poller for slow jobs).
async function rememberProjectAndKick(projectId: string, captureId: string, tenantId: string) {
  const jar = await cookies();
  jar.set("lastProjectId", projectId, { path: "/", maxAge: 60 * 60 * 24 * 90 });
  after(async () => {
    const { forTenant } = await import("@/lib/db");
    await processCapture(deps(), forTenant(tenantId), captureId).catch((err) =>
      console.error("post-save processing failed", err)
    );
  });
}

export async function createNoteCaptureAction(
  projectId: string,
  body: string
): Promise<ActionState> {
  const { db, tenantId } = await requireSession();
  try {
    const capture = await createNoteCapture(db, projectId, body);
    await rememberProjectAndKick(projectId, capture.id, tenantId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function prepareVoiceUploadAction(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadTicket> {
  const { db, tenantId } = await requireSession();
  try {
    return await prepareUpload(db, tenantId, getStorage(), input);
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function createVoiceCaptureAction(
  projectId: string,
  audioKey: string
): Promise<ActionState> {
  const { db, tenantId } = await requireSession();
  try {
    const capture = await createVoiceCapture(db, tenantId, projectId, audioKey);
    await rememberProjectAndKick(projectId, capture.id, tenantId);
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function retryCaptureAction(id: string): Promise<ActionState> {
  const { db, tenantId } = await requireSession();
  try {
    const capture = await retryCapture(db, id);
    after(async () => {
      const { forTenant } = await import("@/lib/db");
      await processCapture(deps(), forTenant(tenantId), capture.id).catch((err) =>
        console.error("retry processing failed", err)
      );
    });
  } catch (err) {
    return { error: messageOf(err) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function captureAudioUrlAction(
  id: string
): Promise<{ url?: string; error?: string }> {
  const { db } = await requireSession();
  try {
    const capture = await db.capture.findUnique({ where: { id } });
    if (!capture || !capture.rawRef) throw new NotFoundError("Recording");
    return { url: await getStorage().getSignedUrl(capture.rawRef) };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

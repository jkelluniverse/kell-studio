// File Vault service layer. Key structure lives here (not in the adapter):
//   t/{tenantId}/p/{projectId}/{id}-{sanitizedFilename}
// Tenant is always the first segment — a leaked key still tells you whose
// it was. Callers pass a scoped client plus the session's tenantId; every
// project id is resolved through the scoped client before any presign.
import { nanoid } from "nanoid";
import type { StorageAdapter } from "@/adapters/storage/types";
import { scopedData, type ScopedDb } from "./scoped";
import { DomainRuleError } from "./domain";
import { NotFoundError } from "./studio";
import type { DocumentSource } from "@prisma/client";

export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per file

// Ported from valentinaapp lib/agreements/files.ts, adapted for Studio.
// (Allowlist-as-record + filename sanitization pattern; entries extended to
// KS-04's list. SVG stays off the list — script-capable.)
export const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  // KS-05 DECISION: audio joins the allowlist so voice memos ride the same
  // presigned path as vault files (and the vault gains audio for free).
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
}

export function assertUploadAllowed(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME[mimeType]) {
    throw new DomainRuleError(
      "That file type isn't supported — images, PDFs, office documents, text files, and zips are."
    );
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
    throw new DomainRuleError("Files can be up to 100 MB each.");
  }
}

export function buildObjectKey(
  tenantId: string,
  projectId: string,
  filename: string
): string {
  return `t/${tenantId}/p/${projectId}/${nanoid(16)}-${sanitizeFilename(filename)}`;
}

export interface UploadRequest {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validates and presigns one upload. The scoped project lookup runs before
 * any presign — a foreign projectId dies as NotFoundError here.
 */
export async function prepareUpload(
  db: ScopedDb,
  tenantId: string,
  storage: StorageAdapter,
  input: UploadRequest
): Promise<{ key: string; url: string }> {
  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new NotFoundError("Project");
  assertUploadAllowed(input.mimeType, input.sizeBytes);
  const key = buildObjectKey(tenantId, input.projectId, input.filename);
  const url = await storage.getSignedPutUrl(key, {
    contentType: input.mimeType,
    contentLength: input.sizeBytes,
  });
  return { key, url };
}

export interface RegisterUploadInput extends UploadRequest {
  key: string;
  source?: DocumentSource;
  intakeResponseId?: string;
  intakeItemId?: string;
}

/** Records the Document row after the browser finished its direct upload. */
export async function registerUpload(
  db: ScopedDb,
  tenantId: string,
  input: RegisterUploadInput
) {
  const prefix = `t/${tenantId}/p/${input.projectId}/`;
  if (!input.key.startsWith(prefix)) {
    throw new DomainRuleError("That upload doesn't belong to this project.");
  }
  const project = await db.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new NotFoundError("Project");
  assertUploadAllowed(input.mimeType, input.sizeBytes);
  return db.document.create({
    data: scopedData({
      projectId: input.projectId,
      title: input.filename,
      originalName: input.filename,
      r2Key: input.key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      source: input.source ?? "JACOB",
      intakeResponseId: input.intakeResponseId ?? null,
      intakeItemId: input.intakeItemId ?? null,
    }),
  });
}

export async function renameDocument(db: ScopedDb, id: string, title: string) {
  if (!title.trim()) throw new DomainRuleError("A file needs a name.");
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError("File");
  return db.document.update({ where: { id }, data: { title: title.trim() } });
}

export async function deleteDocument(
  db: ScopedDb,
  storage: StorageAdapter,
  id: string
) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError("File");
  await db.document.delete({ where: { id } });
  if (doc.r2Key) await storage.deleteObject(doc.r2Key);
  return doc;
}

/** Short-lived view/download URL for one document. */
export async function documentUrl(
  db: ScopedDb,
  storage: StorageAdapter,
  id: string,
  opts: { download?: boolean } = {}
): Promise<string> {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || !doc.r2Key) throw new NotFoundError("File");
  const previewable =
    doc.mimeType?.startsWith("image/") || doc.mimeType === "application/pdf";
  return storage.getSignedUrl(doc.r2Key, {
    download: opts.download ?? !previewable,
    filename: doc.originalName ?? doc.title,
  });
}

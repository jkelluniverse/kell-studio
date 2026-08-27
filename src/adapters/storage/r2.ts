// Cloudflare R2 via the S3-compatible API. Written clean for Studio: the
// valentinaapp storage adapter (lib/storage.ts) only ever implemented its
// local-disk driver, and its bytes-through-the-server shape is exactly what
// KS-04 forbids. Uploads: browser -> R2 with a presigned PUT constrained to
// content type + length; downloads: short-lived presigned GET.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter } from "./types";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — R2 storage is unconfigured.`);
  return v;
}

export function createR2Storage(): StorageAdapter {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  });
  const Bucket = env("R2_BUCKET");

  return {
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType })
      );
    },

    async getSignedUrl(key, opts = {}) {
      return presign(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: opts.download
            ? `attachment; filename="${(opts.filename ?? "download").replace(/"/g, "")}"`
            : undefined,
        }),
        { expiresIn: opts.expiresSeconds ?? 300 }
      );
    },

    async getSignedPutUrl(key, opts) {
      return presign(
        client,
        new PutObjectCommand({
          Bucket,
          Key: key,
          ContentType: opts.contentType,
          ContentLength: opts.contentLength,
        }),
        { expiresIn: opts.expiresSeconds ?? 600 }
      );
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async headObject(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType };
      } catch {
        return null;
      }
    },
  };
}

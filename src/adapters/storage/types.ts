// The storage adapter contract. Keys are opaque strings; the adapter knows
// nothing about projects or tenants — key structure is app-code's business
// (see src/lib/db/files.ts).
export interface StorageAdapter {
  /** Server-side write (small system-generated objects only — user file
   * bytes go browser → storage via getSignedPutUrl, never through Next). */
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Short-lived GET URL; download forces attachment disposition. */
  getSignedUrl(
    key: string,
    opts?: { download?: boolean; filename?: string; expiresSeconds?: number }
  ): Promise<string>;
  // KS-04 DECISION: the spec's four methods can't express direct-to-R2
  // browser uploads; getSignedPutUrl is the fifth, constrained to the exact
  // content type and length so a client can't presign one thing and upload
  // another.
  getSignedPutUrl(
    key: string,
    opts: { contentType: string; contentLength: number; expiresSeconds?: number }
  ): Promise<string>;
  deleteObject(key: string): Promise<void>;
  headObject(
    key: string
  ): Promise<{ sizeBytes: number; contentType?: string } | null>;
}

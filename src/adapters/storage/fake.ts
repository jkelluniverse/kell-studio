// In-memory storage for tests, and the dev driver when R2 env is absent.
// In dev the "signed" URLs point at the /api/dev-storage route, which reads
// and writes this same store — so the full browser upload flow works
// locally without R2. Never active when R2 env vars are configured.
import type { StorageAdapter } from "./types";

export interface FakeStorage extends StorageAdapter {
  store: Map<string, { body: Uint8Array; contentType: string }>;
  calls: { presignedPuts: string[]; presignedGets: string[]; deletes: string[] };
}

export function createFakeStorage(baseUrl = "http://localhost:3000"): FakeStorage {
  const store = new Map<string, { body: Uint8Array; contentType: string }>();
  const calls = {
    presignedPuts: [] as string[],
    presignedGets: [] as string[],
    deletes: [] as string[],
  };

  return {
    store,
    calls,
    async putObject(key, body, contentType) {
      store.set(key, { body, contentType });
    },
    async getSignedUrl(key, opts = {}) {
      calls.presignedGets.push(key);
      const params = new URLSearchParams({ key });
      if (opts.download) params.set("download", "1");
      if (opts.filename) params.set("filename", opts.filename);
      return `${baseUrl}/api/dev-storage?${params.toString()}`;
    },
    async getSignedPutUrl(key, opts) {
      calls.presignedPuts.push(key);
      const params = new URLSearchParams({ key, put: "1", type: opts.contentType });
      return `${baseUrl}/api/dev-storage?${params.toString()}`;
    },
    async deleteObject(key) {
      calls.deletes.push(key);
      store.delete(key);
    },
    async headObject(key) {
      const entry = store.get(key);
      return entry
        ? { sizeBytes: entry.body.byteLength, contentType: entry.contentType }
        : null;
    },
  };
}

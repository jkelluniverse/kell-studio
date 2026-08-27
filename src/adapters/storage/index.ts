import type { StorageAdapter } from "./types";
import { createR2Storage } from "./r2";
import { createFakeStorage, type FakeStorage } from "./fake";

export type { StorageAdapter };

const globalStore = globalThis as unknown as {
  __studioStorage?: StorageAdapter;
  __studioFakeStorage?: FakeStorage;
};

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

/**
 * The process-wide storage adapter: R2 when configured, otherwise the
 * in-memory dev driver (served through /api/dev-storage). Production
 * should always have R2 env set — the fallback exists so local dev and
 * the browser test flow work end to end without credentials.
 */
export function getStorage(): StorageAdapter {
  if (!globalStore.__studioStorage) {
    if (r2Configured()) {
      globalStore.__studioStorage = createR2Storage();
    } else {
      globalStore.__studioFakeStorage = createFakeStorage(
        process.env.AUTH_URL ?? "http://localhost:3000"
      );
      globalStore.__studioStorage = globalStore.__studioFakeStorage;
    }
  }
  return globalStore.__studioStorage;
}

/** Dev-storage route access to the fake store; null when R2 is configured. */
export function getFakeStorage(): FakeStorage | null {
  getStorage();
  return globalStore.__studioFakeStorage ?? null;
}

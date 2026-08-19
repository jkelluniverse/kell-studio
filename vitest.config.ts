import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // The scoped tests share one database; keep them in a single worker so
    // truncation in one file can't race another.
    fileParallelism: false,
  },
});

// Prisma CLI config (replaces the deprecated package.json#prisma block).
// The CLI stops auto-loading .env when this file exists, so load it here —
// a no-op in environments (Railway, CI) that inject real env vars.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

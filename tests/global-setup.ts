// Pushes the Prisma schema to the test database before the suite runs, so
// `pnpm vitest run` works against any empty Postgres pointed at by
// DATABASE_URL.
import { execSync } from "node:child_process";
import "dotenv/config";

export default function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the test suite.");
  }
  execSync("pnpm prisma db push --skip-generate", { stdio: "inherit" });
}

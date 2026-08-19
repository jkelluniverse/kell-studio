// KS-01 DECISION: the health endpoint needs a raw `SELECT 1` but app code
// may not import the raw client. This helper lives inside src/lib/db (the
// trust boundary), touches no tenant data, and returns only a boolean.
// It is deliberately NOT re-exported from ./index — the health route
// imports it by name from "@/lib/db/health".
import { prisma } from "./prisma";

export async function dbHealthy(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

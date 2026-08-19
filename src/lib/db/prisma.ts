// Raw PrismaClient singleton. This file is ONLY importable from inside
// src/lib/db/ — an ESLint no-restricted-imports rule errors on any other
// import path. App code goes through forTenant() in ./scoped instead.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

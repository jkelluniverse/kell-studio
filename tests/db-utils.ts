import type { PrismaClient } from "@prisma/client";

// Empties every table in FK-safe order. The test database is a throwaway —
// both suites wipe before and after so a stray isRoot tenant can never leak
// between files.
export async function wipeDatabase(prisma: PrismaClient) {
  await prisma.aIMessage.deleteMany();
  await prisma.aIThread.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.factCitation.deleteMany();
  await prisma.fact.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.document.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.idea.deleteMany();
  await prisma.capture.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}

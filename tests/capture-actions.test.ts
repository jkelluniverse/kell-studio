import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
// Raw client for fixtures only, same exception as the other suites.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant } from "../src/lib/db/scoped";
import { createClient, createProject } from "../src/lib/db/studio";
import { wipeDatabase } from "./db-utils";

// Regression guard for the KS-05 FAB bug: a domain error inside a capture
// server action must surface as a non-success ActionState carrying the
// plain-English message — never a silent success. (Server actions always
// answer HTTP 200; the returned state is the success signal.) Only the
// session is mocked; the action body, scoped db, and error translation run
// for real.
let tenantAId: string;
let tenantBId: string;
let projectBId: string;

vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ db: forTenant(tenantAId), tenantId: tenantAId }),
  requireScopedDb: async () => forTenant(tenantAId),
}));

beforeAll(async () => {
  await wipeDatabase(prisma);
  const tenantA = await prisma.tenant.create({
    data: { slug: "act-tenant-a", name: "Action Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { slug: "act-tenant-b", name: "Action Tenant B" },
  });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;
  const clientB = await createClient(forTenant(tenantB.id), { name: "B Client" });
  projectBId = (
    await createProject(forTenant(tenantB.id), clientB.id, { name: "B Project" })
  ).id;
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

describe("capture actions surface domain errors — no silent success", () => {
  it('empty projectId (the original FAB bug) returns { error: "Project not found." }', async () => {
    const { createNoteCaptureAction } = await import(
      "../src/app/(app)/capture-actions"
    );
    const result = await createNoteCaptureAction("", "A perfectly good note.");
    expect(result.error).toBe("Project not found.");
    expect(await prisma.capture.count()).toBe(0); // and nothing was written
  });

  it("a foreign tenant's projectId returns the same not-found message", async () => {
    const { createNoteCaptureAction } = await import(
      "../src/app/(app)/capture-actions"
    );
    const result = await createNoteCaptureAction(projectBId, "Sneaky note.");
    expect(result.error).toBe("Project not found.");
    expect(await prisma.capture.count({ where: { tenantId: tenantBId } })).toBe(0);
  });

  it("an empty note body returns the domain-rule sentence", async () => {
    const { createNoteCaptureAction } = await import(
      "../src/app/(app)/capture-actions"
    );
    const result = await createNoteCaptureAction("irrelevant", "   ");
    expect(result.error).toBe("A note needs some words.");
  });
});

import { beforeAll, afterAll, describe, expect, it } from "vitest";
// Raw client for fixtures only, same exception as the other suites.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant } from "../src/lib/db/scoped";
import { DomainRuleError, setPhaseStatus } from "../src/lib/db/domain";
import {
  addMilestone,
  addPhase,
  createClient,
  createProject,
  deleteClient,
  deletePhase,
  movePhase,
  NotFoundError,
  setMilestoneDone,
  setProjectStatus,
} from "../src/lib/db/studio";
import { wipeDatabase } from "./db-utils";

let dbA: ReturnType<typeof forTenant>;
let dbB: ReturnType<typeof forTenant>;

beforeAll(async () => {
  await wipeDatabase(prisma);
  const tenantA = await prisma.tenant.create({
    data: { slug: "studio-tenant-a", name: "Studio Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { slug: "studio-tenant-b", name: "Studio Tenant B" },
  });
  dbA = forTenant(tenantA.id);
  dbB = forTenant(tenantB.id);
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

describe("client create (slugs)", () => {
  it("generates a kebab slug and dedupes collisions within the tenant", async () => {
    const first = await createClient(dbA, { name: "Acme & Co." });
    expect(first.slug).toBe("acme-co");
    const second = await createClient(dbA, { name: "Acme Co" });
    expect(second.slug).toBe("acme-co-2");
    // Same name in another tenant is not a collision.
    const other = await createClient(dbB, { name: "Acme Co" });
    expect(other.slug).toBe("acme-co");
    expect(other.tenantId).not.toBe(first.tenantId);
  });

  it("rejects a blank name and a malformed email in plain sentences", async () => {
    await expect(createClient(dbA, { name: "  " })).rejects.toBeInstanceOf(
      DomainRuleError
    );
    await expect(
      createClient(dbA, { name: "Emailless", contactEmail: "not-an-email" })
    ).rejects.toThrow(/email/);
  });
});

describe("client delete guard", () => {
  it("blocks while projects exist, succeeds when none", async () => {
    const client = await createClient(dbA, { name: "Deletable" });
    const project = await createProject(dbA, client.id, { name: "Blocker" });

    await expect(deleteClient(dbA, client.id)).rejects.toBeInstanceOf(
      DomainRuleError
    );

    await dbA.project.delete({ where: { id: project.id } });
    const deleted = await deleteClient(dbA, client.id);
    expect(deleted.id).toBe(client.id);
  });
});

describe("project create", () => {
  it("lands ACTIVE with zero phases and a deduped slug", async () => {
    const client = await createClient(dbA, { name: "Project Owner" });
    const project = await createProject(dbA, client.id, {
      name: "Site Rebuild",
      summary: "  One paragraph.  ",
    });
    expect(project.status).toBe("ACTIVE");
    expect(project.slug).toBe("site-rebuild");
    expect(project.summary).toBe("One paragraph.");
    expect(await dbA.phase.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe("phase ordering", () => {
  it("appends with order = max+1 and swaps atomically, twice rapidly", async () => {
    const client = await createClient(dbA, { name: "Phased" });
    const project = await createProject(dbA, client.id, { name: "Ladder" });
    const p1 = await addPhase(dbA, project.id, "One");
    const p2 = await addPhase(dbA, project.id, "Two");
    const p3 = await addPhase(dbA, project.id, "Three");
    expect([p1.order, p2.order, p3.order]).toEqual([1, 2, 3]);

    // Two rapid reorders back to back; @@unique([projectId, order]) must
    // hold through both (the swap parks on a negative order inside its
    // transaction, so no intermediate state collides).
    await movePhase(dbA, p3.id, "up");
    await movePhase(dbA, p3.id, "up");

    const after = await dbA.phase.findMany({
      where: { projectId: project.id },
      orderBy: { order: "asc" },
    });
    expect(after.map((p) => p.name)).toEqual(["Three", "One", "Two"]);
    expect(after.map((p) => p.order)).toEqual([1, 2, 3]);

    // Edge no-op: already first.
    await movePhase(dbA, p3.id, "up");
    expect(
      (await dbA.phase.findUniqueOrThrow({ where: { id: p3.id } })).order
    ).toBe(1);
  });
});

describe("phase delete guard", () => {
  it("blocks with milestones present", async () => {
    const client = await createClient(dbA, { name: "Guarded" });
    const project = await createProject(dbA, client.id, { name: "Guards" });
    const phase = await addPhase(dbA, project.id, "Has milestone");
    const milestone = await addMilestone(dbA, phase.id, {
      title: "Thing",
      dueOn: new Date("2026-09-15T00:00:00Z"),
    });

    await expect(deletePhase(dbA, phase.id)).rejects.toBeInstanceOf(
      DomainRuleError
    );

    await dbA.milestone.delete({ where: { id: milestone.id } });
    const deleted = await deletePhase(dbA, phase.id);
    expect(deleted.id).toBe(phase.id);
  });
});

describe("BLOCKED end-to-end through the action path", () => {
  it("rejects BLOCKED without a note and accepts it with one", async () => {
    const client = await createClient(dbA, { name: "Blocked Co" });
    const project = await createProject(dbA, client.id, { name: "Stuck" });
    const phase = await addPhase(dbA, project.id, "Stalls");

    // Same call chain the server action makes (auth wrapper aside).
    await expect(setPhaseStatus(dbA, phase.id, "BLOCKED")).rejects.toBeInstanceOf(
      DomainRuleError
    );
    const blocked = await setPhaseStatus(
      dbA,
      phase.id,
      "BLOCKED",
      "Waiting on their logo file."
    );
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.blockedNote).toBe("Waiting on their logo file.");
  });
});

describe("milestone done toggle", () => {
  it("sets and clears doneAt", async () => {
    const client = await createClient(dbA, { name: "Toggler" });
    const project = await createProject(dbA, client.id, { name: "Toggles" });
    const phase = await addPhase(dbA, project.id, "Doing");
    const milestone = await addMilestone(dbA, phase.id, {
      title: "Ship it",
      dueOn: new Date("2026-09-20T00:00:00Z"),
      ownedBy: "CLIENT",
      note: "waiting on their logo file",
    });
    expect(milestone.doneAt).toBeNull();

    const done = await setMilestoneDone(dbA, milestone.id, true);
    expect(done.doneAt).not.toBeNull();
    const undone = await setMilestoneDone(dbA, milestone.id, false);
    expect(undone.doneAt).toBeNull();
  });
});

describe("foreign ids resolve to not-found", () => {
  it("tenant A acting on tenant B's project id gets NotFoundError", async () => {
    const clientB = await createClient(dbB, { name: "B Only" });
    const projectB = await createProject(dbB, clientB.id, { name: "B Project" });

    await expect(
      setProjectStatus(dbA, projectB.id, "PAUSED")
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(addPhase(dbA, projectB.id, "Intrusion")).rejects.toBeInstanceOf(
      NotFoundError
    );
    // And the row is untouched.
    const untouched = await dbB.project.findUniqueOrThrow({
      where: { id: projectB.id },
    });
    expect(untouched.status).toBe("ACTIVE");
  });
});

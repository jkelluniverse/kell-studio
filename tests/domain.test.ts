import { beforeAll, afterAll, describe, expect, it } from "vitest";
// Raw client for fixtures only, same exception as tests/scoped.test.ts.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant, scopedData } from "../src/lib/db/scoped";
import {
  createFact,
  confirmFact,
  recordDecision,
  setPhaseStatus,
  createReminder,
  createDocument,
  CitationRequiredError,
  RationaleRequiredError,
  DomainRuleError,
} from "../src/lib/db/domain";
import { wipeDatabase } from "./db-utils";

let dbA: ReturnType<typeof forTenant>;
let dbB: ReturnType<typeof forTenant>;
let projectA: { id: string };
let captureA1: { id: string };
let captureA2: { id: string };
let captureB: { id: string };
let phaseA: { id: string };
let milestoneA: { id: string };
let ideaA: { id: string };

beforeAll(async () => {
  await wipeDatabase(prisma);

  const tenantA = await prisma.tenant.create({
    data: { slug: "dom-tenant-a", name: "Domain Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { slug: "dom-tenant-b", name: "Domain Tenant B" },
  });
  dbA = forTenant(tenantA.id);
  dbB = forTenant(tenantB.id);

  const clientA = await dbA.client.create({
    data: scopedData({ name: "Client A", slug: "client-a" }),
  });
  projectA = await dbA.project.create({
    data: scopedData({ clientId: clientA.id, name: "Project A", slug: "project-a" }),
  });
  captureA1 = await dbA.capture.create({
    data: scopedData({ projectId: projectA.id, kind: "TEXT", body: "They hate popups." }),
  });
  captureA2 = await dbA.capture.create({
    data: scopedData({ projectId: projectA.id, kind: "TEXT", body: "Launch is in June." }),
  });

  const clientB = await dbB.client.create({
    data: scopedData({ name: "Client B", slug: "client-b" }),
  });
  const projectB = await dbB.project.create({
    data: scopedData({ clientId: clientB.id, name: "Project B", slug: "project-b" }),
  });
  captureB = await dbB.capture.create({
    data: scopedData({ projectId: projectB.id, kind: "TEXT", body: "B's secret note." }),
  });

  phaseA = await dbA.phase.create({
    data: scopedData({ projectId: projectA.id, name: "Discovery", order: 1 }),
  });
  milestoneA = await dbA.milestone.create({
    data: scopedData({ phaseId: phaseA.id, title: "Kickoff", dueOn: new Date("2026-09-01") }),
  });
  ideaA = await dbA.idea.create({
    data: scopedData({ title: "PLE parking-lot idea" }),
  });
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

describe("citation gate (createFact)", () => {
  it("throws CitationRequiredError with zero citations", async () => {
    await expect(
      createFact(dbA, {
        projectId: projectA.id,
        kind: "PREFERENCE",
        body: "No citations here.",
        citations: [],
      })
    ).rejects.toBeInstanceOf(CitationRequiredError);
  });

  it("creates the Fact and its FactCitation with one valid citation", async () => {
    const fact = await createFact(dbA, {
      projectId: projectA.id,
      kind: "PREFERENCE",
      body: "The client dislikes popups.",
      citations: [{ captureId: captureA1.id, excerpt: "They hate popups." }],
    });
    expect(fact.status).toBe("PROPOSED");

    const rows = await dbA.factCitation.findMany({ where: { factId: fact.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.captureId).toBe(captureA1.id);
    expect(rows[0]!.excerpt).toBe("They hate popups.");
  });

  it("throws naming the id when a cited capture does not exist", async () => {
    await expect(
      createFact(dbA, {
        projectId: projectA.id,
        kind: "GOAL",
        body: "Grounded in nothing.",
        citations: [{ captureId: "no-such-capture" }],
      })
    ).rejects.toThrow(/no-such-capture/);
  });

  it("cannot cite a capture from another tenant", async () => {
    await expect(
      createFact(dbA, {
        projectId: projectA.id,
        kind: "CONSTRAINT",
        body: "Trying to cite tenant B's capture.",
        citations: [{ captureId: captureB.id }],
      })
    ).rejects.toBeInstanceOf(CitationRequiredError);
  });

  it("confirmFact stamps status and confirmedAt", async () => {
    const fact = await createFact(dbA, {
      projectId: projectA.id,
      kind: "TOOL",
      body: "They use Notion.",
      citations: [{ captureId: captureA1.id }],
    });
    const confirmed = await confirmFact(dbA, fact.id);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).not.toBeNull();
  });
});

describe("capture deletion is restricted while cited", () => {
  it("blocks deleting a cited capture; cascades citations when the fact goes first", async () => {
    const fact = await createFact(dbA, {
      projectId: projectA.id,
      kind: "CONSTRAINT",
      body: "Launch is in June.",
      citations: [{ captureId: captureA2.id }],
    });

    await expect(
      dbA.capture.delete({ where: { id: captureA2.id } })
    ).rejects.toThrow();

    await dbA.fact.delete({ where: { id: fact.id } });
    expect(
      await dbA.factCitation.count({ where: { captureId: captureA2.id } })
    ).toBe(0);

    const deleted = await dbA.capture.delete({ where: { id: captureA2.id } });
    expect(deleted.id).toBe(captureA2.id);
  });
});

describe("rationale gate (recordDecision)", () => {
  it("throws RationaleRequiredError on a whitespace rationale", async () => {
    await expect(
      recordDecision(dbA, {
        projectId: projectA.id,
        title: "Undocumented decision",
        rationale: " ",
        decidedOn: new Date("2026-08-01"),
      })
    ).rejects.toBeInstanceOf(RationaleRequiredError);
  });

  it("records with a real rationale; superseding links the old row and keeps both", async () => {
    const d1 = await recordDecision(dbA, {
      projectId: projectA.id,
      title: "Use Postgres",
      rationale: "Graphs are small per person; simplest thing that works.",
      decidedOn: new Date("2026-08-01"),
    });
    const d2 = await recordDecision(dbA, {
      projectId: projectA.id,
      title: "Use Postgres on Railway",
      rationale: "Same choice, pinned to the deploy platform.",
      decidedOn: new Date("2026-08-15"),
      supersedes: d1.id,
    });

    const old = await dbA.decision.findUnique({ where: { id: d1.id } });
    expect(old!.supersededById).toBe(d2.id);
    const current = await dbA.decision.findUnique({ where: { id: d2.id } });
    expect(current!.supersededById).toBeNull();
  });
});

describe("reminder shape (createReminder)", () => {
  it("throws with both targets", async () => {
    await expect(
      createReminder(dbA, {
        kind: "MILESTONE",
        milestoneId: milestoneA.id,
        ideaId: ideaA.id,
        remindOn: new Date("2026-08-25"),
      })
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("throws with neither target", async () => {
    await expect(
      createReminder(dbA, { kind: "IDEA", remindOn: new Date("2026-08-25") })
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("throws when the target does not match the kind", async () => {
    await expect(
      createReminder(dbA, {
        kind: "IDEA",
        milestoneId: milestoneA.id,
        remindOn: new Date("2026-08-25"),
      })
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("succeeds with a milestoneId and kind MILESTONE", async () => {
    const reminder = await createReminder(dbA, {
      kind: "MILESTONE",
      milestoneId: milestoneA.id,
      remindOn: new Date("2026-08-30"),
    });
    expect(reminder.milestoneId).toBe(milestoneA.id);
    expect(reminder.ideaId).toBeNull();
  });
});

describe("phase block note (setPhaseStatus)", () => {
  it("throws on BLOCKED without a note", async () => {
    await expect(setPhaseStatus(dbA, phaseA.id, "BLOCKED")).rejects.toBeInstanceOf(
      DomainRuleError
    );
  });

  it("succeeds on BLOCKED with a note", async () => {
    const phase = await setPhaseStatus(
      dbA,
      phaseA.id,
      "BLOCKED",
      "Waiting on client sign-off."
    );
    expect(phase.status).toBe("BLOCKED");
    expect(phase.blockedNote).toBe("Waiting on client sign-off.");
  });
});

describe("document shape (createDocument)", () => {
  it("throws with neither r2Key nor body", async () => {
    await expect(
      createDocument(dbA, { projectId: projectA.id, title: "Empty doc" })
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it("succeeds with an inline body", async () => {
    const doc = await createDocument(dbA, {
      projectId: projectA.id,
      title: "Kickoff notes",
      body: "# Notes\nBuilt to last.",
      mimeType: "text/markdown",
    });
    expect(doc.body).toContain("Notes");
    expect(doc.r2Key).toBeNull();
  });
});

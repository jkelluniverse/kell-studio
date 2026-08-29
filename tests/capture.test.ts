import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
// Raw client for fixtures only, same exception as the other suites.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant } from "../src/lib/db/scoped";
import { confirmFact } from "../src/lib/db/domain";
import { createClient, createProject } from "../src/lib/db/studio";
import { buildObjectKey } from "../src/lib/db/files";
import {
  createNoteCapture,
  createVoiceCapture,
  discardProposedFact,
  processCapture,
  retryCapture,
  tick,
  validateProposals,
  type PipelineDeps,
} from "../src/lib/db/captures";
import { createFakeStorage } from "../src/adapters/storage/fake";
import { createFakeTranscription, type FakeTranscription } from "../src/adapters/transcription/fake";
import { createFakeAI, type FakeAI } from "../src/adapters/ai/fake";
import { wipeDatabase } from "./db-utils";

let dbA: ReturnType<typeof forTenant>;
let dbB: ReturnType<typeof forTenant>;
let tenantAId: string;
let projectA: { id: string };
let projectB: { id: string };
let transcription: FakeTranscription;
let ai: FakeAI;
let deps: PipelineDeps;

beforeAll(async () => {
  await wipeDatabase(prisma);
  const tenantA = await prisma.tenant.create({
    data: { slug: "cap-tenant-a", name: "Capture Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { slug: "cap-tenant-b", name: "Capture Tenant B" },
  });
  tenantAId = tenantA.id;
  dbA = forTenant(tenantA.id);
  dbB = forTenant(tenantB.id);

  const clientA = await createClient(dbA, { name: "Capture Client" });
  projectA = await createProject(dbA, clientA.id, { name: "Capture Project" });
  const clientB = await createClient(dbB, { name: "Other Client" });
  projectB = await createProject(dbB, clientB.id, { name: "Other Project" });
});

beforeEach(() => {
  transcription = createFakeTranscription();
  ai = createFakeAI();
  deps = { storage: createFakeStorage(), transcription, ai };
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

const NOTE =
  "They want the launch in June. The budget is capped at ten thousand dollars.";

describe("note capture -> extraction -> review", () => {
  it("proposes facts with valid excerpts; non-substring excerpts are dropped", async () => {
    ai.nextProposals = [
      { kind: "GOAL", body: "The client wants a June launch.", excerpt: "the launch in June" },
      { kind: "CONSTRAINT", body: "Invented fact.", excerpt: "THIS IS NOT IN THE NOTE" },
      {
        kind: "CONSTRAINT",
        body: "The budget is capped at $10k.",
        excerpt: "capped at ten thousand dollars",
      },
    ];

    const capture = await createNoteCapture(dbA, projectA.id, NOTE);
    expect(capture.status).toBe("EXTRACTING");

    await processCapture(deps, dbA, capture.id);
    const after = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(after.status).toBe("REVIEW");

    const facts = await dbA.fact.findMany({
      where: { citations: { some: { captureId: capture.id } } },
      include: { citations: true },
    });
    expect(facts).toHaveLength(2);
    for (const fact of facts) {
      expect(fact.status).toBe("PROPOSED");
      expect(NOTE.includes(fact.citations[0]!.excerpt!)).toBe(true);
    }
  });

  it("zero-fact extraction goes straight to DONE — a normal outcome", async () => {
    ai.nextProposals = [];
    const capture = await createNoteCapture(dbA, projectA.id, "Nothing factual here.");
    await processCapture(deps, dbA, capture.id);
    const after = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(after.status).toBe("DONE");
    expect(
      await dbA.fact.count({ where: { citations: { some: { captureId: capture.id } } } })
    ).toBe(0);
  });

  it("validateProposals drops empty bodies and caps at 8", () => {
    const body = "abc";
    const many = Array.from({ length: 12 }, (_, i) => ({
      kind: "GOAL" as const,
      body: `fact ${i}`,
      excerpt: "a",
    }));
    expect(validateProposals(body, many)).toHaveLength(8);
    expect(
      validateProposals(body, [{ kind: "GOAL", body: "  ", excerpt: "a" }])
    ).toHaveLength(0);
  });
});

describe("voice capture pipeline", () => {
  it("TRANSCRIBING -> submit -> poll fills body -> EXTRACTING -> REVIEW via tick", async () => {
    transcription.cannedText = NOTE;
    ai.nextProposals = [
      { kind: "GOAL", body: "The client wants a June launch.", excerpt: "the launch in June" },
    ];
    const key = buildObjectKey(tenantAId, projectA.id, "memo.webm");
    const capture = await createVoiceCapture(dbA, tenantAId, projectA.id, key);
    expect(capture.status).toBe("TRANSCRIBING");

    await tick(deps); // submits the job
    let current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.transcriptJobId).toBeTruthy();
    expect(current.status).toBe("TRANSCRIBING");
    expect(transcription.submitted).toHaveLength(1);

    await tick(deps); // polls: completed -> body filled, EXTRACTING
    current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.body).toBe(NOTE);
    expect(current.status).toBe("EXTRACTING");

    await tick(deps); // extraction -> REVIEW
    current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.status).toBe("REVIEW");
  });

  it("rejects an audio key from another tenant's prefix", async () => {
    const foreignKey = buildObjectKey("someone-else", projectA.id, "memo.webm");
    await expect(
      createVoiceCapture(dbA, tenantAId, projectA.id, foreignKey)
    ).rejects.toThrow(/doesn't belong/);
  });
});

describe("review flows", () => {
  async function proposeOne() {
    ai.nextProposals = [
      { kind: "TOOL", body: "They use Notion.", excerpt: "They use Notion" },
    ];
    const capture = await createNoteCapture(dbA, projectA.id, "They use Notion daily.");
    await processCapture(deps, dbA, capture.id);
    const fact = await dbA.fact.findFirstOrThrow({
      where: { status: "PROPOSED", citations: { some: { captureId: capture.id } } },
    });
    return { capture, fact };
  }

  it("confirm sets confirmedAt", async () => {
    const { fact } = await proposeOne();
    const confirmed = await confirmFact(dbA, fact.id);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it("discard deletes the PROPOSED fact and leaves no rows", async () => {
    const { fact } = await proposeOne();
    await discardProposedFact(dbA, fact.id);
    expect(await dbA.fact.findUnique({ where: { id: fact.id } })).toBeNull();
    expect(await dbA.factCitation.count({ where: { factId: fact.id } })).toBe(0);
  });

  it("discard refuses a confirmed fact — RETIRED is for confirmed history", async () => {
    const { fact } = await proposeOne();
    await confirmFact(dbA, fact.id);
    await expect(discardProposedFact(dbA, fact.id)).rejects.toThrow(/proposed/i);
  });
});

describe("tick idempotency", () => {
  it("two concurrent runs extract once — the claim count-check guards it", async () => {
    ai.nextProposals = [
      { kind: "GOAL", body: "One fact.", excerpt: "the launch in June" },
    ];
    const capture = await createNoteCapture(dbA, projectA.id, NOTE);

    await Promise.all([
      processCapture(deps, dbA, capture.id),
      processCapture(deps, dbA, capture.id),
    ]);

    expect(ai.calls).toHaveLength(1);
    expect(
      await dbA.fact.count({ where: { citations: { some: { captureId: capture.id } } } })
    ).toBe(1);
  });
});

describe("failure and retry", () => {
  it("transcription failure sets FAILED + failureNote; retry clears and recovers", async () => {
    const key = buildObjectKey(tenantAId, projectA.id, "memo.webm");
    const capture = await createVoiceCapture(dbA, tenantAId, projectA.id, key);
    await tick(deps); // submit
    transcription.failNext = true;
    await tick(deps); // poll -> error
    let current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.status).toBe("FAILED");
    expect(current.failureNote).toMatch(/Transcription failed/);

    ai.nextProposals = [];
    await retryCapture(dbA, capture.id);
    current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.status).toBe("TRANSCRIBING");
    expect(current.failureNote).toBeNull();

    await tick(deps); // resubmit
    await tick(deps); // poll ok -> EXTRACTING
    await tick(deps); // extract (zero facts) -> DONE
    current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.status).toBe("DONE");
  });

  it("extraction failure sets FAILED with the reason", async () => {
    ai.failNext = true;
    const capture = await createNoteCapture(dbA, projectA.id, "Some note.");
    await processCapture(deps, dbA, capture.id);
    const current = await dbA.capture.findUniqueOrThrow({ where: { id: capture.id } });
    expect(current.status).toBe("FAILED");
    expect(current.failureNote).toMatch(/Extraction failed/);
  });
});

describe("two-tenant sweep", () => {
  it("captures and proposed facts stay confined to their tenant", async () => {
    ai.nextProposals = [
      { kind: "GOAL", body: "B's fact.", excerpt: "B-only note" },
    ];
    const captureB = await createNoteCapture(dbB, projectB.id, "B-only note");
    await processCapture(deps, dbB, captureB.id);

    const aCaptures = await dbA.capture.findMany({ where: { id: captureB.id } });
    expect(aCaptures).toHaveLength(0);
    const aProposed = await dbA.fact.findMany({
      where: { status: "PROPOSED", body: "B's fact." },
    });
    expect(aProposed).toHaveLength(0);
    const bProposed = await dbB.fact.findMany({
      where: { status: "PROPOSED", body: "B's fact." },
    });
    expect(bProposed).toHaveLength(1);
  });
});

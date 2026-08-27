import { beforeAll, afterAll, describe, expect, it } from "vitest";
// Raw client for fixtures only, same exception as the other suites.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant, scopedData } from "../src/lib/db/scoped";
import { DomainRuleError } from "../src/lib/db/domain";
import { NotFoundError, createClient, createProject } from "../src/lib/db/studio";
import {
  assertUploadAllowed,
  buildObjectKey,
  prepareUpload,
} from "../src/lib/db/files";
import {
  addIntakeItem,
  closeIntakeForm,
  createIntakeForm,
  moveIntakeItem,
  openIntakeForm,
  presignIntakeUpload,
  resolveIntakeToken,
  submitIntake,
} from "../src/lib/db/intake";
import { createFakeStorage } from "../src/adapters/storage/fake";
import { createFakeEmail } from "../src/adapters/email/fake";
import { wipeDatabase } from "./db-utils";

let dbA: ReturnType<typeof forTenant>;
let dbB: ReturnType<typeof forTenant>;
let tenantAId: string;
let projectA: { id: string };
let projectB: { id: string };

beforeAll(async () => {
  await wipeDatabase(prisma);
  const tenantA = await prisma.tenant.create({
    data: { slug: "intake-tenant-a", name: "Intake Tenant A" },
  });
  const tenantB = await prisma.tenant.create({
    data: { slug: "intake-tenant-b", name: "Intake Tenant B" },
  });
  tenantAId = tenantA.id;
  dbA = forTenant(tenantA.id);
  dbB = forTenant(tenantB.id);

  const clientA = await createClient(dbA, { name: "Vault Client" });
  projectA = await createProject(dbA, clientA.id, { name: "Vault Project" });
  const clientB = await createClient(dbB, { name: "Other Client" });
  projectB = await createProject(dbB, clientB.id, { name: "Other Project" });
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

describe("key scheme + presign scoping", () => {
  it("keys start t/{tenantId}/p/{projectId}/ for the acting tenant", async () => {
    const storage = createFakeStorage();
    const { key } = await prepareUpload(dbA, tenantAId, storage, {
      projectId: projectA.id,
      filename: "logo final (v2).png",
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(key.startsWith(`t/${tenantAId}/p/${projectA.id}/`)).toBe(true);
    expect(storage.calls.presignedPuts).toEqual([key]);
  });

  it("a foreign projectId fails scoped lookup before any presign", async () => {
    const storage = createFakeStorage();
    await expect(
      prepareUpload(dbA, tenantAId, storage, {
        projectId: projectB.id,
        filename: "sneaky.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(storage.calls.presignedPuts).toHaveLength(0);
  });

  it("disallowed mime and oversize are rejected at presign", async () => {
    const storage = createFakeStorage();
    await expect(
      prepareUpload(dbA, tenantAId, storage, {
        projectId: projectA.id,
        filename: "app.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 1024,
      })
    ).rejects.toBeInstanceOf(DomainRuleError);
    await expect(
      prepareUpload(dbA, tenantAId, storage, {
        projectId: projectA.id,
        filename: "big.pdf",
        mimeType: "application/pdf",
        sizeBytes: 101 * 1024 * 1024,
      })
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect(storage.calls.presignedPuts).toHaveLength(0);
    expect(() => assertUploadAllowed("image/png", 1)).not.toThrow();
    expect(buildObjectKey("t1", "p1", "a/../b.png")).toContain("t/t1/p/p1/");
  });
});

describe("intake lifecycle + token isolation", () => {
  it("DRAFT and CLOSED resolve with their status; OPEN serves; unknown is null", async () => {
    const form = await createIntakeForm(dbA, projectA.id, { title: "Kickoff intake" });
    expect(form.token.length).toBeGreaterThanOrEqual(24);

    let resolved = await resolveIntakeToken(form.token);
    expect(resolved!.form.status).toBe("DRAFT");

    await addIntakeItem(dbA, form.id, { kind: "SHORT_TEXT", prompt: "Name?" });
    await openIntakeForm(dbA, form.id);
    resolved = await resolveIntakeToken(form.token);
    expect(resolved!.form.status).toBe("OPEN");

    await closeIntakeForm(dbA, form.id);
    resolved = await resolveIntakeToken(form.token);
    expect(resolved!.form.status).toBe("CLOSED");

    expect(await resolveIntakeToken("not-a-real-token-aaaaaaaaaaaa")).toBeNull();
  });

  it("token resolution is exact and never leaks across tenants", async () => {
    const formB = await createIntakeForm(dbB, projectB.id, { title: "B intake" });
    const resolved = await resolveIntakeToken(formB.token);
    // Resolves to B's tenant scope — A's data is invisible through it.
    expect(resolved!.tenantId).not.toBe(tenantAId);
    expect(
      await resolved!.db.project.findUnique({ where: { id: projectA.id } })
    ).toBeNull();
  });

  it("item reorder keeps @@unique([formId, order]) through rapid swaps", async () => {
    const form = await createIntakeForm(dbA, projectA.id, { title: "Ordered" });
    const i1 = await addIntakeItem(dbA, form.id, { kind: "SHORT_TEXT", prompt: "One" });
    const i2 = await addIntakeItem(dbA, form.id, { kind: "SHORT_TEXT", prompt: "Two" });
    const i3 = await addIntakeItem(dbA, form.id, { kind: "SHORT_TEXT", prompt: "Three" });
    expect([i1.order, i2.order, i3.order]).toEqual([1, 2, 3]);

    await moveIntakeItem(dbA, i3.id, "up");
    await moveIntakeItem(dbA, i3.id, "up");
    const after = await dbA.intakeItem.findMany({
      where: { formId: form.id },
      orderBy: { order: "asc" },
    });
    expect(after.map((i) => i.prompt)).toEqual(["Three", "One", "Two"]);
    expect(after.map((i) => i.order)).toEqual([1, 2, 3]);
  });
});

describe("submission", () => {
  async function openForm() {
    const form = await createIntakeForm(dbA, projectA.id, { title: "Full intake" });
    const text = await addIntakeItem(dbA, form.id, {
      kind: "SHORT_TEXT",
      prompt: "Company name?",
    });
    const choice = await addIntakeItem(dbA, form.id, {
      kind: "CHOICE",
      prompt: "Pick one",
      choices: ["Alpha", "Beta"],
    });
    const fileReq = await addIntakeItem(dbA, form.id, {
      kind: "FILE_REQUEST",
      prompt: "Your logo",
    });
    await openIntakeForm(dbA, form.id);
    const resolved = (await resolveIntakeToken(
      (await dbA.intakeForm.findUniqueOrThrow({ where: { id: form.id } })).token
    ))!;
    return { form, text, choice, fileReq, resolved };
  }

  it("required unanswered rejects the whole submission — no partial rows", async () => {
    const { form, text, resolved } = await openForm();
    const email = createFakeEmail();
    await expect(
      submitIntake(
        resolved,
        { email, appBaseUrl: "http://test", ownerEmail: "owner@test" },
        {
          answers: [{ itemId: text.id, valueText: "Acme" }],
          files: [], // required FILE_REQUEST missing
        }
      )
    ).rejects.toBeInstanceOf(DomainRuleError);
    expect(await dbA.intakeResponse.count({ where: { formId: form.id } })).toBe(0);
    expect(await dbA.intakeAnswer.count()).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("valid submit writes Response + Answers + Documents and sends one email", async () => {
    const { form, text, choice, fileReq, resolved } = await openForm();
    const email = createFakeEmail();
    const key = buildObjectKey(tenantAId, projectA.id, "logo.png");

    const response = await submitIntake(
      resolved,
      { email, appBaseUrl: "http://test", ownerEmail: "owner@test" },
      {
        respondentName: "Pat",
        respondentEmail: "pat@example.com",
        answers: [
          { itemId: text.id, valueText: "Acme" },
          { itemId: choice.id, valueChoice: "Beta" },
        ],
        files: [
          {
            itemId: fileReq.id,
            key,
            filename: "logo.png",
            mimeType: "image/png",
            sizeBytes: 2048,
          },
        ],
      }
    );

    expect(response!.submittedAt).not.toBeNull();
    const answers = await dbA.intakeAnswer.findMany({
      where: { responseId: response!.id },
    });
    expect(answers).toHaveLength(2);

    const docs = await dbA.document.findMany({
      where: { intakeResponseId: response!.id },
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.source).toBe("CLIENT_INTAKE");
    expect(docs[0]!.intakeItemId).toBe(fileReq.id);
    expect(docs[0]!.r2Key).toBe(key);

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("owner@test");
    expect(email.sent[0]!.subject).toContain(form.title);
  });

  it("an out-of-list choice is rejected", async () => {
    const { choice, text, fileReq, resolved } = await openForm();
    const email = createFakeEmail();
    await expect(
      submitIntake(
        resolved,
        { email, appBaseUrl: "http://test" },
        {
          answers: [
            { itemId: text.id, valueText: "Acme" },
            { itemId: choice.id, valueChoice: "Gamma" },
          ],
          files: [
            {
              itemId: fileReq.id,
              key: buildObjectKey(tenantAId, projectA.id, "x.png"),
              filename: "x.png",
              mimeType: "image/png",
              sizeBytes: 10,
            },
          ],
        }
      )
    ).rejects.toThrow(/Gamma/);
  });

  it("honeypot-filled submit is dropped silently — nothing written", async () => {
    const { form, resolved } = await openForm();
    const email = createFakeEmail();
    const result = await submitIntake(
      resolved,
      { email, appBaseUrl: "http://test", ownerEmail: "owner@test" },
      {
        website: "http://spam.example",
        answers: [],
        files: [],
      }
    );
    expect(result).toBeNull();
    expect(await dbA.intakeResponse.count({ where: { formId: form.id } })).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it("public presign rejects a non-FILE_REQUEST item and a disallowed mime", async () => {
    const { text, fileReq, resolved } = await openForm();
    const storage = createFakeStorage();
    await expect(
      presignIntakeUpload(storage, resolved, {
        itemId: text.id,
        filename: "a.png",
        mimeType: "image/png",
        sizeBytes: 10,
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      presignIntakeUpload(storage, resolved, {
        itemId: fileReq.id,
        filename: "a.exe",
        mimeType: "application/x-msdownload",
        sizeBytes: 10,
      })
    ).rejects.toBeInstanceOf(DomainRuleError);
    const ok = await presignIntakeUpload(storage, resolved, {
      itemId: fileReq.id,
      filename: "a.png",
      mimeType: "image/png",
      sizeBytes: 10,
    });
    expect(ok.key.startsWith(`t/${tenantAId}/p/${projectA.id}/`)).toBe(true);
  });
});

describe("scopedData interplay", () => {
  it("registerUpload-created documents stay tenant-confined", async () => {
    const doc = await dbA.document.findFirst({ where: { source: "CLIENT_INTAKE" } });
    expect(doc).not.toBeNull();
    expect(doc!.tenantId).toBe(tenantAId);
    expect(await dbB.document.findUnique({ where: { id: doc!.id } })).toBeNull();
  });

  it("wipe keeps working with the new tables", async () => {
    // A throwaway row in each new table, then wipe order holds (afterAll).
    const form = await createIntakeForm(dbA, projectA.id, { title: "Wipe check" });
    expect(form.id).toBeTruthy();
    // scopedData still stamps correctly on intake models.
    const item = await dbA.intakeItem.create({
      data: scopedData({
        formId: form.id,
        order: 99,
        kind: "YES_NO",
        prompt: "stamped?",
      }),
    });
    expect(item.tenantId).toBe(tenantAId);
  });
});

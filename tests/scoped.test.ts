import { execSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
// Tests may reach the raw client to arrange fixtures; the ESLint boundary
// covers src/ and tests/, so this one file carries a targeted disable that
// documents the exception.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import {
  forTenant,
  getRootTenant,
  assertTenantExists,
  TenantMismatchError,
} from "../src/lib/db/scoped";
import { scopedData } from "../src/lib/db/scoped";
import { createFact } from "../src/lib/db/domain";
import { wipeDatabase } from "./db-utils";

let tenantA: { id: string };
let tenantB: { id: string };
const A_EMAIL = "a-owner@example.com";
const B_EMAIL = "b-owner@example.com";

beforeAll(async () => {
  await wipeDatabase(prisma);

  tenantA = await prisma.tenant.create({
    data: { slug: "tenant-a", name: "Tenant A", isRoot: true },
  });
  tenantB = await prisma.tenant.create({
    data: { slug: "tenant-b", name: "Tenant B" },
  });
  await prisma.user.create({
    data: { tenantId: tenantA.id, email: A_EMAIL, passwordHash: "x" },
  });
  await prisma.user.create({
    data: { tenantId: tenantB.id, email: B_EMAIL, passwordHash: "x" },
  });
});

afterAll(async () => {
  // Leave the throwaway database empty — a stray isRoot tenant left behind
  // here would hijack getRootTenant() for anything else using this DB.
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

describe("forTenant argument validation", () => {
  it("throws on empty string", () => {
    expect(() => forTenant("")).toThrow();
  });

  it("throws on undefined", () => {
    expect(() => forTenant(undefined as unknown as string)).toThrow();
  });

  it("throws on non-string", () => {
    expect(() => forTenant(123 as unknown as string)).toThrow();
  });
});

describe("read scoping", () => {
  it("findMany returns only the scoped tenant's rows", async () => {
    const users = await forTenant(tenantA.id).user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe(A_EMAIL);
    expect(users[0]!.tenantId).toBe(tenantA.id);
  });

  it("findUnique cannot see another tenant's row", async () => {
    const user = await forTenant(tenantA.id).user.findUnique({
      where: { email: B_EMAIL },
    });
    expect(user).toBeNull();
  });

  it("count only counts the scoped tenant's rows", async () => {
    expect(await forTenant(tenantA.id).user.count()).toBe(1);
    expect(await forTenant(tenantB.id).user.count()).toBe(1);
  });
});

describe("write scoping", () => {
  it("create with a foreign tenantId throws TenantMismatchError", async () => {
    await expect(
      forTenant(tenantA.id).user.create({
        data: {
          email: "intruder@example.com",
          passwordHash: "x",
          tenantId: tenantB.id,
        },
      })
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });

  it("create without tenantId stamps the scoped tenant", async () => {
    const created = await forTenant(tenantA.id).user.create({
      // The cast drops the type-level tenantId requirement; the scoped layer
      // stamps it at runtime — that stamping is exactly what this test proves.
      data: {
        email: "second-a@example.com",
        passwordHash: "x",
      } as Prisma.UserUncheckedCreateInput,
    });
    expect(created.tenantId).toBe(tenantA.id);
    await prisma.user.delete({ where: { id: created.id } });
  });

  it("updateMany touches zero rows of other tenants", async () => {
    const result = await forTenant(tenantA.id).user.updateMany({
      data: { passwordHash: "rotated" },
    });
    expect(result.count).toBe(1);

    const bUser = await prisma.user.findUniqueOrThrow({
      where: { email: B_EMAIL },
    });
    expect(bUser.passwordHash).toBe("x");
  });

  it("deleteMany cannot cross the tenant wall", async () => {
    const result = await forTenant(tenantA.id).user.deleteMany({
      where: { email: B_EMAIL },
    });
    expect(result.count).toBe(0);
    expect(
      await prisma.user.findUnique({ where: { email: B_EMAIL } })
    ).not.toBeNull();
  });
});

describe("helpers", () => {
  it("getRootTenant returns the isRoot tenant", async () => {
    const root = await getRootTenant();
    expect(root.id).toBe(tenantA.id);
  });

  it("assertTenantExists passes for a real tenant and throws for a fake one", async () => {
    await expect(assertTenantExists(tenantA.id)).resolves.toBeUndefined();
    await expect(assertTenantExists("nope")).rejects.toThrow();
  });
});

describe("domain tenant wall sweep (KS-02)", () => {
  it("Client, Project, Capture, Fact rows stay confined to their tenant", async () => {
    const dbA = forTenant(tenantA.id);
    const dbB = forTenant(tenantB.id);

    for (const [db, tag] of [
      [dbA, "a"],
      [dbB, "b"],
    ] as const) {
      const client = await db.client.create({
        data: scopedData({ name: `Sweep Client ${tag}`, slug: `sweep-client-${tag}` }),
      });
      const project = await db.project.create({
        data: scopedData({
          clientId: client.id,
          name: `Sweep Project ${tag}`,
          slug: `sweep-project-${tag}`,
        }),
      });
      const capture = await db.capture.create({
        data: scopedData({ projectId: project.id, kind: "TEXT", body: `note ${tag}` }),
      });
      await createFact(db, {
        projectId: project.id,
        kind: "GOAL",
        body: `fact ${tag}`,
        citations: [{ captureId: capture.id }],
      });
    }

    for (const model of ["client", "project", "capture", "fact"] as const) {
      const rowsA = await (dbA[model].findMany as () => Promise<
        { tenantId: string }[]
      >)();
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]!.tenantId).toBe(tenantA.id);
    }
  });
});

describe("import boundary (ESLint)", () => {
  it("fails when a file under src/app/ imports @/lib/db/prisma", () => {
    const source = 'import { prisma } from "@/lib/db/prisma";\nconsole.log(prisma);\n';
    let failed = false;
    let output = "";
    try {
      output = execSync(
        "pnpm exec eslint --stdin --stdin-filename src/app/__probe__.ts --no-warn-ignored",
        { input: source, encoding: "utf8" }
      );
    } catch (err) {
      failed = true;
      output = (err as { stdout?: string }).stdout ?? "";
    }
    expect(failed).toBe(true);
    expect(output).toContain("no-restricted-imports");
  });

  it("fails when a file under src/app/ calls .fact.create(", () => {
    const source =
      'declare const db: { fact: { create(args: object): void } };\ndb.fact.create({});\n';
    let failed = false;
    let output = "";
    try {
      output = execSync(
        "pnpm exec eslint --stdin --stdin-filename src/app/__probe__.ts --no-warn-ignored",
        { input: source, encoding: "utf8" }
      );
    } catch (err) {
      failed = true;
      output = (err as { stdout?: string }).stdout ?? "";
    }
    expect(failed).toBe(true);
    expect(output).toContain("no-restricted-syntax");
    expect(output).toContain("createFact()");
  });

  it("allows the same import inside src/lib/db/", () => {
    const source = 'import { prisma } from "./prisma";\nconsole.log(prisma);\n';
    const output = execSync(
      "pnpm exec eslint --stdin --stdin-filename src/lib/db/__probe__.ts --no-warn-ignored",
      { input: source, encoding: "utf8" }
    );
    expect(output).not.toContain("no-restricted-imports");
  });
});

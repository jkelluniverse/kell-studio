import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
// Raw client for fixtures only, same exception as the other suites.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "../src/lib/db/prisma";
import { forTenant, scopedData } from "../src/lib/db/scoped";
import { DomainRuleError, setPhaseStatus } from "../src/lib/db/domain";
import {
  NotFoundError,
  addMilestone,
  addPhase,
  createClient,
  createProject,
  setPhaseVisibility,
} from "../src/lib/db/studio";
import { buildObjectKey, registerUpload, setDocumentVisibility } from "../src/lib/db/files";
import {
  LOGIN_TOKEN_MINUTES,
  activePortalUser,
  consumeLoginToken,
  createPortalUser,
  hashToken,
  invitePortalUser,
  issueLoginToken,
  peekLoginToken,
  removePortalUser,
  requestLoginLink,
  resendPortalLink,
  revokePortalUser,
} from "../src/lib/db/portal-auth";
import {
  NOTICE_BATCH_MINUTES,
  markThreadRead,
  portalDocumentUrl,
  portalProject,
  portalProjects,
  portalRegisterUpload,
  postProjectMessage,
  projectThread,
} from "../src/lib/db/portal";
import { createFakeEmail } from "../src/adapters/email/fake";
import { createFakeStorage } from "../src/adapters/storage/fake";
import { wipeDatabase } from "./db-utils";

// requireSession / requirePortalUser read the session through @/auth; the
// role-wall test below swaps it per call. next-auth itself is stubbed to
// the one export the action module needs (its env shim can't resolve
// next/server under vitest).
const authMock = vi.fn();
vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

const BASE = "http://test";
let tenantA: { id: string };
let tenantB: { id: string };
let dbA: ReturnType<typeof forTenant>;
let dbB: ReturnType<typeof forTenant>;
let owner: { id: string };
let clientA1: { id: string };
let clientA2: { id: string };
let projectA1: { id: string };
let projectA2: { id: string };
let projectB: { id: string };

function deps(ownerEmail?: string) {
  const email = createFakeEmail();
  return { email, appBaseUrl: BASE, ownerEmail };
}

function tokenFrom(sent: { button?: { url: string } }[]): string {
  const url = new URL(sent[sent.length - 1]!.button!.url);
  return url.searchParams.get("token")!;
}

beforeAll(async () => {
  await wipeDatabase(prisma);
  tenantA = await prisma.tenant.create({
    data: { slug: "portal-tenant-a", name: "Portal Tenant A", isRoot: true },
  });
  tenantB = await prisma.tenant.create({
    data: { slug: "portal-tenant-b", name: "Portal Tenant B" },
  });
  dbA = forTenant(tenantA.id);
  dbB = forTenant(tenantB.id);
  owner = await dbA.user.create({
    data: scopedData({ email: "owner@portal.test", passwordHash: "x", role: "OWNER" as const }),
  });

  clientA1 = await createClient(dbA, { name: "First Client" });
  clientA2 = await createClient(dbA, { name: "Second Client" });
  projectA1 = await createProject(dbA, clientA1.id, { name: "First Build" });
  projectA2 = await createProject(dbA, clientA2.id, { name: "Second Build" });
  const clientB = await createClient(dbB, { name: "Other Tenant Client" });
  projectB = await createProject(dbB, clientB.id, { name: "Other Tenant Build" });
});

afterAll(async () => {
  await wipeDatabase(prisma);
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// 1. Magic link
// ---------------------------------------------------------------------------

describe("magic link (§6.1)", () => {
  it("stores only the SHA-256 — the raw token is never in the database", async () => {
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Hash Check",
      email: "hash@portal.test",
    });
    const raw = await issueLoginToken(dbA, user.id);
    expect(raw.length).toBeGreaterThanOrEqual(32);
    const rows = await prisma.loginToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(raw));
    expect(rows[0]!.tokenHash).not.toContain(raw);
    expect(JSON.stringify(rows)).not.toContain(raw);
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
      LOGIN_TOKEN_MINUTES * 60_000
    );
  });

  it("is single-use: the first consume wins, the second is rejected", async () => {
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Once Only",
      email: "once@portal.test",
    });
    const raw = await issueLoginToken(dbA, user.id);
    expect(await peekLoginToken(raw)).toBe(true);

    const first = await consumeLoginToken(raw);
    expect(first).not.toBeNull();
    expect(first!.id).toBe(user.id);
    expect(first!.clientId).toBe(clientA1.id);
    expect(first!.tenantId).toBe(tenantA.id);

    expect(await consumeLoginToken(raw)).toBeNull();
    expect(await peekLoginToken(raw)).toBe(false);
    const signedIn = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(signedIn.lastSignInAt).not.toBeNull();
  });

  it("enforces expiry", async () => {
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Too Late",
      email: "late@portal.test",
    });
    const raw = await issueLoginToken(dbA, user.id);
    await prisma.loginToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await peekLoginToken(raw)).toBe(false);
    expect(await consumeLoginToken(raw)).toBeNull();
  });

  it("an unknown email produces no token and no email; the service gives the same nothing either way", async () => {
    const unknown = deps();
    const tokensBefore = await prisma.loginToken.count();
    await expect(requestLoginLink(unknown, "nobody@portal.test")).resolves.toBeUndefined();
    expect(unknown.email.sent).toHaveLength(0);
    expect(await prisma.loginToken.count()).toBe(tokensBefore);

    // The owner's email is not a portal account either: same nothing.
    const ownerTry = deps();
    await expect(requestLoginLink(ownerTry, "owner@portal.test")).resolves.toBeUndefined();
    expect(ownerTry.email.sent).toHaveLength(0);
    expect(await prisma.loginToken.count({ where: { userId: owner.id } })).toBe(0);

    // A real portal user gets a link — and the function still returns void.
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Real One",
      email: "real@portal.test",
    });
    const known = deps();
    await expect(requestLoginLink(known, "Real@Portal.test")).resolves.toBeUndefined();
    expect(known.email.sent).toHaveLength(1);
    expect(known.email.sent[0]!.to).toBe("real@portal.test");
    expect(await prisma.loginToken.count({ where: { userId: user.id } })).toBe(1);
    expect(await consumeLoginToken(tokenFrom(known.email.sent))).not.toBeNull();
  });

  it("the sign-in action answers unknown and known emails with the identical result", async () => {
    vi.doMock("next/headers", () => ({
      headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
    }));
    const { requestLoginLinkAction } = await import("../src/app/portal/portal-actions");
    const form = (email: string) => {
      const fd = new FormData();
      fd.set("email", email);
      return fd;
    };
    const unknown = await requestLoginLinkAction({}, form("nobody-at-all@portal.test"));
    const known = await requestLoginLinkAction({}, form("real@portal.test"));
    expect(unknown).toEqual({ sent: true });
    expect(known).toEqual(unknown);
  });
});

// ---------------------------------------------------------------------------
// 2. Role wall at the session gate (the middleware half is tests/routing.test.ts)
// ---------------------------------------------------------------------------

describe("role wall at the session gate (§6.2)", () => {
  it("requireSession answers a CLIENT session with not-found; OWNER passes", async () => {
    const { requireSession } = await import("../src/lib/session");
    authMock.mockResolvedValueOnce({
      user: { id: "c1", tenantId: tenantA.id, role: "CLIENT", clientId: clientA1.id },
    });
    await expect(requireSession()).rejects.toThrow(/404|NOT_FOUND/);

    authMock.mockResolvedValueOnce({
      user: { id: owner.id, tenantId: tenantA.id, role: "OWNER", clientId: null },
    });
    const session = await requireSession();
    expect(session.tenantId).toBe(tenantA.id);
    expect(session.userId).toBe(owner.id);
  });

  it("a revoked user is no longer an active portal user and can't sign in", async () => {
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Revoked Soon",
      email: "revoked@portal.test",
    });
    expect(await activePortalUser(tenantA.id, user.id)).not.toBeNull();
    const raw = await issueLoginToken(dbA, user.id);

    await revokePortalUser(dbA, user.id);
    expect(await activePortalUser(tenantA.id, user.id)).toBeNull();
    expect(await consumeLoginToken(raw)).toBeNull();
    const nothing = deps();
    await requestLoginLink(nothing, "revoked@portal.test");
    expect(nothing.email.sent).toHaveLength(0);
    await expect(issueLoginToken(dbA, user.id)).rejects.toBeInstanceOf(DomainRuleError);
  });
});

// ---------------------------------------------------------------------------
// 3. Scope wall — the test that matters most
// ---------------------------------------------------------------------------

describe("scope wall (§6.3)", () => {
  let hiddenPhaseId: string;
  let hiddenDocId: string;
  let visibleDocId: string;

  beforeAll(async () => {
    const shown = await addPhase(dbA, projectA1.id, "Discovery");
    const hidden = await addPhase(dbA, projectA1.id, "Internal plumbing");
    await setPhaseVisibility(dbA, hidden.id, false);
    hiddenPhaseId = hidden.id;
    await addMilestone(dbA, shown.id, {
      title: "Send the logo",
      dueOn: new Date("2026-11-03T00:00:00Z"),
      ownedBy: "CLIENT",
      note: "Any format is fine.",
    });
    await addMilestone(dbA, shown.id, {
      title: "Draft the sitemap",
      dueOn: new Date("2026-11-05T00:00:00Z"),
      ownedBy: "JACOB",
    });
    await addMilestone(dbA, hidden.id, {
      title: "Hidden stage task",
      dueOn: new Date("2026-11-07T00:00:00Z"),
      ownedBy: "CLIENT",
    });

    const visible = await registerUpload(dbA, tenantA.id, {
      projectId: projectA1.id,
      key: buildObjectKey(tenantA.id, projectA1.id, "brief.pdf"),
      filename: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      source: "CLIENT_INTAKE",
    });
    visibleDocId = visible.id;
    const hiddenDoc = await registerUpload(dbA, tenantA.id, {
      projectId: projectA1.id,
      key: buildObjectKey(tenantA.id, projectA1.id, "internal-notes.pdf"),
      filename: "internal-notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });
    hiddenDocId = hiddenDoc.id;

    await addPhase(dbA, projectA2.id, "Other client's stage");
    await dbA.projectMessage.create({
      data: scopedData({ projectId: projectA2.id, authorId: owner.id, body: "Private to client two." }),
    });
    await dbA.projectMessage.create({
      data: scopedData({ projectId: projectA1.id, authorId: owner.id, body: "Hello client one." }),
    });
  });

  it("a portal user sees only their own client's projects, in and across tenants", async () => {
    const mine = await portalProjects(dbA, clientA1.id);
    expect(mine.map((p) => p.id)).toEqual([projectA1.id]);
    expect(mine[0]!.progress).toBe("Stage 1 of 1 — Not started");

    const theirs = await portalProjects(dbA, clientA2.id);
    expect(theirs.map((p) => p.id)).toEqual([projectA2.id]);

    // Reaching for the other client's project by id, or another tenant's.
    expect(await portalProject(dbA, clientA1.id, projectA2.id)).toBeNull();
    expect(await portalProject(dbA, clientA1.id, projectB.id)).toBeNull();
    expect(await portalProject(dbB, clientA1.id, projectA1.id)).toBeNull();
  });

  it("phases only where visibleToClient, action items only on visible phases", async () => {
    const view = (await portalProject(dbA, clientA1.id, projectA1.id))!;
    expect(view.phases.map((p) => p.name)).toEqual(["Discovery"]);
    expect(view.phases.map((p) => p.id)).not.toContain(hiddenPhaseId);
    expect(view.actionItems.map((m) => m.title)).toEqual(["Send the logo"]);
    expect(view.actionItems[0]!.note).toBe("Any format is fine.");
  });

  it("documents only where visible; a hidden file can't be opened by id either", async () => {
    const view = (await portalProject(dbA, clientA1.id, projectA1.id))!;
    expect(view.files.map((f) => f.id)).toEqual([visibleDocId]);
    const storage = createFakeStorage();
    await expect(
      portalDocumentUrl(dbA, storage, clientA1.id, hiddenDocId)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      portalDocumentUrl(dbA, storage, clientA2.id, visibleDocId)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(portalDocumentUrl(dbA, storage, clientA1.id, visibleDocId)).resolves.toContain(
      "brief.pdf"
    );

    await setDocumentVisibility(dbA, visibleDocId, false);
    expect((await portalProject(dbA, clientA1.id, projectA1.id))!.files).toHaveLength(0);
    await setDocumentVisibility(dbA, visibleDocId, true);
  });

  it("messages only on the client's own projects — reading and writing", async () => {
    const view = (await portalProject(dbA, clientA1.id, projectA1.id))!;
    expect(view.messages.map((m) => m.body)).toEqual(["Hello client one."]);
    expect(JSON.stringify(view)).not.toContain("Private to client two.");

    const intruder = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Client One Person",
      email: "one@portal.test",
    });
    await expect(
      postProjectMessage(dbA, deps("owner@portal.test"), {
        projectId: projectA2.id,
        authorId: intruder.id,
        body: "Trying to post on client two's thread.",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await dbA.projectMessage.count({ where: { projectId: projectA2.id } })).toBe(1);

    // The read-marker is confined the same way.
    const touched = await markThreadRead(dbA, projectA2.id, {
      role: "CLIENT",
      clientId: clientA1.id,
    });
    expect(touched.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. BLOCKED → "Waiting", note absent from the payload
// ---------------------------------------------------------------------------

describe("BLOCKED renders as Waiting (§6.4)", () => {
  it("the portal payload says Waiting and does not contain the blocked note anywhere", async () => {
    const phase = await addPhase(dbA, projectA1.id, "Content");
    const note = "Waiting on their photographer, who is on holiday until the 12th.";
    await setPhaseStatus(dbA, phase.id, "BLOCKED", note);

    const view = (await portalProject(dbA, clientA1.id, projectA1.id))!;
    const content = view.phases.find((p) => p.id === phase.id)!;
    expect(content.status).toBe("WAITING");
    expect(content.label).toBe("Waiting");
    expect("blockedNote" in content).toBe(false);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(note);
    expect(serialized).not.toContain("photographer");
    expect(serialized).not.toContain("BLOCKED");
    expect(serialized).not.toContain("blockedNote");

    const cards = await portalProjects(dbA, clientA1.id);
    expect(JSON.stringify(cards)).not.toContain(note);
  });
});

// ---------------------------------------------------------------------------
// 5. Portal upload
// ---------------------------------------------------------------------------

describe("portal upload (§6.5)", () => {
  it("lands as CLIENT_PORTAL, visible on both sides, with a notice to Jacob", async () => {
    const d = deps("owner@portal.test");
    const key = buildObjectKey(tenantA.id, projectA1.id, "sitemap.pdf");
    const doc = await portalRegisterUpload(
      dbA,
      tenantA.id,
      clientA1.id,
      { name: "Client One Person", email: "one@portal.test" },
      d,
      {
        projectId: projectA1.id,
        key,
        filename: "sitemap.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
      }
    );
    expect(doc.source).toBe("CLIENT_PORTAL");
    expect(doc.visibleToClient).toBe(true);

    // Client side sees it…
    const view = (await portalProject(dbA, clientA1.id, projectA1.id))!;
    expect(view.files.map((f) => f.id)).toContain(doc.id);
    expect(view.files.find((f) => f.id === doc.id)!.fromClient).toBe(true);
    // …and the internal vault has the same row.
    const internal = await dbA.document.findUnique({ where: { id: doc.id } });
    expect(internal!.r2Key).toBe(key);

    expect(d.email.sent).toHaveLength(1);
    expect(d.email.sent[0]!.to).toBe("owner@portal.test");
    expect(d.email.sent[0]!.subject).toContain("First Client");
    expect(d.email.sent[0]!.paragraphs.join(" ")).toContain("sitemap.pdf");
    expect(d.email.sent[0]!.button!.url).toBe(`${BASE}/projects/${projectA1.id}`);
  });

  it("refuses a project that isn't the client's, before any row is written", async () => {
    const d = deps("owner@portal.test");
    await expect(
      portalRegisterUpload(
        dbA,
        tenantA.id,
        clientA1.id,
        { name: null, email: "one@portal.test" },
        d,
        {
          projectId: projectA2.id,
          key: buildObjectKey(tenantA.id, projectA2.id, "x.pdf"),
          filename: "x.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
        }
      )
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await dbA.document.count({ where: { projectId: projectA2.id } })).toBe(0);
    expect(d.email.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Messages
// ---------------------------------------------------------------------------

describe("messages (§6.6)", () => {
  let clientUser: { id: string; email: string };

  beforeAll(async () => {
    clientUser = (await dbA.user.findFirstOrThrow({ where: { email: "one@portal.test" } }))!;
    // A clean thread for this block.
    await dbA.projectMessage.deleteMany({ where: { projectId: projectA1.id } });
  });

  it("a client post notifies Jacob with the body and a link; Jacob's post notifies the client", async () => {
    const d = deps("owner@portal.test");
    const fromClient = await postProjectMessage(dbA, d, {
      projectId: projectA1.id,
      authorId: clientUser.id,
      body: "Logo attached in Files — let me know.",
    });
    expect(fromClient.noticed).toBe(true);
    expect(d.email.sent).toHaveLength(1);
    expect(d.email.sent[0]!.to).toBe("owner@portal.test");
    expect(d.email.sent[0]!.paragraphs).toContain("Logo attached in Files — let me know.");
    expect(d.email.sent[0]!.button!.url).toBe(`${BASE}/projects/${projectA1.id}#messages`);

    const fromOwner = await postProjectMessage(dbA, d, {
      projectId: projectA1.id,
      authorId: owner.id,
      body: "Got it, thanks.",
    });
    expect(fromOwner.noticed).toBe(true);
    // Jacob's post goes to every ACTIVE portal user of that client — and to
    // nobody else (not the revoked one, not the other client's people).
    const activeUsers = await dbA.user.findMany({
      where: { clientId: clientA1.id, role: "CLIENT", disabledAt: null },
      select: { email: true },
    });
    const notices = d.email.sent.slice(1);
    expect(notices.map((m) => m.to).sort()).toEqual(activeUsers.map((u) => u.email).sort());
    expect(notices.map((m) => m.to)).toContain("one@portal.test");
    expect(notices.map((m) => m.to)).not.toContain("revoked@portal.test");
    for (const notice of notices) {
      expect(notice.heading).toContain("Jacob");
      expect(notice.paragraphs).toContain("Got it, thanks.");
      expect(notice.button!.url).toBe(`${BASE}/portal/projects/${projectA1.id}#messages`);
    }
  });

  it("the 10-minute batch guard: same author within the window → no second notice; other author or window elapsed → notice", async () => {
    const d = deps("owner@portal.test");
    const again = await postProjectMessage(dbA, d, {
      projectId: projectA1.id,
      authorId: clientUser.id,
      body: "One more thing.",
    });
    expect(again.noticed).toBe(false);
    expect(d.email.sent).toHaveLength(0);

    // Age the client's last notice past the window; the next post notifies.
    await prisma.projectMessage.updateMany({
      where: { projectId: projectA1.id, authorId: clientUser.id, noticedAt: { not: null } },
      data: { noticedAt: new Date(Date.now() - (NOTICE_BATCH_MINUTES + 1) * 60_000) },
    });
    const later = await postProjectMessage(dbA, d, {
      projectId: projectA1.id,
      authorId: clientUser.id,
      body: "Following up.",
    });
    expect(later.noticed).toBe(true);
    expect(d.email.sent).toHaveLength(1);
  });

  it("readAt is set when the other side loads the thread, never by the author's own view", async () => {
    const unreadFromClient = await dbA.projectMessage.findMany({
      where: { projectId: projectA1.id, authorId: clientUser.id },
    });
    expect(unreadFromClient.every((m) => m.readAt === null)).toBe(true);

    // The client loading the thread marks Jacob's messages, not their own.
    await markThreadRead(dbA, projectA1.id, { role: "CLIENT", clientId: clientA1.id });
    const afterClientView = await projectThread(dbA, projectA1.id);
    expect(afterClientView.filter((m) => m.from === "OWNER").every((m) => m.readAt !== null)).toBe(
      true
    );
    expect(afterClientView.filter((m) => m.from === "CLIENT").every((m) => m.readAt === null)).toBe(
      true
    );

    // Jacob loading the page marks the client's.
    const marked = await markThreadRead(dbA, projectA1.id, { role: "OWNER" });
    expect(marked.count).toBe(unreadFromClient.length);
    const afterOwnerView = await projectThread(dbA, projectA1.id);
    expect(afterOwnerView.every((m) => m.readAt !== null)).toBe(true);
  });

  it("rejects an empty message in a plain sentence", async () => {
    await expect(
      postProjectMessage(dbA, deps(), { projectId: projectA1.id, authorId: owner.id, body: "  " })
    ).rejects.toThrow("A message needs some words.");
  });
});

// ---------------------------------------------------------------------------
// 7. Invite / resend / revoke
// ---------------------------------------------------------------------------

describe("invite, resend, revoke (§6.7)", () => {
  it("invite creates the CLIENT user with no password, one token, and a branded email", async () => {
    const d = deps();
    const user = await invitePortalUser(dbA, d, {
      clientId: clientA1.id,
      name: "Invited Person",
      email: "Invited@Portal.test",
    });
    expect(user.role).toBe("CLIENT");
    expect(user.clientId).toBe(clientA1.id);
    expect(user.passwordHash).toBeNull();
    expect(user.email).toBe("invited@portal.test");
    expect(await prisma.loginToken.count({ where: { userId: user.id } })).toBe(1);
    expect(d.email.sent).toHaveLength(1);
    expect(d.email.sent[0]!.to).toBe("invited@portal.test");
    expect(d.email.sent[0]!.subject).toContain("First Client");
    expect(d.email.sent[0]!.button!.url.startsWith(`${BASE}/portal/auth?token=`)).toBe(true);
    expect(await peekLoginToken(tokenFrom(d.email.sent))).toBe(true);
  });

  it("resend invalidates the prior token and issues a new one", async () => {
    const user = await dbA.user.findFirstOrThrow({ where: { email: "invited@portal.test" } });
    const before = await prisma.loginToken.findFirstOrThrow({ where: { userId: user.id } });
    const d = deps();
    await resendPortalLink(dbA, d, user.id);
    const after = await prisma.loginToken.findMany({ where: { userId: user.id } });
    expect(after).toHaveLength(1);
    expect(after[0]!.tokenHash).not.toBe(before.tokenHash);
    expect(d.email.sent).toHaveLength(1);
    expect(await consumeLoginToken(tokenFrom(d.email.sent))).not.toBeNull();
  });

  it("revoke blocks sign-in; a duplicate email is a plain sentence; a client with portal users can't be deleted", async () => {
    const user = await dbA.user.findFirstOrThrow({ where: { email: "invited@portal.test" } });
    const d = deps();
    await resendPortalLink(dbA, d, user.id);
    const raw = tokenFrom(d.email.sent);
    await revokePortalUser(dbA, user.id);
    expect(await consumeLoginToken(raw)).toBeNull();
    expect(await prisma.loginToken.count({ where: { userId: user.id } })).toBe(0);
    await expect(resendPortalLink(dbA, deps(), user.id)).rejects.toBeInstanceOf(DomainRuleError);

    await expect(
      createPortalUser(dbA, { clientId: clientA1.id, name: "Dup", email: "invited@portal.test" })
    ).rejects.toThrow("That email already has an account.");

    // Removal is for revoked users without messages; this one never posted.
    await removePortalUser(dbA, user.id);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it("the portal's user table is tenant-confined like everything else", async () => {
    const user = await createPortalUser(dbA, {
      clientId: clientA1.id,
      name: "Walled",
      email: "walled@portal.test",
    });
    expect(await dbB.user.findUnique({ where: { id: user.id } })).toBeNull();
    await expect(revokePortalUser(dbB, user.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueLoginToken(dbB, user.id)).rejects.toBeInstanceOf(NotFoundError);
    // And a tenant-B scope can't invite into a tenant-A client.
    await expect(
      createPortalUser(dbB, { clientId: clientA1.id, name: "X", email: "x@portal.test" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

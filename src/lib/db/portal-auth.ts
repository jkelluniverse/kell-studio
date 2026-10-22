// Portal auth service (KS-06): magic-link tokens, invites, revocation.
//
// Clients never have passwords. A sign-in is a one-time token: ≥ 32 chars
// of nanoid in the email link, only its SHA-256 at rest, 15-minute expiry,
// consumed exactly once by a conditional write.
//
// KS-06 DECISION: requestLoginLink and the token resolvers below are the
// no-session entry points KS-01 anticipated ("an explicitly named
// function"), alongside resolveIntakeToken (KS-04) and
// findPendingCaptureWork (KS-05). Each resolves ONE row by a globally unique
// column (User.email / LoginToken.tokenHash) on the raw client and hands
// everything after to forTenant(row.tenantId). Nothing else here is unscoped.
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";
import type { EmailAdapter } from "@/adapters/email/types";
import { NAME_OWNER } from "@/lib/brand";
import { prisma } from "./prisma";
import { forTenant, scopedData, type ScopedDb } from "./scoped";
import { DomainRuleError } from "./domain";
import { NotFoundError } from "./studio";

export const LOGIN_TOKEN_MINUTES = 15;
export const LOGIN_TOKEN_LENGTH = 40; // spec floor is 32

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface PortalMailDeps {
  email: EmailAdapter;
  /** Absolute base URL the links are built on (AUTH_URL in production). */
  appBaseUrl: string;
}

export function portalLinkUrl(appBaseUrl: string, rawToken: string): string {
  return `${appBaseUrl}/portal/auth?token=${encodeURIComponent(rawToken)}`;
}

export interface PortalUserSummary {
  id: string;
  email: string;
  name: string | null;
  clientId: string;
  tenantId: string;
}

// ---------------------------------------------------------------------------
// Scoped: inviting, resending, revoking
// ---------------------------------------------------------------------------

export async function listPortalUsers(db: ScopedDb, clientId: string) {
  return db.user.findMany({
    where: { clientId, role: "CLIENT" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      lastSignInAt: true,
      disabledAt: true,
      createdAt: true,
      _count: { select: { messages: true } },
    },
  });
}

/** Creates a CLIENT user under a client. No password, ever. */
export async function createPortalUser(
  db: ScopedDb,
  input: { clientId: string; name: string; email: string }
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new DomainRuleError("A portal user needs a name.");
  if (!EMAIL_SHAPE.test(email)) {
    throw new DomainRuleError("That email doesn't look like an email.");
  }
  const client = await db.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new NotFoundError("Client");
  try {
    return await db.user.create({
      data: scopedData({
        email,
        name,
        role: "CLIENT" as const,
        clientId: client.id,
        passwordHash: null,
      }),
    });
  } catch (err) {
    // User.email is unique across the whole table; the plain sentence beats
    // an unscoped pre-check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new DomainRuleError("That email already has an account.");
    }
    throw err;
  }
}

/**
 * Issues a fresh sign-in token for a portal user and invalidates any unused
 * earlier ones. Returns the RAW token — it is emailed and never stored.
 */
export async function issueLoginToken(db: ScopedDb, userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CLIENT") throw new NotFoundError("Portal user");
  if (user.disabledAt) {
    throw new DomainRuleError("This person's portal access was revoked.");
  }
  const raw = nanoid(LOGIN_TOKEN_LENGTH);
  await db.$transaction(async (tx) => {
    await tx.loginToken.deleteMany({ where: { userId, usedAt: null } });
    await tx.loginToken.create({
      data: scopedData({
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
      }),
    });
  });
  return raw;
}

function inviteEmail(to: string, clientName: string, url: string) {
  return {
    to,
    subject: `Your ${clientName} project portal`,
    heading: "Your portal is ready",
    paragraphs: [
      `${NAME_OWNER} set up a place where you can follow your project: what's done, what's next, your files, and a message thread.`,
      `The button below signs you in — no password needed. It works once and for the next ${LOGIN_TOKEN_MINUTES} minutes; after that, ask for a fresh link from the sign-in page.`,
    ],
    button: { label: "Open my portal", url },
  };
}

function signInEmail(to: string, url: string) {
  return {
    to,
    subject: "Your portal sign-in link",
    heading: "Here's your sign-in link",
    paragraphs: [
      `Tap the button to open your portal. The link works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.`,
      "If you didn't ask for this, you can ignore it — nothing happens until the link is used.",
    ],
    button: { label: "Sign in", url },
  };
}

export async function invitePortalUser(
  db: ScopedDb,
  deps: PortalMailDeps,
  input: { clientId: string; name: string; email: string }
) {
  const user = await createPortalUser(db, input);
  const client = await db.client.findUniqueOrThrow({ where: { id: input.clientId } });
  const raw = await issueLoginToken(db, user.id);
  await deps.email.send(inviteEmail(user.email, client.name, portalLinkUrl(deps.appBaseUrl, raw)));
  return user;
}

export async function resendPortalLink(db: ScopedDb, deps: PortalMailDeps, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CLIENT") throw new NotFoundError("Portal user");
  const raw = await issueLoginToken(db, user.id);
  await deps.email.send(signInEmail(user.email, portalLinkUrl(deps.appBaseUrl, raw)));
  return user;
}

/** Soft-disable: tokens die now, the session dies at its next request. */
export async function revokePortalUser(db: ScopedDb, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CLIENT") throw new NotFoundError("Portal user");
  return db.$transaction(async (tx) => {
    await tx.loginToken.deleteMany({ where: { userId } });
    return tx.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  });
}

// KS-06 DECISION: §2 names Invite / Resend / Revoke. Two small lifecycle
// completions ride along so a revoked user isn't a dead end: Restore (an
// accidental revoke must not force a new account, and the email is unique)
// and Remove (§6.12 "clean up through the UI"). Remove is allowed only for a
// revoked user with zero messages — messages are a record, so anyone who
// posted stays as a revoked row.
export async function restorePortalUser(db: ScopedDb, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CLIENT") throw new NotFoundError("Portal user");
  return db.user.update({ where: { id: userId }, data: { disabledAt: null } });
}

export async function removePortalUser(db: ScopedDb, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { messages: true } } },
  });
  if (!user || user.role !== "CLIENT") throw new NotFoundError("Portal user");
  if (!user.disabledAt) {
    throw new DomainRuleError("Revoke this person's access first, then remove them.");
  }
  if (user._count.messages > 0) {
    throw new DomainRuleError(
      "This person has posted messages, which are kept as a record — leave them revoked."
    );
  }
  return db.user.delete({ where: { id: userId } }); // tokens cascade
}

// ---------------------------------------------------------------------------
// No session: the sign-in request and the link itself
// ---------------------------------------------------------------------------

/**
 * Sends a sign-in link if — and only if — an active portal user has this
 * email. Resolves either way with no signal: the caller shows the same
 * sentence whether or not anything was sent.
 */
export async function requestLoginLink(deps: PortalMailDeps, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(normalized)) return;
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, tenantId: true, role: true, disabledAt: true },
  });
  if (!user || user.role !== "CLIENT" || user.disabledAt) return;
  const raw = await issueLoginToken(forTenant(user.tenantId), user.id);
  await deps.email.send(signInEmail(normalized, portalLinkUrl(deps.appBaseUrl, raw)));
}

async function findTokenRow(raw: string) {
  if (typeof raw !== "string" || raw.length < 32) return null;
  return prisma.loginToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { id: true, tenantId: true, userId: true },
  });
}

/** Checks a link without spending it — the landing page's question. */
export async function peekLoginToken(raw: string): Promise<boolean> {
  const row = await findTokenRow(raw);
  if (!row) return false;
  const db = forTenant(row.tenantId);
  const token = await db.loginToken.findFirst({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    select: { user: { select: { role: true, disabledAt: true, clientId: true } } },
  });
  return Boolean(
    token && token.user.role === "CLIENT" && !token.user.disabledAt && token.user.clientId
  );
}

/**
 * Spends a link: exactly one caller can win the conditional update, so a
 * second use — or a use after expiry — gets null. Returns the user for the
 * session, stamping lastSignInAt.
 */
export async function consumeLoginToken(raw: string): Promise<PortalUserSummary | null> {
  const row = await findTokenRow(raw);
  if (!row) return null;
  const db = forTenant(row.tenantId);
  const now = new Date();
  const claimed = await db.loginToken.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  const user = await db.user.findUnique({ where: { id: row.userId } });
  if (!user || user.role !== "CLIENT" || user.disabledAt || !user.clientId) return null;
  await db.user.update({ where: { id: user.id }, data: { lastSignInAt: now } });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    clientId: user.clientId,
    tenantId: user.tenantId,
  };
}

/**
 * The revocation check behind every CLIENT request (middleware and the
 * portal gate): null means "treat this session as gone".
 */
export async function activePortalUser(
  tenantId: string,
  userId: string
): Promise<PortalUserSummary | null> {
  const user = await forTenant(tenantId).user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, clientId: true, disabledAt: true },
  });
  if (!user || user.role !== "CLIENT" || user.disabledAt || !user.clientId) return null;
  return { id: user.id, email: user.email, name: user.name, clientId: user.clientId, tenantId };
}

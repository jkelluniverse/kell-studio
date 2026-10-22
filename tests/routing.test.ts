import { describe, expect, it } from "vitest";
import { decideRoute } from "../src/lib/routing";

// KS-06 §6.2 — the role wall, as the middleware decides it. Pure: no Next
// runtime, no database; the revocation check is injected.
const owner = { id: "u-owner", tenantId: "t1", role: "OWNER" };
const client = { id: "u-client", tenantId: "t1", role: "CLIENT" };
const active = async () => true;
const revoked = async () => false;

const INTERNAL_ROUTES = [
  "/home",
  "/clients",
  "/clients/abc",
  "/projects/abc",
  "/projects/abc/intake/def",
  "/review",
  "/captures/abc",
];

describe("role wall (decideRoute)", () => {
  it("a CLIENT session gets NOT FOUND on every internal route — never a redirect, never forbidden", async () => {
    for (const pathname of INTERNAL_ROUTES) {
      const decision = await decideRoute({ pathname, user: client, isActiveClient: active });
      expect(decision, pathname).toEqual({ kind: "notFound" });
    }
    // The owner-only preview is internal too, even though it lives under /portal.
    expect(
      await decideRoute({ pathname: "/portal/preview/abc", user: client, isActiveClient: active })
    ).toEqual({ kind: "notFound" });
  });

  it("a CLIENT session passes on portal routes and lands on /portal from the root", async () => {
    for (const pathname of ["/portal", "/portal/projects/abc"]) {
      expect(await decideRoute({ pathname, user: client, isActiveClient: active })).toEqual({
        kind: "next",
      });
    }
    expect(await decideRoute({ pathname: "/", user: client, isActiveClient: active })).toEqual({
      kind: "redirect",
      to: "/portal",
    });
  });

  it("OWNER is untouched: internal routes pass, /portal/* bounces to /home, the preview passes", async () => {
    for (const pathname of [...INTERNAL_ROUTES, "/", "/api/health", "/portal/preview/abc"]) {
      expect(
        await decideRoute({ pathname, user: owner, isActiveClient: revoked }),
        pathname
      ).toEqual({ kind: "next" });
    }
    for (const pathname of ["/portal", "/portal/projects/abc", "/portal/login"]) {
      expect(await decideRoute({ pathname, user: owner, isActiveClient: revoked })).toEqual({
        kind: "redirect",
        to: "/home",
      });
    }
  });

  it("a revoked user's session dies on its very next portal request", async () => {
    expect(
      await decideRoute({ pathname: "/portal", user: client, isActiveClient: revoked })
    ).toEqual({ kind: "redirect", to: "/portal/signout?ended=1" });
    // The revocation check is only ever asked about CLIENT sessions.
    let asked = 0;
    await decideRoute({
      pathname: "/home",
      user: owner,
      isActiveClient: async () => {
        asked++;
        return true;
      },
    });
    expect(asked).toBe(0);
  });

  it("no session: internal routes go to /login, portal routes to /portal/login, public routes pass", async () => {
    expect(await decideRoute({ pathname: "/home", user: null, isActiveClient: active })).toEqual({
      kind: "redirect",
      to: "/login",
    });
    expect(await decideRoute({ pathname: "/portal", user: null, isActiveClient: active })).toEqual({
      kind: "redirect",
      to: "/portal/login",
    });
    for (const pathname of [
      "/login",
      "/portal/login",
      "/portal/auth",
      "/portal/signout",
      "/api/health",
      "/api/auth/callback/credentials",
      "/i/sometoken",
      "/api/jobs/tick",
    ]) {
      expect(await decideRoute({ pathname, user: null, isActiveClient: active }), pathname).toEqual(
        { kind: "next" }
      );
    }
  });

  it("an unknown role is not found everywhere that isn't public — fail closed", async () => {
    const collaborator = { id: "u-c", tenantId: "t1", role: "COLLABORATOR" };
    for (const pathname of ["/home", "/portal", "/projects/abc"]) {
      expect(
        await decideRoute({ pathname, user: collaborator, isActiveClient: active })
      ).toEqual({ kind: "notFound" });
    }
  });
});

// The request-routing decision the middleware enforces (KS-06), as a pure
// function so the role wall is unit-testable without a Next runtime:
//
//   no session   → the right login page
//   OWNER        → the internal app; /portal/* bounces to /home, except the
//                  read-only preview
//   CLIENT       → /portal/* only; every internal route is NOT FOUND (never
//                  a forbidden page that confirms the route exists); and the
//                  session is re-checked against the database on each
//                  request so a revoked user is out immediately
//   anything else → not found (fail closed)

export type RouteDecision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "notFound" };

export interface SessionUserLike {
  id: string;
  tenantId: string;
  role: string;
}

const NEXT: RouteDecision = { kind: "next" };
const NOT_FOUND: RouteDecision = { kind: "notFound" };
const redirect = (to: string): RouteDecision => ({ kind: "redirect", to });

// Reachable without a session.
const PUBLIC_PATHS = [
  "/login",
  "/api/health",
  "/portal/login",
  "/portal/auth",
  "/portal/signout",
];

export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    // Public intake: the unguessable token is the credential (KS-04).
    pathname.startsWith("/i/") ||
    pathname.startsWith("/api/intake/") ||
    // Cron heartbeat; guarded by CRON_SECRET inside the route.
    pathname === "/api/jobs/tick" ||
    // Dev-only fake object store; the route 404s in production.
    pathname.startsWith("/api/dev-storage")
  );
}

export function isPortalPath(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

export function isPortalPreviewPath(pathname: string): boolean {
  return pathname.startsWith("/portal/preview/");
}

export async function decideRoute(input: {
  pathname: string;
  user: SessionUserLike | null;
  /** The revocation check; only consulted for CLIENT sessions. */
  isActiveClient: (tenantId: string, userId: string) => Promise<boolean>;
}): Promise<RouteDecision> {
  const { pathname, user } = input;
  const portal = isPortalPath(pathname);

  if (user?.role === "OWNER") {
    if (portal && !isPortalPreviewPath(pathname)) return redirect("/home");
    return NEXT;
  }

  if (isPublicPath(pathname)) return NEXT;

  if (!user) return redirect(portal ? "/portal/login" : "/login");

  if (user.role === "CLIENT") {
    if (pathname === "/") return redirect("/portal");
    if (!portal || isPortalPreviewPath(pathname)) return NOT_FOUND;
    if (!(await input.isActiveClient(user.tenantId, user.id))) {
      return redirect("/portal/signout?ended=1");
    }
    return NEXT;
  }

  return NOT_FOUND;
}

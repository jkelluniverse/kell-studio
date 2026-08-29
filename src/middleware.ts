// Everything is protected except /login, /api/health, and /api/auth/*.
// Uses the edge-safe half of the auth config (no Prisma in this bundle).
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    // Public intake: the unguessable token is the credential (KS-04).
    pathname.startsWith("/i/") ||
    pathname.startsWith("/api/intake/") ||
    // Cron heartbeat; guarded by CRON_SECRET inside the route.
    pathname === "/api/jobs/tick" ||
    // Dev-only fake object store; the route 404s when R2 is configured.
    pathname.startsWith("/api/dev-storage");
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Skip Next.js internals and static assets; everything else runs through
  // the auth check above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

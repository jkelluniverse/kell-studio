// Every request runs through decideRoute (src/lib/routing.ts) — see the
// table there. Uses the edge-safe half of the auth config to read the JWT.
//
// KS-06 DECISION: the middleware runs on the Node.js runtime (stable since
// Next 15.5) so a CLIENT session can be checked against the database on
// every request and a revoked user dies here, as §1 requires, instead of
// one layer in. The check is one primary-key read and only happens for
// CLIENT tokens; owner requests cost nothing extra. A stateless JWT cannot
// be revoked any other way.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { decideRoute } from "./lib/routing";
import { activePortalUser } from "./lib/db/portal-auth";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, origin } = req.nextUrl;
  const user = req.auth?.user;
  const decision = await decideRoute({
    pathname,
    user: user?.tenantId ? { id: user.id, tenantId: user.tenantId, role: user.role } : null,
    isActiveClient: async (tenantId, userId) =>
      (await activePortalUser(tenantId, userId)) !== null,
  });

  switch (decision.kind) {
    case "redirect":
      return NextResponse.redirect(new URL(decision.to, origin));
    case "notFound":
      // Rewrite to a route that doesn't exist: the app's own 404, status
      // 404, indistinguishable from any other unknown URL.
      return NextResponse.rewrite(new URL("/__not_found__", origin), { status: 404 });
    default:
      return NextResponse.next();
  }
});

export const config = {
  runtime: "nodejs",
  // Skip Next.js internals and static assets; everything else runs through
  // the decision above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

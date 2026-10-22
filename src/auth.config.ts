// KS-01 DECISION: Auth.js config is split in two files (the canonical
// next-auth v5 pattern). This half is edge-safe — no Prisma import — so
// middleware.ts can bundle it. src/auth.ts adds the Credentials providers,
// which reach the database through the tenant-scoped layer.
import type { NextAuthConfig } from "next-auth";

// KS-06 DECISION: §1 asks for 30-day CLIENT sessions with owner sessions
// "keeping their current length". The owner's current length IS Auth.js's
// 30-day default, so one explicit value serves both roles with no change
// to the owner's experience; stated here rather than inherited so it is a
// named number. Sessions roll on activity (updateAge default, one day).
export const SESSION_DAYS = 30;

export const authConfig = {
  // Behind Railway's proxy the Host header is the public domain; trust it so
  // Auth.js builds callback URLs correctly even if AUTH_URL is unset.
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_DAYS * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [], // filled in by src/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.clientId = user.clientId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
        session.user.clientId = (token.clientId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

// KS-01 DECISION: Auth.js config is split in two files (the canonical
// next-auth v5 pattern). This half is edge-safe — no Prisma import — so
// middleware.ts can bundle it. src/auth.ts adds the Credentials provider,
// which reaches the database through the tenant-scoped layer.
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Behind Railway's proxy the Host header is the public domain; trust it so
  // Auth.js builds callback URLs correctly even if AUTH_URL is unset.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // filled in by src/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

// KS-01 DECISION: module augmentation so the JWT session can carry tenantId
// and role under TypeScript strict — types only, no runtime code. Not in the
// spec's file list but required for it to typecheck. KS-06 adds clientId
// (set for CLIENT sessions, null for the owner).
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: string;
      clientId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    role: string;
    clientId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    role?: string;
    clientId?: string | null;
  }
}

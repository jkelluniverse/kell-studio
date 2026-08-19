// KS-01 DECISION: module augmentation so the JWT session can carry tenantId
// and role under TypeScript strict — types only, no runtime code. Not in the
// spec's file list but required for it to typecheck.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    role?: string;
  }
}

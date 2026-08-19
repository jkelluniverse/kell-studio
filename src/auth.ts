import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { forTenant, getRootTenant } from "@/lib/db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Even auth goes through the scoped layer — the owner lives on the
        // root tenant.
        const rootTenant = await getRootTenant();
        const user = await forTenant(rootTenant.id).user.findUnique({
          where: { email },
        });
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
});

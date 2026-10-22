import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { consumeLoginToken, forTenant, getRootTenant } from "@/lib/db";
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
        // No hash means no password sign-in — portal users never have one.
        if (!user || !user.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),
    // KS-06: the magic link. The raw token from the email is the whole
    // credential; consumeLoginToken spends it exactly once.
    Credentials({
      id: "portal-link",
      name: "Portal link",
      credentials: { token: {} },
      async authorize(credentials) {
        const token = credentials?.token;
        if (typeof token !== "string") return null;
        const user = await consumeLoginToken(token);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: "CLIENT",
          clientId: user.clientId,
        };
      },
    }),
  ],
});

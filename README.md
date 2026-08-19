# kell-studio

Internal operating system for Kell Systems Consulting LLC. KS-01 ships the
foundation: a deployed, empty, owner-only Next.js app with Postgres, Prisma,
brand tokens, and a tenant-scoped data layer.

Built to subtract.

## Stack

Next.js 15 (App Router, TypeScript strict) · Tailwind CSS · Prisma + Postgres ·
Auth.js v5 (Credentials, single owner, JWT) · Vitest · pnpm · Railway.

## The one rule that matters

App code never touches `PrismaClient`. The only database entry point is
`forTenant(tenantId)` from `@/lib/db` — it confines every query on a
tenant-scoped model to that tenant and stamps writes with it. An ESLint rule
errors on any import of `@/lib/db/prisma` outside `src/lib/db/`. When KS-02
adds models, append their names to `TENANT_SCOPED_MODELS` in
`src/lib/db/scoped.ts`; that is the only change needed.

## Run locally

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Start a Postgres you can reach (either a local install or a Railway shell:
   `railway connect postgres`). Create a database, e.g. `kell_studio`.

3. Copy the env file and fill it in:

   ```sh
   cp .env.example .env
   ```

   Every variable is documented inside `.env.example`. Generate `AUTH_SECRET`
   with `openssl rand -base64 32`.

4. Create the schema and the owner account:

   ```sh
   pnpm prisma migrate dev
   pnpm prisma db seed
   ```

   The seed is idempotent — it upserts the root tenant (`kell-systems`) and
   one OWNER user from `OWNER_EMAIL` / `OWNER_PASSWORD`. Run it again any time
   you change the owner password in `.env`.

5. Start the app:

   ```sh
   pnpm dev
   ```

   Open http://localhost:3000 — you'll be redirected to `/login`. Sign in with
   the owner credentials; you land on `/home`.

## Tests

```sh
pnpm vitest run
```

The suite pushes the Prisma schema to whatever `DATABASE_URL` points at, so
point it at a throwaway database (it deletes rows between runs). Typecheck and
lint:

```sh
pnpm typecheck
pnpm lint
```

## Add or change the owner

The owner is env-managed — there is no password reset in the UI. Set
`OWNER_EMAIL` / `OWNER_PASSWORD` (in `.env` locally, or in the Railway service
variables) and run `pnpm prisma db seed`. On Railway the seed runs on every
deploy, so changing the variables and redeploying rotates the credentials.

## Deploy (Railway)

1. Create a Railway project `kell-studio` from this repo and add the
   **Postgres plugin**.
2. Set the service variables: `DATABASE_URL` (reference the plugin's
   `DATABASE_URL`), `AUTH_SECRET`, `AUTH_URL` (the service's public URL),
   `OWNER_EMAIL`, `OWNER_PASSWORD`.
3. Build and start commands are checked in via `railway.json`:
   - Build: `pnpm install && pnpm prisma generate && pnpm build`
   - Start: `pnpm prisma migrate deploy && pnpm prisma db seed && pnpm start`
4. Deploy. Verify `GET /api/health` returns `{ "ok": true, "db": true }`,
   then sign in at `/login` with the owner credentials.

Build-time tooling (`prisma`, `tsx`, `typescript`, Tailwind, the `@types/*`
packages) lives in `dependencies`, not `devDependencies`, so the locked
Railway build command works even when the platform installs with
`NODE_ENV=production`.

## What's here (and what isn't)

Two models: `Tenant` and `User`. Two pages: `/login` and `/home` (a
placeholder KS-06 will fill). One API route besides auth: `/api/health`.
External-service adapters are a pattern note only — see
`src/adapters/README.md`. Clients, projects, captures, and everything else
arrive in KS-02+.

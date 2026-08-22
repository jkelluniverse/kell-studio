// Minimal flat config whose one load-bearing job is the tenant-layer
// boundary: nothing outside src/lib/db may import the raw Prisma client.
import tseslint from "typescript-eslint";

const RAW_CLIENT_MESSAGE =
  "The raw PrismaClient is only importable inside src/lib/db/. App code must use forTenant() from @/lib/db.";

export default [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {},
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    ignores: ["src/lib/db/**"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/lib/db/prisma", message: RAW_CLIENT_MESSAGE }],
          patterns: [
            {
              group: ["**/lib/db/prisma", "@/lib/db/prisma"],
              message: RAW_CLIENT_MESSAGE,
            },
          ],
        },
      ],
      // KS-02: gated models are created only through the domain helpers in
      // src/lib/db/domain.ts — createFact enforces citations, recordDecision
      // enforces the rationale, createReminder the exactly-one-target rule.
      // (createMany is blocked alongside create for all three; leaving it
      // open would be the same hole with an s.)
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(create|createMany)$/][callee.object.property.name='fact']",
          message:
            "Facts are created only via createFact() from @/lib/db — the citation gate is mandatory.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(create|createMany)$/][callee.object.property.name='decision']",
          message:
            "Decisions are recorded only via recordDecision() from @/lib/db — the rationale gate is mandatory.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(create|createMany)$/][callee.object.property.name='reminder']",
          message:
            "Reminders are created only via createReminder() from @/lib/db — it enforces the one-target rule.",
        },
      ],
    },
  },
];

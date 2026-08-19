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
    },
  },
];

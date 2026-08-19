// Idempotent seed: the root tenant and the single owner user. Safe to run
// twice — both writes are upserts.
//
// KS-01 DECISION: the seed imports the raw client directly. It is
// infrastructure code, not app code (it lives outside src/, runs before the
// app exists, and must create the Tenant row that forTenant scoping hangs
// off). The owner User is still created through forTenant to exercise the
// scoped layer end to end.
import { hashSync } from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";
import { forTenant } from "../src/lib/db/scoped";

async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error("Seed requires OWNER_EMAIL and OWNER_PASSWORD to be set.");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: "kell-systems" },
    update: { name: "Kell Systems Consulting", isRoot: true },
    create: { slug: "kell-systems", name: "Kell Systems Consulting", isRoot: true },
  });

  const passwordHash = hashSync(password, 12);
  await forTenant(tenant.id).user.upsert({
    where: { email },
    update: { passwordHash, role: "OWNER" },
    create: { email, passwordHash, role: "OWNER", tenantId: tenant.id },
  });

  console.log(`Seeded root tenant "${tenant.slug}" and owner ${email}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSlotConfig } from "./slot-config";

// Production-safe initialization. Unlike prisma/seed.ts (which creates demo
// users, demo patients, and a generated demo calendar for local dev), this
// creates exactly one real admin plus the operational config (release policies,
// schedule templates, settings). No patients and no calendar are generated.
// Idempotent: every step skips if the data already exists, so it is safe to
// re-run against an existing database.

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`✗ ${name} is required. Set it in the environment before running bootstrap.`);
    process.exit(1);
  }
  return v;
}

async function createAdmin() {
  const email = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const password = required("BOOTSTRAP_ADMIN_PASSWORD");
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin";

  if (!email.includes("@")) {
    console.error("✗ BOOTSTRAP_ADMIN_EMAIL is not a valid email address.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("✗ BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• admin ${email} already exists — skipping`);
    return;
  }
  await prisma.user.create({
    data: { email, name, role: "ADMIN", passwordHash: await hashPassword(password) },
  });
  console.log(`✓ created admin ${email}`);
}

async function seedReleasePoliciesAndTemplates() {
  if ((await prisma.scheduleTemplate.count()) > 0) {
    console.log("• schedule templates already exist — skipping operational config");
    return;
  }

  await createSlotConfig(prisma);
  console.log("✓ created release policies, schedule templates, and slot rules");
}

async function seedSettings() {
  const settings: Record<string, unknown> = {
    sessionTimeoutMinutes: 30,
    storeSensitivePatientData: false,
    generateMonthsAhead: 14,
    twoFactorRequired: false,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }
  console.log("✓ ensured default settings");
}

async function main() {
  console.log("→ production-safe bootstrap (no demo data)");
  await createAdmin();
  await seedReleasePoliciesAndTemplates();
  await seedSettings();
  console.log("✓ bootstrap complete — no patients or calendar were generated");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

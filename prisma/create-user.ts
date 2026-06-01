import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

// Staff onboarding CLI. The app has no in-app user management, so accounts are
// created here. The password is read from CREATE_USER_PASSWORD (not argv) to
// keep it out of shell history and the process list.
//
//   CREATE_USER_PASSWORD='…' npm run user:create -- <email> <ADMIN|DOCTOR|NURSE> [name]

const ROLES = ["ADMIN", "DOCTOR", "NURSE"] as const;
type Role = (typeof ROLES)[number];

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error("Usage: CREATE_USER_PASSWORD='…' npm run user:create -- <email> <ADMIN|DOCTOR|NURSE> [name]");
  process.exit(1);
}

async function main() {
  const [emailArg, roleArg, ...nameParts] = process.argv.slice(2);
  const password = process.env.CREATE_USER_PASSWORD?.trim();

  if (!emailArg || !roleArg) fail("email and role are required");
  const email = emailArg.toLowerCase();
  if (!email.includes("@")) fail("invalid email address");
  if (!ROLES.includes(roleArg as Role)) fail(`role must be one of: ${ROLES.join(", ")}`);
  if (!password || password.length < 12) fail("set CREATE_USER_PASSWORD to at least 12 characters");

  const role = roleArg as Role;
  const name = nameParts.join(" ").trim() || email.split("@")[0];

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) fail(`user ${email} already exists`);

  await prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
  console.log(`✓ created ${role} ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

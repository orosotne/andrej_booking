import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

// Reset an existing user's password. argon2 hashes are one-way, so a forgotten
// password cannot be recovered — only overwritten. Preserves the user id, role,
// 2FA, and all relations (unlike delete + recreate). The new password is read
// from RESET_USER_PASSWORD (not argv) to keep it out of shell history and the
// process list.
//
//   RESET_USER_PASSWORD='…' npm run user:reset -- <email>

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  console.error("Usage: RESET_USER_PASSWORD='…' npm run user:reset -- <email>");
  process.exit(1);
}

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const password = process.env.RESET_USER_PASSWORD?.trim();

  if (!email) fail("email is required");
  if (!email.includes("@")) fail("invalid email address");
  if (!password || password.length < 12) fail("set RESET_USER_PASSWORD to at least 12 characters");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) fail(`user ${email} does not exist`);

  await prisma.user.update({
    where: { email },
    data: { passwordHash: await hashPassword(password) },
  });
  console.log(`✓ password reset for ${user.role} ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

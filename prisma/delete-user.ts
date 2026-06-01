import "dotenv/config";
import { prisma } from "@/lib/db";

// Delete a user by email. Refuses to delete the last remaining admin so you
// can't lock yourself out.  Usage:  npm run user:delete -- <email>
async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error("Usage: npm run user:delete -- <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`✗ používateľ ${email} neexistuje`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      console.error(`✗ odmietam zmazať jediného admina (${email}) — uzamkol by si sa von. Najprv vytvor iného admina.`);
      process.exit(1);
    }
  }

  await prisma.user.delete({ where: { email } });
  console.log(`✓ zmazaný ${user.role} ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

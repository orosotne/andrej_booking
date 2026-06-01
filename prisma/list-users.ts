import "dotenv/config";
import { prisma } from "@/lib/db";

// Read-only inventory of the connected database: who can log in + whether any
// demo data is present. No mutations.
const DEMO_EMAILS = ["admin@ambulancia.sk", "lekar@ambulancia.sk", "sestra@ambulancia.sk"];

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { email: true, name: true, role: true, twoFactorEnabled: true, isActive: true, createdAt: true },
  });
  console.log(`\nPoužívatelia (${users.length}):`);
  for (const u of users) {
    const demo = DEMO_EMAILS.includes(u.email) ? "  ⚠️ DEMO" : "";
    const flags = `2FA:${u.twoFactorEnabled ? "on" : "off"} active:${u.isActive}`;
    console.log(`  ${u.role.padEnd(6)} ${u.email}  "${u.name}"  ${flags}  ${u.createdAt.toISOString().slice(0, 10)}${demo}`);
  }

  const patients = await prisma.patient.count();
  console.log(`\nPacienti v DB: ${patients}${patients > 0 ? "  ⚠️ (na čistej produkcii má byť 0)" : ""}`);
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

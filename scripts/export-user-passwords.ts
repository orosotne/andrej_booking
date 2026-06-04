import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { decryptReadablePassword } from "@/lib/auth/password-readable";

// On-demand export of current user passwords to a local, gitignored .env_users
// file (mode 600). For the owner/programmer who wants a readable list of staff
// logins. SENSITIVE — keep the file off git, backups and any cloud sync.
//
//   npm run user:passwords
//
// Only passwords set or changed AFTER the readable-copy feature can be shown;
// argon2 is one-way, so older ones are marked unknown (reset them to capture a
// readable copy). Requires PASSWORD_ENC_KEY in .env to decrypt.
const OUT_FILE = ".env_users";

async function main() {
  if (!process.env.PASSWORD_ENC_KEY) {
    console.error(
      "✗ PASSWORD_ENC_KEY nie je v .env — heslá sa nedajú dešifrovať.",
    );
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      email: true,
      name: true,
      role: true,
      passwordReadable: true,
      passwordChangedAt: true,
    },
  });

  const lines: string[] = [
    "# Aktuálne heslá používateľov — CITLIVÉ. Neverziovať, nezálohovať do cloudu.",
    `# Vygenerované: ${new Date().toISOString()}`,
    "# Heslá nastavené pred zavedením čitateľnej kópie sú neznáme (argon2 je",
    "# jednosmerný) — pre zachytenie ich raz resetni alebo nech si ich používateľ zmení.",
    "",
  ];

  let known = 0;
  for (const u of users) {
    const pw = decryptReadablePassword(u.passwordReadable);
    if (pw) known++;
    const when = u.passwordChangedAt
      ? u.passwordChangedAt.toISOString().slice(0, 10)
      : "?";
    const value = pw ?? "<neznáme — resetni alebo nech si zmení>";
    lines.push(`${u.email}=${value}   # ${u.role} ${u.name} (zmena: ${when})`);
  }

  writeFileSync(OUT_FILE, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(
    `✓ Zapísané do ${OUT_FILE} — ${known}/${users.length} hesiel čitateľných.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

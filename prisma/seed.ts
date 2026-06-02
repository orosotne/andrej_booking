import "dotenv/config";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_DAY_BLOCKS, type PolicyKey } from "@/lib/slot-engine/template";
import { generateForward, generateDay } from "@/lib/slot-engine/generate";
import { WEEKDAY, weekdaysInMonth } from "@/lib/calendar-date";

// Ensures the slot can only have ONE active appointment (DB-level double-booking guard).
// Prisma cannot express a partial unique index, so it is applied here.
async function ensureActiveAppointmentIndex() {
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS active_appointment_per_slot
       ON appointments (slot_id)
       WHERE status NOT IN ('CANCELLED', 'RESCHEDULED')`,
  );
}

async function seedUsers() {
  const users = [
    { email: "admin@ambulancia.sk", name: "Admin", role: "ADMIN" as const, password: "admin123" },
    { email: "lekar@ambulancia.sk", name: "MUDr. Lekár", role: "DOCTOR" as const, password: "lekar123" },
    { email: "sestra@ambulancia.sk", name: "Sestrička", role: "NURSE" as const, password: "sestra123" },
  ];
  for (const u of users) {
    const passwordHash = await hashPassword(u.password);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
  }
}

async function seedRulesAndTemplates() {
  if ((await prisma.scheduleTemplate.count()) > 0) return;

  // Per-slot-time release rules (v2 layout). V otvorených dňoch sú všetky sloty
  // voľné 14 mesiacov popredu (IMMEDIATE), okrem 7:00, 11:30 a 12:00:
  //   PRE_HOSPITAL_6D  → 7:00 opens 6 days before
  //   IMMEDIATE        → 9:00–11:30 dispenzár + všetky ECHO sloty (voľné hneď)
  //   DISPENSARY_20D   → 11:30 opens 20 days before
  //   DISPENSARY_13D   → 12:00 opens 13 days before
  //   BLOCKED          → manual only (Porada + ECHO oddelenie)
  const policies = {
    PRE_HOSPITAL_6D: await prisma.releasePolicy.create({
      data: { name: "Predhospitalizačné 7:00 (6 dní)", releaseType: "DAYS_BEFORE", daysBefore: 6 },
    }),
    IMMEDIATE: await prisma.releasePolicy.create({
      data: { name: "Voľné hneď (14 mesiacov popredu)", releaseType: "IMMEDIATE" },
    }),
    DISPENSARY_20D: await prisma.releasePolicy.create({
      data: { name: "Dispenzár 11:30 (20 dní)", releaseType: "DAYS_BEFORE", daysBefore: 20 },
    }),
    DISPENSARY_13D: await prisma.releasePolicy.create({
      data: { name: "Dispenzár 12:00 (13 dní)", releaseType: "DAYS_BEFORE", daysBefore: 13 },
    }),
    BLOCKED: await prisma.releasePolicy.create({
      data: { name: "Blokované (Porada / ECHO oddelenie)", releaseType: "MANUAL_ONLY" },
    }),
  } satisfies Record<PolicyKey, { id: string }>;

  // Wednesday (manual), Thursday, Friday all share the canonical day layout.
  const days = [
    { dayOfWeek: WEEKDAY.WED, name: "Streda (mimoriadna)" },
    { dayOfWeek: WEEKDAY.THU, name: "Štvrtok" },
    { dayOfWeek: WEEKDAY.FRI, name: "Piatok" },
  ];

  for (const day of days) {
    const template = await prisma.scheduleTemplate.create({
      data: {
        name: day.name,
        dayOfWeek: day.dayOfWeek,
        startTime: "07:00",
        endTime: "15:20",
        slotDurationMinutes: 30,
      },
    });
    await prisma.slotRule.createMany({
      data: DEFAULT_DAY_BLOCKS.map((block, i) => ({
        templateId: template.id,
        name: `${block.start}–${block.end} ${block.type}`,
        startTime: block.start,
        endTime: block.end,
        appointmentType: block.type,
        color: block.colorKey,
        isBookable: block.bookable,
        slotDurationMinutes: block.slotDurationMinutes ?? 30,
        releasePolicyId: policies[block.policyKey].id,
        priority: i,
      })),
    });
  }
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
}

async function seedPatients() {
  if ((await prisma.patient.count()) > 0) return;
  await prisma.patient.createMany({
    data: [
      { firstName: "Ján", lastName: "Novák", phone: "+421900111222", dateOfBirth: new Date("1958-03-12") },
      { firstName: "Mária", lastName: "Kováčová", phone: "+421900333444", dateOfBirth: new Date("1971-09-30") },
      { firstName: "Peter", lastName: "Horváth", phone: "+421900555666", dateOfBirth: new Date("1985-01-05") },
    ],
  });
}

async function main() {
  console.log("→ ensuring partial unique index");
  await ensureActiveAppointmentIndex();
  console.log("→ seeding users");
  await seedUsers();
  console.log("→ seeding release policies, templates, rules");
  await seedRulesAndTemplates();
  console.log("→ seeding settings");
  await seedSettings();
  console.log("→ seeding patients");
  await seedPatients();

  console.log("→ generating Thursdays/Fridays (3 months for demo)");
  const created = await generateForward({ months: 3 });
  console.log(`  generated ${created} working days`);

  // Demonstrate a manually-opened Wednesday (next upcoming Wednesday).
  const doctor = await prisma.user.findUnique({ where: { email: "lekar@ambulancia.sk" } });
  const upcomingWeds = weekdaysInMonth(new Date(), WEEKDAY.WED).filter(
    (d) => d.getTime() >= Date.now(),
  );
  if (upcomingWeds[0] && doctor) {
    await generateDay(upcomingWeds[0], {
      dayType: "MANUAL_WEDNESDAY",
      openedByUserId: doctor.id,
      note: "Demo: mimoriadne otvorená streda",
    });
    console.log(`  opened demo Wednesday ${upcomingWeds[0].toISOString().slice(0, 10)}`);
  }

  console.log("✓ seed complete");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

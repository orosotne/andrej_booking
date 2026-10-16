import "dotenv/config";
import { prisma } from "@/lib/db";
import { generateForward } from "@/lib/slot-engine/generate";
import { createSlotConfig } from "./slot-config";

// Re-applies the v2 slot layout + corrected release windows to an existing
// database. The normal seed/bootstrap skip when schedule templates already
// exist, so they cannot update a DB that was seeded with an older layout.
//
// This script WIPES and rebuilds the slot configuration and the generated
// calendar, then regenerates 14 months forward. It PRESERVES users, patients,
// and settings.
//
// DESTRUCTIVE — deletes every appointment, slot, calendar day, slot rule,
// schedule template, and release policy. Guarded behind CONFIRM_RESET=1 so it
// cannot run by accident.
//
//   CONFIRM_RESET=1 npx tsx prisma/reset-slot-config.ts
//
// Release windows (v2, corrected): in opened days all slots are free 14 months
// ahead EXCEPT 7:30 (6 days before), 11:30 (20 days before), 12:00 (13 days
// before) and ECHO 15:00 (20 days before). 7:00 is free immediately. Porada +
// ECHO oddelenie stay manually blocked.

async function main() {
  if (process.env.CONFIRM_RESET !== "1") {
    console.error(
      "✗ Refusing to run without CONFIRM_RESET=1.\n" +
        "  This deletes all appointments, slots, calendar days, and slot config.\n" +
        "  Re-run as: CONFIRM_RESET=1 npx tsx prisma/reset-slot-config.ts",
    );
    process.exit(1);
  }

  const before = {
    appointments: await prisma.appointment.count(),
    slots: await prisma.appointmentSlot.count(),
    days: await prisma.calendarDay.count(),
    rules: await prisma.slotRule.count(),
    templates: await prisma.scheduleTemplate.count(),
    policies: await prisma.releasePolicy.count(),
    patients: await prisma.patient.count(),
  };
  console.log("→ current state:", before);

  console.log("→ wiping calendar + slot configuration");
  await prisma.$transaction([
    prisma.appointment.deleteMany({}),
    prisma.appointmentSlot.deleteMany({}),
    prisma.calendarDay.deleteMany({}),
    prisma.slotRule.deleteMany({}),
    prisma.scheduleTemplate.deleteMany({}),
    prisma.releasePolicy.deleteMany({}),
  ]);

  console.log("→ recreating release policies, schedule templates + slot rules");
  await createSlotConfig(prisma);

  console.log("→ regenerating Thursdays/Fridays 14 months ahead");
  const created = await generateForward({ months: 14 });
  console.log(`  generated ${created} working days`);

  const after = {
    days: await prisma.calendarDay.count(),
    slots: await prisma.appointmentSlot.count(),
    available: await prisma.appointmentSlot.count({ where: { status: "AVAILABLE" } }),
    locked: await prisma.appointmentSlot.count({ where: { status: "LOCKED" } }),
    blocked: await prisma.appointmentSlot.count({ where: { status: "BLOCKED" } }),
  };
  console.log("✓ reset complete:", after);
  console.log(
    "  (Wednesdays + last Fridays are NOT auto-generated — they open manually with the password.)",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

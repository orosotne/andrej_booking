import type { Prisma } from "@/generated/prisma/client";
import { dateOnly } from "@/lib/calendar-date";
import {
  POLICY_DEFS,
  TEMPLATE_VERSIONS,
  type PolicyKey,
} from "@/lib/slot-engine/template";

// Shared by seed.ts, bootstrap.ts and reset-slot-config.ts: creates the release
// policies, every schedule template version (incl. the Thursday/Friday versions
// valid from 2028) and their slot rules from the canonical definitions in
// template.ts. Callers decide when to run it — seed/bootstrap skip a DB that
// already has templates, reset wipes the slot configuration first.

export async function createSlotConfig(db: Prisma.TransactionClient) {
  const policyIds = {} as Record<PolicyKey, string>;
  for (const key of Object.keys(POLICY_DEFS) as PolicyKey[]) {
    const def = POLICY_DEFS[key];
    const policy = await db.releasePolicy.create({
      data: {
        name: def.name,
        releaseType: def.releaseType,
        daysBefore: def.daysBefore ?? null,
        monthsBefore: def.monthsBefore ?? null,
      },
    });
    policyIds[key] = policy.id;
  }

  for (const version of TEMPLATE_VERSIONS) {
    const template = await db.scheduleTemplate.create({
      data: {
        name: version.name,
        dayOfWeek: version.dayOfWeek,
        startTime: version.blocks[0].start,
        endTime: version.blocks[version.blocks.length - 1].end,
        slotDurationMinutes: 30,
        validFrom: version.validFrom ? dateOnly(version.validFrom) : null,
        validTo: version.validTo ? dateOnly(version.validTo) : null,
      },
    });
    await db.slotRule.createMany({
      data: version.blocks.map((block, i) => ({
        templateId: template.id,
        name: `${block.start}–${block.end} ${block.type}`,
        startTime: block.start,
        endTime: block.end,
        appointmentType: block.type,
        color: block.colorKey,
        isBookable: block.bookable,
        slotDurationMinutes: block.slotDurationMinutes ?? 30,
        releasePolicyId: policyIds[block.policyKey],
        priority: i,
      })),
    });
  }
}

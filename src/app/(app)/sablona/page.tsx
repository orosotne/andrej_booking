import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/calendar-date";
import { todayIso } from "@/lib/format";
import { TemplateEditor } from "@/components/admin/TemplateEditor";

export default async function TemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const [templates, policies] = await Promise.all([
    // A version that ended before today can no longer generate or re-apply
    // anything, so it is left out.
    prisma.scheduleTemplate.findMany({
      where: { OR: [{ validTo: null }, { validTo: { gte: dateOnly(todayIso()) } }] },
      orderBy: [{ dayOfWeek: "asc" }, { validFrom: { sort: "asc", nulls: "first" } }],
      include: { slotRules: { orderBy: { priority: "asc" } } },
    }),
    prisma.releasePolicy.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <TemplateEditor
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        dayOfWeek: t.dayOfWeek,
        validFrom: t.validFrom ? toIsoDate(t.validFrom) : null,
        validTo: t.validTo ? toIsoDate(t.validTo) : null,
        rules: t.slotRules.map((r) => ({
          id: r.id,
          startTime: r.startTime,
          endTime: r.endTime,
          appointmentType: r.appointmentType,
          isBookable: r.isBookable,
          releasePolicyId: r.releasePolicyId,
        })),
      }))}
      policies={policies.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}

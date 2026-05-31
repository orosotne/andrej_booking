import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { TemplateEditor } from "@/components/admin/TemplateEditor";

export default async function TemplatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const [templates, policies] = await Promise.all([
    prisma.scheduleTemplate.findMany({
      orderBy: { dayOfWeek: "asc" },
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

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/admin/SettingsForm";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const [settingRows, policies] = await Promise.all([
    prisma.setting.findMany(),
    prisma.releasePolicy.findMany({ orderBy: { name: "asc" } }),
  ]);

  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

  return (
    <SettingsForm
      initialSettings={settings}
      initialPolicies={policies.map((p) => ({
        id: p.id,
        name: p.name,
        releaseType: p.releaseType,
        daysBefore: p.daysBefore,
        requiresAdminOverride: p.requiresAdminOverride,
      }))}
    />
  );
}

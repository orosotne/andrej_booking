import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { TwoFactorSetup } from "@/components/admin/TwoFactorSetup";
import { ROLE_LABEL } from "@/lib/auth/roles";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, role: true, twoFactorEnabled: true },
  });
  if (!dbUser) redirect("/login");

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-900">Môj profil</h1>
      <div className="mt-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <p className="font-medium text-slate-900">{dbUser.name}</p>
        <p className="text-sm text-slate-500">{dbUser.email}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
          {ROLE_LABEL[dbUser.role] ?? dbUser.role}
        </p>
      </div>
      <TwoFactorSetup initiallyEnabled={dbUser.twoFactorEnabled} />
    </div>
  );
}

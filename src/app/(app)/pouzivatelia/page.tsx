import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { USER_LIST_SELECT, toAdminUserDTO } from "@/lib/auth/user-admin";
import { UsersManager } from "@/components/admin/UsersManager";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const rows = await prisma.user.findMany({
    select: USER_LIST_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <UsersManager
      initialUsers={rows.map(toAdminUserDTO)}
      currentUserId={user.id}
    />
  );
}

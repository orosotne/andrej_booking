import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { VacationsManager } from "@/components/admin/VacationsManager";

export default async function VacationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  return <VacationsManager />;
}

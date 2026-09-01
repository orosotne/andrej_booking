import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { DashboardScreen } from "@/components/dashboard/DashboardScreen";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // No server-side fetch: the dashboard needs live refresh, so TanStack Query
  // owns the data (same as /statistika and /pacienti).
  return <DashboardScreen role={user.role} />;
}

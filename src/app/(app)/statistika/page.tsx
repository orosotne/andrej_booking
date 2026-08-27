import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { StatisticsScreen } from "@/components/stats/StatisticsScreen";

export default async function StatisticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  return <StatisticsScreen />;
}

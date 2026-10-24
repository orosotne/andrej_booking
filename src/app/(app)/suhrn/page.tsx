import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { MonthSummary } from "@/components/admin/MonthSummary";

export default async function MonthSummaryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  return <MonthSummary />;
}

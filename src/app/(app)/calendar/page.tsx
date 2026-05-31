import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { CalendarScreen } from "@/components/calendar/CalendarScreen";

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const canManageDays = user.role === "ADMIN" || user.role === "DOCTOR";
  return (
    <CalendarScreen isAdmin={user.role === "ADMIN"} canManageDays={canManageDays} />
  );
}

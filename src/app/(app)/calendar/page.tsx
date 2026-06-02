import { redirect } from "next/navigation";
import { getSessionUser, ALL_STAFF } from "@/lib/auth/rbac";
import { CalendarScreen } from "@/components/calendar/CalendarScreen";

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Opening/generating/deleting days stays with the doctor/admin; closing days
  // and ranges (vacations / non-working days) is open to all staff incl. nurses.
  const canManageDays = user.role === "ADMIN" || user.role === "DOCTOR";
  const canManageClosures = ALL_STAFF.includes(user.role);
  return (
    <CalendarScreen
      isAdmin={user.role === "ADMIN"}
      canManageDays={canManageDays}
      canManageClosures={canManageClosures}
    />
  );
}

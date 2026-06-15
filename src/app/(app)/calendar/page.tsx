import { redirect } from "next/navigation";
import { getSessionUser, ALL_STAFF } from "@/lib/auth/rbac";
import { CalendarScreen } from "@/components/calendar/CalendarScreen";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; slot?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Deep-link from elsewhere (e.g. a patient's appointment) opens straight on a
  // given day, optionally briefly highlighting one slot. Only accept a
  // well-formed YYYY-MM-DD; anything else is ignored.
  const { day, slot } = await searchParams;
  const initialDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  const initialSlotId =
    initialDay && typeof slot === "string" && slot.length > 0 ? slot : undefined;

  // Opening/generating/deleting days stays with the doctor/admin; closing days
  // and ranges (vacations / non-working days) is open to all staff incl. nurses.
  const canManageDays = user.role === "ADMIN" || user.role === "DOCTOR";
  const canManageClosures = ALL_STAFF.includes(user.role);
  return (
    <CalendarScreen
      isAdmin={user.role === "ADMIN"}
      canManageDays={canManageDays}
      canManageClosures={canManageClosures}
      initialDay={initialDay}
      initialSlotId={initialSlotId}
    />
  );
}

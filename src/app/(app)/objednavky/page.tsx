import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { BookedAppointmentsManager } from "@/components/admin/BookedAppointmentsManager";

export default async function BookedAppointmentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  return <BookedAppointmentsManager />;
}

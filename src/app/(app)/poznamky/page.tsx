import { redirect } from "next/navigation";
import { DOCTOR_ADMIN, getSessionUser } from "@/lib/auth/rbac";
import { NotesManager } from "@/components/notes/NotesManager";

export default async function NotesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // The doctor's tool: a nurse sees the subcategories only on the patient's note.
  if (!DOCTOR_ADMIN.includes(user.role)) redirect("/calendar");

  return <NotesManager />;
}

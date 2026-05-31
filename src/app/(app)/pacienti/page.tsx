import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { PatientsManager } from "@/components/patients/PatientsManager";

export default async function PatientsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <PatientsManager />;
}

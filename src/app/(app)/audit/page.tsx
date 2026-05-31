import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

const dtFmt = new Intl.DateTimeFormat("sk-SK", {
  timeZone: "Europe/Bratislava",
  dateStyle: "short",
  timeStyle: "short",
});

export default async function AuditPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/calendar");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Audit zmien</h1>
      <p className="mt-0.5 text-sm text-slate-500">Posledných {logs.length} záznamov</p>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Čas</th>
              <th className="px-3 py-2 font-medium">Kto</th>
              <th className="px-3 py-2 font-medium">Entita</th>
              <th className="px-3 py-2 font-medium">Akcia</th>
              <th className="px-3 py-2 font-medium">Dôvod</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.map((log) => (
              <tr key={log.id} className="text-slate-700">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">
                  {dtFmt.format(log.createdAt)}
                </td>
                <td className="px-3 py-2">{log.actor?.name ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{log.entityType}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">
                    {log.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-500">{log.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

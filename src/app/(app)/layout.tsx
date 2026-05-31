import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth/auth";
import { NavLink } from "@/components/layout/NavLink";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  DOCTOR: "Lekár",
  NURSE: "Sestra",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/calendar"
              aria-label="Ambulancia — domov"
              className="flex items-center gap-1.5 font-semibold tracking-tight text-slate-900"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">
                A
              </span>
              Ambulancia
            </Link>
            <nav className="flex items-center gap-4 text-sm" aria-label="Hlavná navigácia">
              <NavLink href="/calendar">Kalendár</NavLink>
              <NavLink href="/pacienti">Pacienti</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/profil"
              className="hidden text-slate-600 hover:text-slate-900 sm:inline"
            >
              {user.name}{" "}
              <span className="text-slate-400">
                · {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </Link>
            {user.role === "ADMIN" && (
              <>
                <NavLink href="/nastavenia">Nastavenia</NavLink>
                <NavLink href="/audit">Audit</NavLink>
              </>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                Odhlásiť
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}

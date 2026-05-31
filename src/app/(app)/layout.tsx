import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth/auth";

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
            <Link href="/calendar" className="font-semibold tracking-tight text-slate-900">
              Ambulancia
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/calendar" className="font-medium text-slate-500 hover:text-slate-900">
                Kalendár
              </Link>
              <Link href="/pacienti" className="font-medium text-slate-500 hover:text-slate-900">
                Pacienti
              </Link>
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
                <Link
                  href="/nastavenia"
                  className="font-medium text-slate-500 hover:text-slate-900"
                >
                  Nastavenia
                </Link>
                <Link
                  href="/audit"
                  className="font-medium text-slate-500 hover:text-slate-900"
                >
                  Audit
                </Link>
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

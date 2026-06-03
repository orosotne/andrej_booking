import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import logo from "@/assets/logo-02.png";
import { auth, signOut } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";
import { NavLink } from "@/components/layout/NavLink";
import { AdminMenu } from "@/components/layout/AdminMenu";
import { MobileNav } from "@/components/layout/MobileNav";
import { TwoFactorSetup } from "@/components/admin/TwoFactorSetup";
import { ROLE_LABEL } from "@/lib/auth/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  async function signOutToLogin() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  // When the clinic requires 2FA, an admin without it enrolled is blocked from
  // the app (but not from logging in — bootstrap's first admin has no 2FA yet)
  // until they set it up. Enrolling triggers router.refresh(), which re-runs
  // this layout and reveals the app.
  if (user.role === "ADMIN") {
    const [requirement, dbUser] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "twoFactorRequired" } }),
      prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } }),
    ]);
    if (requirement?.value === true && dbUser && !dbUser.twoFactorEnabled) {
      return (
        <div className="grid min-h-dvh place-items-center bg-slate-100 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h1 className="text-lg font-semibold text-slate-900">
              Vyžaduje sa dvojfaktorové overenie
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Pre administrátorské účty je zapnutá povinná 2FA. Nastavte si ju pre
              pokračovanie do systému.
            </p>
            <TwoFactorSetup initiallyEnabled={false} />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="mt-4"
            >
              <button className="text-sm text-slate-500 hover:text-slate-900">
                Odhlásiť
              </button>
            </form>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/calendar"
              className="flex select-none items-center"
              aria-label="Kardiologická ambulancia"
            >
              <Image
                src={logo}
                alt="Kardiologická ambulancia"
                width={134}
                height={32}
                priority
              />
            </Link>
            <span className="hidden h-5 w-px bg-slate-200 md:block" aria-hidden="true" />
            <nav
              className="hidden items-center gap-4 text-sm md:flex"
              aria-label="Hlavná navigácia"
            >
              <NavLink href="/calendar">Kalendár</NavLink>
              <NavLink href="/pacienti">Pacienti</NavLink>
              {user.role === "ADMIN" && (
                <>
                  <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
                  <AdminMenu />
                </>
              )}
            </nav>
          </div>
          {/* Desktop: profile + sign-out inline */}
          <div className="hidden items-center gap-3 text-sm md:flex">
            <Link
              href="/profil"
              className="text-slate-600 hover:text-slate-900"
            >
              {user.name}{" "}
              <span className="text-slate-400">
                · {ROLE_LABEL[user.role] ?? user.role}
              </span>
            </Link>
            <form action={signOutToLogin}>
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                Odhlásiť
              </button>
            </form>
          </div>
          {/* Mobile: everything collapses into a hamburger menu */}
          <div className="md:hidden">
            <MobileNav
              isAdmin={user.role === "ADMIN"}
              userName={user.name ?? ""}
              roleLabel={ROLE_LABEL[user.role] ?? user.role}
              signOutAction={signOutToLogin}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}

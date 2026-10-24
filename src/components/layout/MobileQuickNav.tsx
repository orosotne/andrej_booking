"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/prehlad", label: "Prehľad", Icon: LayoutDashboard },
  { href: "/calendar", label: "Kalendár", Icon: CalendarDays },
  { href: "/pacienti", label: "Pacienti", Icon: Users },
];

// Admin-only, like the page itself.
const STATS = { href: "/statistika", label: "Štatistika", Icon: BarChart3 };

const isOn = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileQuickNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...ITEMS, STATS] : ITEMS;

  return (
    <nav
      className={cn(
        "no-print grid gap-2 border-b border-slate-200 bg-white px-4 py-2.5 md:hidden",
        isAdmin ? "grid-cols-4" : "grid-cols-3",
      )}
      aria-label="Rýchly prístup"
    >
      {items.map(({ href, label, Icon }) => {
        const active = isOn(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition sm:text-sm",
              active
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

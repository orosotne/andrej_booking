"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/calendar", label: "Kalendár", Icon: CalendarDays },
  { href: "/pacienti", label: "Pacienti", Icon: Users },
];

const isOn = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileQuickNav() {
  const pathname = usePathname();

  return (
    <nav
      className="no-print grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-2.5 md:hidden"
      aria-label="Rýchly prístup"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isOn(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

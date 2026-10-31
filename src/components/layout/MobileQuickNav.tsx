"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, NotebookTabs, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/calendar", label: "Kalendár", Icon: CalendarDays },
  { href: "/pacienti", label: "Pacienti", Icon: Users },
];

// Doctor/admin only, like the page itself.
const NOTES = { href: "/poznamky", label: "Poznámky", Icon: NotebookTabs };

// Admin-only, like the page itself.
const STATS = { href: "/statistika", label: "Štatistika", Icon: BarChart3 };

// Literal class names so Tailwind keeps them; indexed by the item count.
const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

const isOn = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileQuickNav({
  isAdmin = false,
  canSeeNotes = false,
}: {
  isAdmin?: boolean;
  canSeeNotes?: boolean;
}) {
  const pathname = usePathname();
  const items = [
    ...ITEMS,
    ...(canSeeNotes ? [NOTES] : []),
    ...(isAdmin ? [STATS] : []),
  ];

  return (
    <nav
      className={cn(
        "no-print grid gap-2 border-b border-slate-200 bg-white px-4 py-2.5 md:hidden",
        GRID_COLS[items.length],
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

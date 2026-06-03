"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ADMIN_ITEMS } from "./nav-items";

const PRIMARY_ITEMS = [
  { href: "/calendar", label: "Kalendár" },
  { href: "/pacienti", label: "Pacienti" },
];

const isOn = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function MobileNav({
  isAdmin,
  userName,
  roleLabel,
  signOutAction,
}: {
  isAdmin: boolean;
  userName: string;
  roleLabel: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = isAdmin ? [...PRIMARY_ITEMS, ...ADMIN_ITEMS] : PRIMARY_ITEMS;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Hlavné menu"
        className="-mr-1.5 inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Hlavná navigácia"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              aria-current={isOn(pathname, it.href) ? "page" : undefined}
              className={cn(
                "block px-4 py-2.5 text-sm transition",
                isOn(pathname, it.href)
                  ? "bg-slate-50 font-semibold text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {it.label}
            </Link>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <Link
            href="/profil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <span className="block font-medium text-slate-700">{userName}</span>
            <span className="block text-xs text-slate-400">{roleLabel}</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Odhlásiť
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

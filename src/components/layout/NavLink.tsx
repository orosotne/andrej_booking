"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-1 font-medium transition",
        active ? "text-slate-900" : "text-slate-500 hover:text-slate-900",
      )}
    >
      {children}
      <span
        className={cn(
          "mx-auto mt-0.5 block h-0.5 rounded-full transition-all",
          active ? "w-full bg-slate-900" : "w-0 bg-transparent",
        )}
      />
    </Link>
  );
}

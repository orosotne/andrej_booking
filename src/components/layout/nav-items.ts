/** Navigation targets available to every signed-in role. */
export const PRIMARY_ITEMS = [
  { href: "/prehlad", label: "Prehľad" },
  { href: "/calendar", label: "Kalendár" },
  { href: "/pacienti", label: "Pacienti" },
];

/**
 * Statistics sit in the main navigation next to the primary items, but stay
 * admin-only (the page and /api/statistics are ADMIN_ONLY).
 */
export const STATS_ITEM = { href: "/statistika", label: "Štatistika" };

/** Admin-only navigation targets, shared by the desktop dropdown and the mobile menu. */
export const ADMIN_ITEMS = [
  { href: "/sablona", label: "Šablóna" },
  { href: "/objednavky", label: "Objednaní ľudia" },
  { href: "/suhrn", label: "Súhrn" },
  { href: "/dovolenky", label: "Dovolenky, zatvorené dni a sloty" },
  { href: "/nastavenia", label: "Nastavenia" },
  { href: "/pouzivatelia", label: "Používatelia" },
  { href: "/audit", label: "Audit" },
];

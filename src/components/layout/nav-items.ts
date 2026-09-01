/** Navigation targets available to every signed-in role. */
export const PRIMARY_ITEMS = [
  { href: "/prehlad", label: "Prehľad" },
  { href: "/calendar", label: "Kalendár" },
  { href: "/pacienti", label: "Pacienti" },
];

/** Admin-only navigation targets, shared by the desktop dropdown and the mobile menu. */
export const ADMIN_ITEMS = [
  { href: "/sablona", label: "Šablóna" },
  { href: "/objednavky", label: "Objednaní ľudia" },
  { href: "/statistika", label: "Štatistika" },
  { href: "/dovolenky", label: "Dovolenky, zatvorené dni a sloty" },
  { href: "/nastavenia", label: "Nastavenia" },
  { href: "/pouzivatelia", label: "Používatelia" },
  { href: "/audit", label: "Audit" },
];

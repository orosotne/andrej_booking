import type { StatCategory } from "@/lib/statistics";

// One colour per reported category, reusing the calendar's colour language
// where it already exists (ECHO blue, akútne pink, dispenzár emerald) and
// extending it with amber/violet for the two longer lead-time bands.
export const STAT_CATEGORY_BAR: Record<StatCategory, string> = {
  LEAD_0_100: "bg-emerald-500",
  LEAD_100_250: "bg-amber-400",
  LEAD_250_PLUS: "bg-violet-500",
  ECHO: "bg-blue-500",
  AKUTNE: "bg-pink-500",
};

export const STAT_CATEGORY_TEXT: Record<StatCategory, string> = {
  LEAD_0_100: "text-emerald-700",
  LEAD_100_250: "text-amber-700",
  LEAD_250_PLUS: "text-violet-700",
  ECHO: "text-blue-700",
  AKUTNE: "text-pink-700",
};

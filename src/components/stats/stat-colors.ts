import type { StatCategory } from "@/lib/statistics";

// One colour per reported category: akútne red and ECHO blue as in the
// calendar's booking mark; the dispenzár lead-time bands run yellow (do 100
// dní), green (100 – 250 dní) and violet (nad 250 dní).
export const STAT_CATEGORY_BAR: Record<StatCategory, string> = {
  LEAD_0_100: "bg-amber-400",
  LEAD_100_250: "bg-emerald-500",
  LEAD_250_PLUS: "bg-violet-500",
  ECHO: "bg-blue-500",
  AKUTNE: "bg-red-500",
};

export const STAT_CATEGORY_TEXT: Record<StatCategory, string> = {
  LEAD_0_100: "text-amber-700",
  LEAD_100_250: "text-emerald-700",
  LEAD_250_PLUS: "text-violet-700",
  ECHO: "text-blue-700",
  AKUTNE: "text-red-700",
};

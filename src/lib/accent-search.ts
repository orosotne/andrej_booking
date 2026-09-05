// Diacritics-insensitive substring matching for Postgres `~*` without the
// unaccent extension: every letter in the query becomes a character class of
// its accented variants, so "Danisova" and "Danišová" match each other.

const VARIANTS: Record<string, string> = {
  a: "aáäàâãå",
  c: "cčç",
  d: "dď",
  e: "eéěëèê",
  i: "iíï",
  l: "lĺľł",
  n: "nňñ",
  o: "oóöôõ",
  r: "rŕř",
  s: "sš",
  t: "tť",
  u: "uúůü",
  y: "yý",
  z: "zž",
};

const BASE_OF = new Map<string, string>();
for (const [base, chars] of Object.entries(VARIANTS)) {
  for (const ch of chars) BASE_OF.set(ch, base);
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\\/-]/g;

/** Case-insensitive regex source matching `query` regardless of diacritics. */
export function accentInsensitiveRegex(query: string): string {
  let out = "";
  for (const raw of query.toLowerCase()) {
    const base = BASE_OF.get(raw);
    out += base
      ? `[${VARIANTS[base]}]`
      : raw.replace(REGEX_SPECIAL, (m) => `\\${m}`);
  }
  return out;
}

import { randomInt } from "node:crypto";

// Short, diacritics-free words that are easy to read out over the phone — used
// to build memorable one-time passphrases for stand-in accounts.
const WORDS = [
  "mesiac", "ryba", "okno", "kniha", "voda", "strom", "ruka", "obraz",
  "kvet", "cesta", "mesto", "pole", "kruh", "zima", "leto", "noc",
  "list", "most", "hora", "rieka", "lampa", "stena", "dvere", "sneh",
  "vietor", "oblak", "hviezda", "slnko", "vlak", "auto", "pero", "papier",
  "farba", "sklo", "drevo", "zlato", "chlieb", "mlieko", "jablko", "sliva",
  "orech", "mak", "lipa", "breza", "dub", "buk", "javor", "smrek",
  "zajac", "sova",
];

/**
 * Builds a readable one-time passphrase like "mesiac-ryba-okno-47": three words
 * plus a two-digit number. Choice uses crypto.randomInt (CSPRNG), not
 * Math.random. The lockout policy rate-limits guesses on the resulting account.
 */
export function generatePassphrase(): string {
  const words = Array.from({ length: 3 }, () => WORDS[randomInt(WORDS.length)]);
  return `${words.join("-")}-${randomInt(10, 100)}`;
}

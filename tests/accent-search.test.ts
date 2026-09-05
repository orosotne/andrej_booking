import { describe, expect, it } from "vitest";
import { accentInsensitiveRegex } from "@/lib/accent-search";

describe("accentInsensitiveRegex", () => {
  it("matches accented and plain spellings both ways", () => {
    const plain = new RegExp(accentInsensitiveRegex("Danisova"), "i");
    const accented = new RegExp(accentInsensitiveRegex("Danišová"), "i");
    expect(plain.test("Danišová")).toBe(true);
    expect(accented.test("Danisova")).toBe(true);
    expect(accented.test("Danišová")).toBe(true);
    expect(plain.test("Novák")).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    expect(accentInsensitiveRegex("a.b")).toBe("[aáäàâãå]\\.b");
  });
});

import { describe, expect, it } from "vitest";
import { formatAmount, formatUnits } from "./format";
import { analyzePhrase, applySuggestions, parseWords, randomPhrase, suggestWord } from "./mnemonic";

const ABANDON_12 = `${"abandon ".repeat(11)}about`;
const ABANDON_24 = `${"abandon ".repeat(23)}art`;

describe("parseWords", () => {
  it("strips numbering, punctuation, case and line breaks", () => {
    expect(parseWords("1. Abandon\n2) ability,  3 - ABLE\t#4 about")).toEqual([
      "abandon",
      "ability",
      "able",
      "about",
    ]);
  });
});

describe("analyzePhrase", () => {
  it("accepts valid 12 and 24 word phrases", () => {
    expect(analyzePhrase(ABANDON_12)).toMatchObject({ status: "valid", bip39: true });
    expect(analyzePhrase(ABANDON_24)).toMatchObject({ status: "valid", bip39: true });
  });

  it("accepts numbered lists", () => {
    const numbered = ABANDON_12.split(" ")
      .map((w, i) => `${i + 1}. ${w}`)
      .join("\n");
    expect(analyzePhrase(numbered).status).toBe("valid");
  });

  it("reports empty input", () => {
    expect(analyzePhrase("  \n ").status).toBe("empty");
  });

  it("flags unknown words with suggestions", () => {
    const result = analyzePhrase(ABANDON_12.replace("about", "abuot"));
    expect(result.status).toBe("unknown-words");
    expect(result.unknown).toEqual([{ index: 11, word: "abuot", suggestion: "about" }]);
    expect(applySuggestions(result)).toBe(ABANDON_12);
  });

  it("does not flag a word that is still being typed", () => {
    expect(analyzePhrase("abandon aban").status).toBe("typing");
    expect(analyzePhrase("abandon aban ").status).toBe("unknown-words");
  });

  it("flags a wrong word count", () => {
    expect(analyzePhrase("abandon ".repeat(11)).status).toBe("wrong-length");
  });

  it("flags a checksum mismatch", () => {
    const result = analyzePhrase(`${"abandon ".repeat(11)}ability`);
    expect(result.electrum).toBeNull();
    expect(result.status).toBe("bad-checksum");
  });

  it("recognises Electrum seeds", () => {
    const result = analyzePhrase("bitter grass shiver impose acquire brush forget axis eager alone wine silver");
    expect(result).toMatchObject({ status: "valid", bip39: false, electrum: "segwit" });
  });
});

describe("randomPhrase", () => {
  it.each([12, 24] as const)("creates a valid %i-word phrase", (words) => {
    const phrase = randomPhrase(words);
    expect(phrase.split(" ")).toHaveLength(words);
    expect(analyzePhrase(phrase)).toMatchObject({ status: "valid", bip39: true });
  });

  it("does not repeat", () => {
    expect(new Set(Array.from({ length: 50 }, () => randomPhrase())).size).toBe(50);
  });
});

describe("suggestWord", () => {
  it.each([
    ["abandn", "abandon"],
    ["abuot", "about"],
    ["wolrd", "world"],
    ["bannana", "banana"],
    ["aban", "abandon"],
  ])("%s → %s", (input, expected) => {
    expect(suggestWord(input)).toBe(expected);
  });
});

describe("formatUnits", () => {
  it.each([
    [0n, 8, 8, "0"],
    [100000000n, 8, 8, "1"],
    [123456789n, 8, 8, "1.23456789"],
    [1234567890000000000000n, 18, 6, "1,234.56789"],
    [999999999n, 9, 6, "1"],
    [-150000000n, 8, 8, "-1.5"],
  ])("%s / 10^%i (max %i) → %s", (value, decimals, max, expected) => {
    expect(formatUnits(value, decimals, max)).toBe(expected);
  });

  it("keeps dust visible", () => {
    expect(formatAmount(1n, 18, 6)).toBe("<0.000001");
    expect(formatAmount(0n, 18, 6)).toBe("0");
  });
});

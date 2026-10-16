import { describe, expect, it } from "vitest";
import { BIP39_WORDS, groupByLetter, searchWords } from "./wordlist";

describe("BIP39 word list", () => {
  it("numbers all 2048 words from 1", () => {
    expect(BIP39_WORDS).toHaveLength(2048);
    expect(BIP39_WORDS[0]).toEqual({ word: "abandon", number: 1 });
    expect(BIP39_WORDS[2047]).toEqual({ word: "zoo", number: 2048 });
  });

  it("searches by prefix, ignoring case and spaces", () => {
    expect(searchWords("  ABOU ").map((w) => w.word)).toEqual(["about"]);
    expect(searchWords("zo").map((w) => w.word)).toEqual(["zone", "zoo"]);
    expect(searchWords("")).toHaveLength(2048);
    expect(searchWords("xyz")).toEqual([]);
  });

  it("looks up a word by its number", () => {
    expect(searchWords("1024")).toEqual([{ word: "lend", number: 1024 }]);
    expect(searchWords("0")).toEqual([]);
    expect(searchWords("2049")).toEqual([]);
  });

  it("groups by first letter", () => {
    const groups = groupByLetter(BIP39_WORDS);
    expect(groups.map(([letter]) => letter).join("")).toBe("abcdefghijklmnopqrstuvwyz");
    expect(groups.reduce((n, [, words]) => n + words.length, 0)).toBe(2048);
  });
});

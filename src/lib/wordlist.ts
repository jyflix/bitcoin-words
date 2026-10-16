import { wordlist } from "@scure/bip39/wordlists/english.js";

export interface IndexedWord {
  word: string;
  /** 1-based position in the BIP39 list (its line number). */
  number: number;
}

export const BIP39_WORDS: readonly IndexedWord[] = wordlist.map((word, i) => ({ word, number: i + 1 }));

/** Prefix search; a number from 1 to 2048 finds the word at that position. */
export function searchWords(query: string): IndexedWord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...BIP39_WORDS];
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    return n >= 1 && n <= BIP39_WORDS.length ? [BIP39_WORDS[n - 1]] : [];
  }
  return BIP39_WORDS.filter((w) => w.word.startsWith(q));
}

/** Groups words by first letter, keeping list order. */
export function groupByLetter(words: readonly IndexedWord[]): [string, IndexedWord[]][] {
  const groups = new Map<string, IndexedWord[]>();
  for (const entry of words) {
    const letter = entry.word[0];
    const group = groups.get(letter);
    if (group) group.push(entry);
    else groups.set(letter, [entry]);
  }
  return [...groups];
}

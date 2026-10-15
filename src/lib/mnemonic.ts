import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { electrumSeedType, type ElectrumSeedType } from "./electrum";

const WORDS = new Set(wordlist);

export const VALID_LENGTHS = [12, 15, 18, 21, 24] as const;

export type PhraseStatus =
  | "empty"
  | "typing"
  | "unknown-words"
  | "wrong-length"
  | "bad-checksum"
  | "unsupported"
  | "valid";

export interface UnknownWord {
  index: number;
  word: string;
  suggestion?: string;
}

export interface PhraseAnalysis {
  /** Normalized words: lowercase, no numbering or punctuation. */
  words: string[];
  /** Words joined by single spaces — the canonical mnemonic. */
  mnemonic: string;
  unknown: UnknownWord[];
  status: PhraseStatus;
  /** Valid BIP39 checksum. */
  bip39: boolean;
  /** Matches the Electrum seed format (may coexist with bip39). */
  electrum: ElectrumSeedType | null;
}

/**
 * Splits pasted text into words. Tolerates numbered lists ("1. abandon"),
 * commas, line breaks, mixed case and accents.
 */
export function parseWords(input: string): string[] {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Optimal-string-alignment distance: a swapped pair of letters is one edit. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Best-effort correction for a word that is not in the BIP39 list. */
export function suggestWord(word: string): string | undefined {
  // Abbreviations: BIP39 words are unique within their first four letters.
  if (word.length >= 3) {
    const extensions = wordlist.filter((w) => w.startsWith(word));
    if (extensions.length === 1) return extensions[0];
  }

  // Typos: fewest edits, then the longest shared prefix, then similar length.
  const maxDistance = word.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestScore = Infinity;
  for (const candidate of wordlist) {
    if (Math.abs(candidate.length - word.length) > maxDistance) continue;
    const distance = editDistance(word, candidate);
    if (distance > maxDistance) continue;
    const score =
      distance * 100 - sharedPrefix(word, candidate) * 10 + Math.abs(candidate.length - word.length);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (best) return best;

  // Garbled ending after an intact four-letter prefix.
  if (word.length >= 4) {
    const matches = wordlist.filter((w) => w.startsWith(word.slice(0, 4)));
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

export function analyzePhrase(input: string): PhraseAnalysis {
  const words = parseWords(input);
  const mnemonic = words.join(" ");
  const base = { words, mnemonic, unknown: [], bip39: false, electrum: null };
  if (words.length === 0) return { ...base, status: "empty" };

  // A last word that is still being typed is not an error yet.
  const last = words[words.length - 1];
  const stillTyping =
    /\p{L}$/u.test(input) && !WORDS.has(last) && wordlist.some((w) => w.startsWith(last));

  const unknown: UnknownWord[] = [];
  words.forEach((word, index) => {
    if (WORDS.has(word) || (stillTyping && index === words.length - 1)) return;
    unknown.push({ index, word, suggestion: unknown.length < 24 ? suggestWord(word) : undefined });
  });
  if (unknown.length > 0) return { ...base, unknown, status: "unknown-words" };
  if (stillTyping) return { ...base, status: "typing" };

  const lengthOk = (VALID_LENGTHS as readonly number[]).includes(words.length);
  const bip39 = lengthOk && validateMnemonic(mnemonic, wordlist);
  const electrum = words.length >= 12 ? electrumSeedType(mnemonic) : null;

  let status: PhraseStatus;
  if (bip39 || electrum === "standard" || electrum === "segwit") status = "valid";
  else if (electrum === "2fa") status = "unsupported";
  else if (!lengthOk) status = "wrong-length";
  else status = "bad-checksum";

  return { ...base, bip39, electrum, status };
}

/** Replaces unknown words with their suggestions, when every one has one. */
export function applySuggestions(analysis: PhraseAnalysis): string | null {
  if (analysis.unknown.some((u) => !u.suggestion)) return null;
  const fixed = [...analysis.words];
  for (const u of analysis.unknown) fixed[u.index] = u.suggestion!;
  return fixed.join(" ");
}

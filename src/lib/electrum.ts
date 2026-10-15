import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Electrum (2.0+) uses its own seed format: the words come from the BIP39
 * English list, but there is no BIP39 checksum. Instead the seed type is
 * encoded in the prefix of HMAC-SHA512("Seed version", phrase).
 */
export type ElectrumSeedType = "standard" | "segwit" | "2fa";

/** Electrum's normalize_text() for Latin scripts. */
export function normalizeElectrumText(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function electrumSeedType(phrase: string): ElectrumSeedType | null {
  const digest = bytesToHex(
    hmac(sha512, utf8ToBytes("Seed version"), utf8ToBytes(normalizeElectrumText(phrase))),
  );
  if (digest.startsWith("01")) return "standard";
  if (digest.startsWith("100")) return "segwit";
  if (digest.startsWith("101") || digest.startsWith("102")) return "2fa";
  return null;
}

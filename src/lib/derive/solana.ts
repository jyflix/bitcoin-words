import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58 } from "@scure/base";
import { HARDENED } from "./bitcoin";
import type { FixedGroup } from "./ethereum";

/** SLIP-0010 node for ed25519 (hardened derivation only). */
export interface Slip10Node {
  key: Uint8Array;
  chainCode: Uint8Array;
}

export function slip10Master(seed: Uint8Array): Slip10Node {
  const I = hmac(sha512, utf8ToBytes("ed25519 seed"), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

export function slip10Child(parent: Slip10Node, index: number): Slip10Node {
  const data = new Uint8Array(37);
  data.set(parent.key, 1);
  new DataView(data.buffer).setUint32(33, (index | HARDENED) >>> 0, false);
  const I = hmac(sha512, parent.chainCode, data);
  data.fill(0);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

export function slip10DerivePath(seed: Uint8Array, path: string): Slip10Node {
  const [root, ...segments] = path.split("/");
  if (root !== "m") throw new Error(`Invalid path: ${path}`);
  let node = slip10Master(seed);
  for (const segment of segments) {
    const match = /^(\d+)'$/.exec(segment);
    if (!match) throw new Error("ed25519 only supports hardened derivation");
    node = slip10Child(node, Number(match[1]));
  }
  return node;
}

export function solAddressFromSecret(secret: Uint8Array): string {
  return base58.encode(ed25519.getPublicKey(secret));
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function deriveSolGroups(seed: Uint8Array, count: number): FixedGroup[] {
  const coin = slip10DerivePath(seed, "m/44'/501'");

  const standard = range(count).map((i) => {
    const account = slip10Child(coin, i);
    const leaf = slip10Child(account, 0);
    const address = solAddressFromSecret(leaf.key);
    account.key.fill(0);
    leaf.key.fill(0);
    return { address, path: `m/44'/501'/${i}'/0'`, index: i };
  });

  const ledger = range(count).map((i) => {
    const account = slip10Child(coin, i);
    const address = solAddressFromSecret(account.key);
    account.key.fill(0);
    return { address, path: `m/44'/501'/${i}'`, index: i };
  });

  coin.key.fill(0);

  // solana-keygen without --derivation-path uses the first 32 seed bytes.
  const cli = [{ address: solAddressFromSecret(seed.slice(0, 32)), path: "seed bytes 0–31", index: 0 }];

  return [
    {
      group: {
        id: "sol-standard",
        chain: "sol",
        title: "Standard",
        badge: "BIP44",
        path: "m/44'/501'/i'/0'",
        wallets: "Phantom, Solflare, Backpack, Glow",
      },
      addresses: standard,
    },
    {
      group: {
        id: "sol-ledger",
        chain: "sol",
        title: "Ledger / Trust Wallet",
        badge: "BIP44",
        path: "m/44'/501'/i'",
        wallets: "Ledger Live, Trust Wallet, Solflare (legacy path)",
      },
      addresses: ledger,
    },
    {
      group: {
        id: "sol-cli",
        chain: "sol",
        title: "Solana CLI",
        badge: "CLI",
        path: "no derivation path",
        wallets: "solana-keygen default (no --derivation-path)",
      },
      addresses: cli,
    },
  ];
}

// ── Program-derived addresses (used to locate SPL token accounts) ──────────

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const PDA_MARKER = utf8ToBytes("ProgramDerivedAddress");

export function isOnCurve(bytes: Uint8Array): boolean {
  try {
    // zip215 mirrors curve25519-dalek's lenient decompression used by Solana.
    ed25519.Point.fromBytes(bytes, true);
    return true;
  } catch {
    return false;
  }
}

export function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concatBytes(...seeds, Uint8Array.of(bump), programId, PDA_MARKER));
    if (!isOnCurve(hash)) return hash;
  }
  throw new Error("Unable to find a viable program address");
}

export function associatedTokenAddress(owner: string, mint: string): string {
  return base58.encode(
    findProgramAddress(
      [base58.decode(owner), base58.decode(TOKEN_PROGRAM_ID), base58.decode(mint)],
      base58.decode(ASSOCIATED_TOKEN_PROGRAM_ID),
    ),
  );
}

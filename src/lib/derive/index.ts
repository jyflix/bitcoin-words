import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed, mnemonicToSeedWebcrypto } from "@scure/bip39";
import { normalizeElectrumText } from "@/lib/electrum";
import type { ChainId } from "@/lib/types";
import { BIP_SCHEMES, BtcAccount, deriveBipAccounts, electrumAccount } from "./bitcoin";
import { deriveEthGroups, type FixedGroup } from "./ethereum";
import { deriveSolGroups } from "./solana";

export type { BtcAccount, FixedGroup };

/** Upper bound for Bitcoin account discovery (accounts are scanned in order). */
export const MAX_BTC_ACCOUNTS = 10;

export interface DeriveInput {
  mnemonic: string;
  passphrase: string;
  bip39: boolean;
  electrum: "standard" | "segwit" | null;
  /** Addresses (or accounts) per Ethereum / Solana path. */
  count: number;
  chains: Record<ChainId, boolean>;
}

/** Public material only: no seed or private key survives this step. */
export interface DerivedMaterial {
  /** Candidate accounts per Bitcoin scheme, in discovery order. */
  btc: BtcAccount[][];
  eth: FixedGroup[];
  sol: FixedGroup[];
}

const hasSubtle = () => typeof globalThis.crypto?.subtle?.importKey === "function";

async function bip39Seed(mnemonic: string, passphrase: string): Promise<Uint8Array> {
  if (hasSubtle()) {
    try {
      return await mnemonicToSeedWebcrypto(mnemonic, passphrase);
    } catch {
      // Fall back to the pure-JS implementation below.
    }
  }
  return mnemonicToSeed(mnemonic, passphrase);
}

async function electrumSeed(mnemonic: string, passphrase: string): Promise<Uint8Array> {
  const password = utf8ToBytes(normalizeElectrumText(mnemonic));
  const salt = utf8ToBytes(`electrum${normalizeElectrumText(passphrase)}`);
  if (hasSubtle()) {
    try {
      const key = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-512", salt, iterations: 2048 },
        key,
        512,
      );
      return new Uint8Array(bits);
    } catch {
      // Fall back to the pure-JS implementation below.
    }
  }
  return pbkdf2Async(sha512, password, salt, { c: 2048, dkLen: 64 });
}

export async function deriveMaterial(input: DeriveInput): Promise<DerivedMaterial> {
  const material: DerivedMaterial = { btc: [], eth: [], sol: [] };

  if (input.bip39) {
    const seed = await bip39Seed(input.mnemonic, input.passphrase);
    const root = HDKey.fromMasterSeed(seed);
    try {
      if (input.chains.btc) {
        for (const scheme of BIP_SCHEMES) {
          material.btc.push(deriveBipAccounts(root, scheme, MAX_BTC_ACCOUNTS));
        }
      }
      if (input.chains.eth) material.eth = deriveEthGroups(root, input.count);
      if (input.chains.sol) material.sol = deriveSolGroups(seed, input.count);
    } finally {
      root.wipePrivateData();
      seed.fill(0);
    }
  }

  if (input.chains.btc && (input.electrum === "standard" || input.electrum === "segwit")) {
    const seed = await electrumSeed(input.mnemonic, input.passphrase);
    const root = HDKey.fromMasterSeed(seed);
    try {
      material.btc.push([electrumAccount(root, input.electrum)]);
    } finally {
      root.wipePrivateData();
      seed.fill(0);
    }
  }

  return material;
}

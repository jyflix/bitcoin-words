import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { HDKey } from "@scure/bip32";
import type { DerivedAddress, GroupInfo } from "@/lib/types";
import { HARDENED } from "./bitcoin";

export interface FixedGroup {
  group: GroupInfo;
  addresses: DerivedAddress[];
}

/** EIP-55 mixed-case checksum encoding. */
export function toChecksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function ethAddressFromPublicKey(publicKey: Uint8Array): string {
  const uncompressed =
    publicKey.length === 65 ? publicKey : secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return toChecksumAddress(bytesToHex(keccak_256(uncompressed.subarray(1)).subarray(-20)));
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function deriveEthGroups(root: HDKey, count: number): FixedGroup[] {
  const coin = root.derive("m/44'/60'");
  const account0 = coin.deriveChild(HARDENED);
  const external = account0.deriveChild(0);

  const standard = range(count).map((i) => ({
    address: ethAddressFromPublicKey(external.deriveChild(i).publicKey!),
    path: `m/44'/60'/0'/0/${i}`,
    index: i,
  }));

  // Ledger Live creates one hardened account per address; its account #1 is
  // identical to Standard #0, so start at 1.
  const ledgerLive = range(count).map((k) => {
    const i = k + 1;
    const node = coin.deriveChild(HARDENED + i);
    const address = ethAddressFromPublicKey(node.deriveChild(0).deriveChild(0).publicKey!);
    node.wipePrivateData();
    return { address, path: `m/44'/60'/${i}'/0/0`, index: i };
  });

  const legacy = range(count).map((i) => ({
    address: ethAddressFromPublicKey(account0.deriveChild(i).publicKey!),
    path: `m/44'/60'/0'/${i}`,
    index: i,
  }));

  for (const node of [coin, account0, external]) node.wipePrivateData();

  return [
    {
      group: {
        id: "eth-standard",
        chain: "eth",
        title: "Standard",
        badge: "BIP44",
        path: "m/44'/60'/0'/0/i",
        wallets: "MetaMask, Trust Wallet, Rabby, Coinbase Wallet, Exodus, Trezor, Ledger Live #1",
      },
      addresses: standard,
    },
    {
      group: {
        id: "eth-ledger-live",
        chain: "eth",
        title: "Ledger Live",
        badge: "Ledger",
        path: "m/44'/60'/i'/0/0",
        wallets: "Ledger Live accounts #2 and up",
      },
      addresses: ledgerLive,
    },
    {
      group: {
        id: "eth-ledger-legacy",
        chain: "eth",
        title: "Ledger Legacy",
        badge: "MEW",
        path: "m/44'/60'/0'/i",
        wallets: "Ledger via MyEtherWallet / MyCrypto (legacy path)",
      },
      addresses: legacy,
    },
  ];
}

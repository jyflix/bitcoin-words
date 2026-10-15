import { HDKey } from "@scure/bip32";
import { NETWORK, p2pkh, p2sh, p2tr, p2wpkh } from "@scure/btc-signer";
import type { DerivedAddress, GroupInfo } from "@/lib/types";

export const HARDENED = 0x80000000;

export type BtcAddressKind = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh" | "p2tr";

export interface BtcScheme {
  id: string;
  purpose: number;
  kind: BtcAddressKind;
  title: string;
  badge: string;
  wallets: string;
}

/** BIP39-based schemes, in the order they are shown and scanned. */
export const BIP_SCHEMES: readonly BtcScheme[] = [
  {
    id: "bip84",
    purpose: 84,
    kind: "p2wpkh",
    title: "Native SegWit",
    badge: "BIP84",
    wallets: "Ledger, Trezor, Sparrow, BlueWallet, Trust Wallet, Exodus",
  },
  {
    id: "bip86",
    purpose: 86,
    kind: "p2tr",
    title: "Taproot",
    badge: "BIP86",
    wallets: "Ledger, Trezor, Sparrow, Xverse, UniSat",
  },
  {
    id: "bip49",
    purpose: 49,
    kind: "p2sh-p2wpkh",
    title: "Nested SegWit",
    badge: "BIP49",
    wallets: "Older Ledger & Trezor accounts, Samourai",
  },
  {
    id: "bip44",
    purpose: 44,
    kind: "p2pkh",
    title: "Legacy",
    badge: "BIP44",
    wallets: "Original HD wallets — Mycelium, Coinomi, early Ledger & Trezor",
  },
];

export function encodeBtcAddress(kind: BtcAddressKind, publicKey: Uint8Array): string {
  let address: string | undefined;
  switch (kind) {
    case "p2pkh":
      address = p2pkh(publicKey, NETWORK).address;
      break;
    case "p2sh-p2wpkh":
      address = p2sh(p2wpkh(publicKey, NETWORK), NETWORK).address;
      break;
    case "p2wpkh":
      address = p2wpkh(publicKey, NETWORK).address;
      break;
    case "p2tr":
      // BIP86: key-path-only output from the x-only internal key.
      address = p2tr(publicKey.subarray(1), undefined, NETWORK).address;
      break;
  }
  if (!address) throw new Error(`Could not encode ${kind} address`);
  return address;
}

/**
 * A Bitcoin account held as a public-only (xpub) node, so receive and change
 * addresses can be derived on demand without keeping any private key around.
 */
export class BtcAccount {
  private readonly xpub: HDKey;
  private readonly chains: (HDKey | undefined)[] = [];

  constructor(
    readonly group: GroupInfo,
    readonly kind: BtcAddressKind,
    readonly basePath: string,
    accountNode: HDKey,
  ) {
    this.xpub = HDKey.fromExtendedKey(accountNode.publicExtendedKey);
  }

  address(change: 0 | 1, index: number): DerivedAddress {
    const chain = (this.chains[change] ??= this.xpub.deriveChild(change));
    const node = chain.deriveChild(index);
    return {
      address: encodeBtcAddress(this.kind, node.publicKey!),
      path: `${this.basePath}/${change}/${index}`,
      index,
      change: change === 1,
    };
  }
}

/** Accounts 0..count-1 of a BIP44-style scheme (m/purpose'/0'/account'). */
export function deriveBipAccounts(root: HDKey, scheme: BtcScheme, count: number): BtcAccount[] {
  const coin = root.derive(`m/${scheme.purpose}'/0'`);
  const accounts: BtcAccount[] = [];
  for (let account = 0; account < count; account++) {
    const node = coin.deriveChild(HARDENED + account);
    const basePath = `m/${scheme.purpose}'/0'/${account}'`;
    accounts.push(
      new BtcAccount(
        {
          id: `btc-${scheme.id}-${account}`,
          chain: "btc",
          title: account === 0 ? scheme.title : `${scheme.title} · Account ${account + 1}`,
          badge: scheme.badge,
          path: `${basePath}/{0,1}/i`,
          wallets: scheme.wallets,
        },
        scheme.kind,
        basePath,
        node,
      ),
    );
    node.wipePrivateData();
  }
  coin.wipePrivateData();
  return accounts;
}

/** Electrum's native seed: standard → m/{0,1}/i (P2PKH), segwit → m/0'/{0,1}/i (P2WPKH). */
export function electrumAccount(root: HDKey, type: "standard" | "segwit"): BtcAccount {
  const segwit = type === "segwit";
  const basePath = segwit ? "m/0'" : "m";
  const node = root.derive(basePath);
  const account = new BtcAccount(
    {
      id: `btc-electrum-${type}`,
      chain: "btc",
      title: segwit ? "Electrum SegWit" : "Electrum Standard",
      badge: "Electrum",
      path: `${basePath}/{0,1}/i`,
      wallets: `Electrum ${segwit ? "SegWit" : "standard"} seed (not BIP39)`,
    },
    segwit ? "p2wpkh" : "p2pkh",
    basePath,
    node,
  );
  if (node !== root) node.wipePrivateData();
  return account;
}

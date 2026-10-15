import { toNumber } from "./format";
import type { AddressEntry, AddressGroup, ChainId, Prices, TokenBalance } from "./types";
import { CHAINS } from "./types";

export interface Totals {
  /** Native balance in base units. */
  native: bigint;
  /** Non-zero token balances, summed per symbol. */
  tokens: TokenBalance[];
  /** USD value, or null when a price is needed but unavailable. */
  usd: number | null;
  /** Addresses holding funds. */
  funded: number;
  /** Addresses with any on-chain history. */
  used: number;
  /** Addresses whose balance was loaded. */
  checked: number;
}

export const hasFunds = (entry: AddressEntry) =>
  (entry.balance ?? 0n) > 0n || (entry.tokens ?? []).some((t) => t.amount > 0n);

/** Has history or funds — worth showing in compact views. */
export const isActive = (entry: AddressEntry) => entry.used === true || hasFunds(entry);

/** Worth showing when "hide empty" is on. */
export const isNotable = (entry: AddressEntry) => entry.status === "error" || isActive(entry);

/** Sums unique addresses; stablecoins count as $1. */
export function sumEntries(entries: AddressEntry[], chain: ChainId, prices: Prices | null): Totals {
  const seen = new Set<string>();
  const tokens = new Map<string, TokenBalance>();
  let native = 0n;
  let funded = 0;
  let used = 0;

  for (const entry of entries) {
    if (entry.status !== "done" || seen.has(entry.address)) continue;
    seen.add(entry.address);
    native += entry.balance ?? 0n;
    if (hasFunds(entry)) funded++;
    if (entry.used) used++;
    for (const token of entry.tokens ?? []) {
      if (token.amount <= 0n) continue;
      const sum = tokens.get(token.symbol);
      tokens.set(token.symbol, { ...token, amount: (sum?.amount ?? 0n) + token.amount });
    }
  }

  const stableUsd = [...tokens.values()].reduce((acc, t) => acc + toNumber(t.amount, t.decimals), 0);
  let usd: number | null = stableUsd;
  if (native !== 0n) {
    usd = prices ? stableUsd + toNumber(native, CHAINS[chain].decimals) * prices.usd[chain] : null;
  }
  return { native, tokens: [...tokens.values()], usd, funded, used, checked: seen.size };
}

export function chainTotals(groups: AddressGroup[], chain: ChainId, prices: Prices | null): Totals {
  return sumEntries(
    groups.filter((g) => g.chain === chain && !g.hidden).flatMap((g) => g.addresses),
    chain,
    prices,
  );
}

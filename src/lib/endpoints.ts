/**
 * Public, CORS-enabled endpoints used to read balances. Only derived *public*
 * addresses are ever sent to them — never the recovery phrase or any key.
 *
 * Each list is tried in order; on rate limits or outages the next one is used.
 * Override with comma-separated lists (e.g. your own Alchemy / Helius URLs):
 *   NEXT_PUBLIC_BTC_API, NEXT_PUBLIC_ETH_RPC, NEXT_PUBLIC_SOL_RPC
 *
 * This module is also imported by next.config.ts to build the CSP
 * `connect-src` allow-list, so the page cannot talk to any other host.
 */

function pick(value: string | undefined, defaults: string[]): string[] {
  const custom = (value ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return custom.length > 0 ? custom : defaults;
}

export const ENDPOINTS = {
  /** Esplora-compatible REST APIs. */
  btc: pick(process.env.NEXT_PUBLIC_BTC_API, [
    "https://mempool.space/api",
    "https://blockstream.info/api",
  ]),
  /** Ethereum mainnet JSON-RPC. */
  eth: pick(process.env.NEXT_PUBLIC_ETH_RPC, [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://1rpc.io/eth",
  ]),
  /** Solana mainnet JSON-RPC. */
  sol: pick(process.env.NEXT_PUBLIC_SOL_RPC, [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
  ]),
};

export const PRICE_ENDPOINTS = {
  coingecko:
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
  coinbase: "https://api.coinbase.com/v2/exchange-rates?currency=USD",
};

export const EXPLORERS = {
  btc: (address: string) => `https://mempool.space/address/${address}`,
  eth: (address: string) => `https://etherscan.io/address/${address}`,
  sol: (address: string) => `https://solscan.io/account/${address}`,
};

/** Every origin the browser is allowed to `fetch` (used for the CSP). */
export function connectOrigins(): string[] {
  const urls = [
    ...ENDPOINTS.btc,
    ...ENDPOINTS.eth,
    ...ENDPOINTS.sol,
    ...Object.values(PRICE_ENDPOINTS),
  ];
  const origins = new Set<string>();
  for (const url of urls) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // Ignore malformed overrides; they will fail loudly at request time.
    }
  }
  return [...origins];
}

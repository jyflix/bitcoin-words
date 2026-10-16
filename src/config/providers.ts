/**
 * Balance providers — the one place to add or change RPC / API providers.
 *
 * Private providers (Alchemy, Infura, Helius, QuickNode, your own node…) are
 * switched on with environment variables; see `.env.example`. Their keys are
 * read on the server only: for a chain with a private provider, the browser
 * calls this app's own `/api` route, which adds the key and forwards the
 * request. Keys never reach the browser.
 *
 * Chains without a private provider are queried straight from the browser
 * through the free public endpoints below.
 *
 * This module has no imports so `next.config.ts` can use it for the CSP.
 */

export type Chain = "btc" | "eth" | "sol";

const CHAINS: readonly Chain[] = ["btc", "eth", "sol"];

/** Environment variables (server-side — never prefix them with NEXT_PUBLIC_). */
export const ENV = {
  /** Alchemy API key: Ethereum + Solana. */
  alchemyApiKey: "ALCHEMY_API_KEY",
  /** Infura API key: Ethereum. */
  infuraApiKey: "INFURA_API_KEY",
  /** Helius API key: Solana. */
  heliusApiKey: "HELIUS_API_KEY",
  /** Extra Ethereum JSON-RPC URLs, comma-separated (QuickNode, Chainstack, Ankr, own node…). */
  ethRpcUrls: "ETH_RPC_URLS",
  /** Extra Solana JSON-RPC URLs, comma-separated (QuickNode, Triton, own node…). */
  solRpcUrls: "SOL_RPC_URLS",
  /** Esplora REST API base URLs, comma-separated (self-hosted mempool / Esplora…). */
  btcEsploraUrls: "BTC_ESPLORA_URLS",
  /** Blockbook API base URLs ending in /api/v2, comma-separated (NOWNodes, GetBlock, own Blockbook…). */
  btcBlockbookUrls: "BTC_BLOCKBOOK_URLS",
  /** Optional Blockbook API key, sent as the `api-key` header. */
  btcBlockbookApiKey: "BTC_BLOCKBOOK_API_KEY",
  /** "false" stops the server from falling back to public endpoints when private ones fail. */
  publicFallback: "PUBLIC_FALLBACK",
  /** Requests per minute per IP accepted by the /api routes (default 600, 0 = unlimited). */
  apiRateLimit: "API_RATE_LIMIT",
} as const;

/** URL templates for providers configured with just an API key. */
export const PROVIDER_URLS = {
  alchemy: {
    eth: (key: string) => `https://eth-mainnet.g.alchemy.com/v2/${key}`,
    sol: (key: string) => `https://solana-mainnet.g.alchemy.com/v2/${key}`,
  },
  infura: {
    eth: (key: string) => `https://mainnet.infura.io/v3/${key}`,
  },
  helius: {
    sol: (key: string) => `https://mainnet.helius-rpc.com/?api-key=${key}`,
  },
};

/** Free public endpoints, tried in order (Bitcoin requests are spread round-robin). */
export const PUBLIC_ENDPOINTS: Record<Chain, readonly string[]> = {
  /** Esplora REST APIs. */
  btc: ["https://mempool.space/api", "https://blockstream.info/api"],
  /** Ethereum mainnet JSON-RPC. */
  eth: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://1rpc.io/eth"],
  /** Solana mainnet JSON-RPC. */
  sol: ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"],
};

/** Same-origin routes the browser uses for chains that have a private provider. */
export const PROXY_ROUTES: Record<Chain, string> = {
  btc: "/api/btc",
  eth: "/api/rpc/eth",
  sol: "/api/rpc/sol",
};

/** Price feeds, called from the browser (no key needed). */
export const PRICE_ENDPOINTS = {
  coingecko:
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
  coinbase: "https://api.coinbase.com/v2/exchange-rates?currency=USD",
};

export interface Provider {
  /** Display name, may be shown on the page — never contains a key or URL. */
  name: string;
  /** Endpoint URL; may embed an API key, so it must stay on the server. */
  url: string;
  /** Bitcoin API flavour. */
  api?: "esplora" | "blockbook";
  headers?: Record<string, string>;
}

/** Endpoint lists handed to the browser. */
export type BrowserEndpoints = Record<Chain, string[]>;

export type ProviderEnv = Partial<Record<string, string | undefined>>;

const read = (env: ProviderEnv, name: string) => env[name]?.trim() || undefined;

const list = (env: ProviderEnv, name: string) =>
  (read(env, name) ?? "")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "custom";
  }
}

const byChain = <T>(fn: (chain: Chain) => T) =>
  Object.fromEntries(CHAINS.map((chain) => [chain, fn(chain)])) as Record<Chain, T>;

/** Private providers per chain, in the order they are tried. */
export function privateProviders(env: ProviderEnv): Record<Chain, Provider[]> {
  const alchemy = read(env, ENV.alchemyApiKey);
  const infura = read(env, ENV.infuraApiKey);
  const helius = read(env, ENV.heliusApiKey);
  const blockbookKey = read(env, ENV.btcBlockbookApiKey);
  const custom = (name: string): Provider[] => list(env, name).map((url) => ({ name: "Custom RPC", url }));

  return {
    eth: [
      ...(alchemy ? [{ name: "Alchemy", url: PROVIDER_URLS.alchemy.eth(alchemy) }] : []),
      ...(infura ? [{ name: "Infura", url: PROVIDER_URLS.infura.eth(infura) }] : []),
      ...custom(ENV.ethRpcUrls),
    ],
    sol: [
      ...(alchemy ? [{ name: "Alchemy", url: PROVIDER_URLS.alchemy.sol(alchemy) }] : []),
      ...(helius ? [{ name: "Helius", url: PROVIDER_URLS.helius.sol(helius) }] : []),
      ...custom(ENV.solRpcUrls),
    ],
    btc: [
      ...list(env, ENV.btcEsploraUrls).map((url): Provider => ({ name: "Esplora", url, api: "esplora" })),
      ...list(env, ENV.btcBlockbookUrls).map(
        (url): Provider => ({
          name: "Blockbook",
          url,
          api: "blockbook",
          ...(blockbookKey ? { headers: { "api-key": blockbookKey } } : {}),
        }),
      ),
    ],
  };
}

/** What the server's /api routes call: private providers, then public fallbacks. */
export function serverProviders(env: ProviderEnv): Record<Chain, Provider[]> {
  const own = privateProviders(env);
  const fallback = read(env, ENV.publicFallback)?.toLowerCase() !== "false";
  return byChain((chain) =>
    own[chain].length === 0
      ? []
      : [
          ...own[chain],
          ...(fallback
            ? PUBLIC_ENDPOINTS[chain].map(
                (url): Provider => ({ name: hostOf(url), url, ...(chain === "btc" ? { api: "esplora" } : {}) }),
              )
            : []),
        ],
  );
}

/** Where the browser sends lookups: this app's proxy when a private provider is set, else public endpoints. */
export function browserEndpoints(env: ProviderEnv): BrowserEndpoints {
  const own = privateProviders(env);
  return byChain((chain) => (own[chain].length > 0 ? [PROXY_ROUTES[chain]] : [...PUBLIC_ENDPOINTS[chain]]));
}

/** Provider names per chain (no keys), for display. Empty means public endpoints. */
export function providerNames(env: ProviderEnv): Record<Chain, string[]> {
  const own = privateProviders(env);
  return byChain((chain) => [...new Set(own[chain].map((p) => p.name))]);
}

/** Origins the page may fetch() from, for the CSP connect-src directive. */
export function connectOrigins(env: ProviderEnv): string[] {
  const endpoints = browserEndpoints(env);
  const urls = [...CHAINS.flatMap((chain) => endpoints[chain]), ...Object.values(PRICE_ENDPOINTS)];
  const origins = new Set<string>();
  for (const url of urls) {
    if (url.startsWith("http")) origins.add(new URL(url).origin);
  }
  return [...origins];
}

/** Requests per minute per IP for the /api routes; 0 disables the limit. */
export function apiRateLimit(env: ProviderEnv): number {
  const value = Number(read(env, ENV.apiRateLimit) ?? 600);
  return Number.isFinite(value) && value >= 0 ? value : 600;
}

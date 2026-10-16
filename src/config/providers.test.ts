import { describe, expect, it } from "vitest";
import {
  apiRateLimit,
  browserEndpoints,
  connectOrigins,
  PROXY_ROUTES,
  PUBLIC_ENDPOINTS,
  privateProviders,
  providerNames,
  serverProviders,
} from "./providers";

const ALL = {
  ALCHEMY_API_KEY: "alc-key",
  INFURA_API_KEY: "inf-key",
  HELIUS_API_KEY: "hel-key",
  ETH_RPC_URLS: "https://example.quiknode.pro/eth-token/, https://node.local:8545",
  SOL_RPC_URLS: "https://example.solana-mainnet.quiknode.pro/sol-token/",
  BTC_ESPLORA_URLS: "http://umbrel.local:3006/api/",
  BTC_BLOCKBOOK_URLS: "https://btcbook.example.com/api/v2",
  BTC_BLOCKBOOK_API_KEY: "bb-key",
};

describe("provider config", () => {
  it("uses public endpoints from the browser when nothing is configured", () => {
    expect(privateProviders({})).toEqual({ btc: [], eth: [], sol: [] });
    expect(serverProviders({})).toEqual({ btc: [], eth: [], sol: [] });
    expect(browserEndpoints({})).toEqual({
      btc: [...PUBLIC_ENDPOINTS.btc],
      eth: [...PUBLIC_ENDPOINTS.eth],
      sol: [...PUBLIC_ENDPOINTS.sol],
    });
  });

  it("builds private providers from keys and URL lists, in order", () => {
    const own = privateProviders(ALL);
    expect(own.eth).toEqual([
      { name: "Alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/alc-key" },
      { name: "Infura", url: "https://mainnet.infura.io/v3/inf-key" },
      { name: "Custom RPC", url: "https://example.quiknode.pro/eth-token" },
      { name: "Custom RPC", url: "https://node.local:8545" },
    ]);
    expect(own.sol.map((p) => p.name)).toEqual(["Alchemy", "Helius", "Custom RPC"]);
    expect(own.sol[0].url).toBe("https://solana-mainnet.g.alchemy.com/v2/alc-key");
    expect(own.sol[1].url).toBe("https://mainnet.helius-rpc.com/?api-key=hel-key");
    expect(own.btc).toEqual([
      { name: "Esplora", url: "http://umbrel.local:3006/api", api: "esplora" },
      { name: "Blockbook", url: "https://btcbook.example.com/api/v2", api: "blockbook", headers: { "api-key": "bb-key" } },
    ]);
  });

  it("sends the browser to the proxy only for chains with a private provider", () => {
    expect(browserEndpoints({ ALCHEMY_API_KEY: "k" })).toEqual({
      btc: [...PUBLIC_ENDPOINTS.btc],
      eth: [PROXY_ROUTES.eth],
      sol: [PROXY_ROUTES.sol],
    });
  });

  it("appends public fallbacks on the server unless disabled", () => {
    const withFallback = serverProviders({ ALCHEMY_API_KEY: "k" });
    expect(withFallback.eth.map((p) => p.name)).toEqual([
      "Alchemy",
      "ethereum-rpc.publicnode.com",
      "eth.llamarpc.com",
      "1rpc.io",
    ]);
    expect(withFallback.btc).toEqual([]);

    const strict = serverProviders({ ALCHEMY_API_KEY: "k", PUBLIC_FALLBACK: "false" });
    expect(strict.eth.map((p) => p.name)).toEqual(["Alchemy"]);

    const btc = serverProviders({ BTC_ESPLORA_URLS: "http://umbrel.local:3006/api" }).btc;
    expect(btc.map((p) => p.api)).toEqual(["esplora", "esplora", "esplora"]);
  });

  it("never exposes keys in names or browser endpoints", () => {
    const visible = JSON.stringify([providerNames(ALL), browserEndpoints(ALL), connectOrigins(ALL)]);
    expect(providerNames(ALL)).toEqual({
      btc: ["Esplora", "Blockbook"],
      eth: ["Alchemy", "Infura", "Custom RPC"],
      sol: ["Alchemy", "Helius", "Custom RPC"],
    });
    for (const secret of ["alc-key", "inf-key", "hel-key", "eth-token", "sol-token", "bb-key", "quiknode", "umbrel"]) {
      expect(visible).not.toContain(secret);
    }
  });

  it("limits the CSP to the origins the browser calls", () => {
    expect(connectOrigins({})).toContain("https://mempool.space");
    const proxied = connectOrigins({ ALCHEMY_API_KEY: "k", BTC_ESPLORA_URLS: "http://umbrel.local:3006/api" });
    expect(proxied).toEqual(["https://api.coingecko.com", "https://api.coinbase.com"]);
  });

  it("reads the API rate limit", () => {
    expect(apiRateLimit({})).toBe(600);
    expect(apiRateLimit({ API_RATE_LIMIT: "0" })).toBe(0);
    expect(apiRateLimit({ API_RATE_LIMIT: "nope" })).toBe(600);
  });
});

import { PRICE_ENDPOINTS } from "@/lib/endpoints";
import { requestJson } from "@/lib/net";
import type { Prices } from "@/lib/types";

type CoinGeckoResponse = Record<string, { usd?: number; usd_24h_change?: number } | undefined>;

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

async function fromCoinGecko(signal?: AbortSignal): Promise<Prices> {
  const data = await requestJson<CoinGeckoResponse>(PRICE_ENDPOINTS.coingecko, { signal, timeoutMs: 8000 });
  const btc = data.bitcoin?.usd;
  const eth = data.ethereum?.usd;
  const sol = data.solana?.usd;
  if (!valid(btc) || !valid(eth) || !valid(sol)) throw new Error("Incomplete price data");
  return {
    usd: { btc, eth, sol },
    change24h: {
      btc: data.bitcoin?.usd_24h_change,
      eth: data.ethereum?.usd_24h_change,
      sol: data.solana?.usd_24h_change,
    },
    source: "CoinGecko",
  };
}

async function fromCoinbase(signal?: AbortSignal): Promise<Prices> {
  const data = await requestJson<{ data?: { rates?: Record<string, string> } }>(PRICE_ENDPOINTS.coinbase, {
    signal,
    timeoutMs: 8000,
  });
  const price = (symbol: string) => {
    const rate = Number(data.data?.rates?.[symbol]);
    if (!valid(rate)) throw new Error("Incomplete price data");
    return 1 / rate;
  };
  return { usd: { btc: price("BTC"), eth: price("ETH"), sol: price("SOL") }, source: "Coinbase" };
}

/** USD spot prices; stablecoins are valued at $1. */
export async function fetchPrices(signal?: AbortSignal): Promise<Prices> {
  try {
    return await fromCoinGecko(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return fromCoinbase(signal);
  }
}

import type { Provider } from "@/config/providers";
import { ProviderPool, requestJson, rpcBatch, rpcCall, type RpcCall } from "@/lib/net";

export type UpstreamPool = ProviderPool<Provider>;

export function forwardEthBatch(pool: UpstreamPool, calls: RpcCall[], signal?: AbortSignal): Promise<unknown[]> {
  return pool.run((provider) => rpcBatch(provider.url, calls, signal), signal);
}

export function forwardSolCall(pool: UpstreamPool, call: RpcCall, signal?: AbortSignal): Promise<unknown> {
  return pool.run((provider) => rpcCall(provider.url, call, signal), signal);
}

interface EsploraStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

/** The subset of Esplora's GET /address/:address response the app reads. */
export interface EsploraAddress {
  chain_stats: EsploraStats;
  mempool_stats: EsploraStats;
}

const BAD_RESPONSE = "Unexpected response from Bitcoin API";

function integer(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new Error(BAD_RESPONSE);
  return n;
}

function stats(value: unknown): EsploraStats {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    funded_txo_sum: integer(v.funded_txo_sum),
    spent_txo_sum: integer(v.spent_txo_sum),
    tx_count: integer(v.tx_count),
  };
}

export function fromEsplora(data: unknown): EsploraAddress {
  const d = (data ?? {}) as Record<string, unknown>;
  return { chain_stats: stats(d.chain_stats), mempool_stats: stats(d.mempool_stats) };
}

/** Blockbook GET /api/v2/address/:address?details=basic → Esplora shape. */
export function fromBlockbook(data: unknown): EsploraAddress {
  const d = (data ?? {}) as Record<string, unknown>;
  const unconfirmed = integer(d.unconfirmedBalance ?? 0);
  return {
    chain_stats: {
      funded_txo_sum: integer(d.totalReceived),
      spent_txo_sum: integer(d.totalSent),
      tx_count: integer(d.txs ?? 0),
    },
    mempool_stats: {
      funded_txo_sum: Math.max(unconfirmed, 0),
      spent_txo_sum: Math.max(-unconfirmed, 0),
      tx_count: integer(d.unconfirmedTxs ?? 0),
    },
  };
}

export function lookupBtcAddress(pool: UpstreamPool, address: string, signal?: AbortSignal): Promise<EsploraAddress> {
  return pool.run(async (provider) => {
    const blockbook = provider.api === "blockbook";
    const url = `${provider.url}/address/${address}${blockbook ? "?details=basic" : ""}`;
    const data = await requestJson(url, { headers: provider.headers, signal });
    return blockbook ? fromBlockbook(data) : fromEsplora(data);
  }, signal);
}

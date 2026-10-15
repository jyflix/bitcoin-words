import { ProviderPool, requestJson } from "@/lib/net";

export interface BtcAddressInfo {
  /** Confirmed + unconfirmed balance in satoshis. */
  balance: bigint;
  /** Unconfirmed (mempool) delta in satoshis. */
  pending: bigint;
  txCount: number;
}

interface EsploraStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

function isStats(value: unknown): value is EsploraStats {
  const v = value as EsploraStats | null;
  return (
    typeof v?.funded_txo_sum === "number" &&
    typeof v.spent_txo_sum === "number" &&
    typeof v.tx_count === "number"
  );
}

/** Parses an Esplora (mempool.space / Blockstream) GET /address/:addr response. */
export function parseEsploraAddress(data: unknown): BtcAddressInfo {
  const { chain_stats: chain, mempool_stats: mempool } = (data ?? {}) as Record<string, unknown>;
  if (!isStats(chain) || !isStats(mempool)) throw new Error("Unexpected response from Bitcoin API");
  const confirmed = BigInt(chain.funded_txo_sum - chain.spent_txo_sum);
  const pending = BigInt(mempool.funded_txo_sum - mempool.spent_txo_sum);
  return { balance: confirmed + pending, pending, txCount: chain.tx_count + mempool.tx_count };
}

export function fetchBtcAddress(
  pool: ProviderPool,
  address: string,
  signal?: AbortSignal,
): Promise<BtcAddressInfo> {
  return pool.run(
    async (base) => parseEsploraAddress(await requestJson(`${base}/address/${address}`, { signal })),
    signal,
  );
}

import { ProviderPool, RpcError, rpcBatch, type RpcCall } from "@/lib/net";
import type { TokenBalance } from "@/lib/types";

export const ETH_TOKENS = [
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
] as const;

/** ERC-20 balanceOf(address) selector. */
const BALANCE_OF = "0x70a08231";
const CALLS_PER_ADDRESS = 2 + ETH_TOKENS.length;

export interface EthAddressInfo {
  balance: bigint;
  /** Number of transactions sent from the address. */
  nonce: number;
  tokens: TokenBalance[];
}

export function ethCallsFor(address: string): RpcCall[] {
  const owner = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return [
    { method: "eth_getBalance", params: [address, "latest"] },
    { method: "eth_getTransactionCount", params: [address, "latest"] },
    ...ETH_TOKENS.map((token) => ({
      method: "eth_call",
      params: [{ to: token.address, data: `${BALANCE_OF}${owner}` }, "latest"],
    })),
  ];
}

export function parseQuantity(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new RpcError("Unexpected response from Ethereum RPC");
  }
  return value === "0x" ? 0n : BigInt(value);
}

export function parseEthResults(addressCount: number, results: unknown[]): EthAddressInfo[] {
  return Array.from({ length: addressCount }, (_, i) => {
    const r = results.slice(i * CALLS_PER_ADDRESS, (i + 1) * CALLS_PER_ADDRESS);
    return {
      balance: parseQuantity(r[0]),
      nonce: Number(parseQuantity(r[1])),
      tokens: ETH_TOKENS.map((token, k) => ({
        symbol: token.symbol,
        decimals: token.decimals,
        amount: parseQuantity(r[2 + k]),
      })),
    };
  });
}

/** ETH, USDT and USDC balances plus nonce for each address, in one batch. */
export async function fetchEthBalances(
  pool: ProviderPool,
  addresses: string[],
  signal?: AbortSignal,
): Promise<EthAddressInfo[]> {
  const calls = addresses.flatMap(ethCallsFor);
  try {
    return await pool.run(
      async (url) => parseEthResults(addresses.length, await rpcBatch(url, calls, signal)),
      signal,
    );
  } catch (error) {
    // Some providers cap batch sizes; retry in halves before giving up.
    if (signal?.aborted || !(error instanceof RpcError) || addresses.length === 1) throw error;
    const mid = Math.ceil(addresses.length / 2);
    const [head, tail] = await Promise.all([
      fetchEthBalances(pool, addresses.slice(0, mid), signal),
      fetchEthBalances(pool, addresses.slice(mid), signal),
    ]);
    return [...head, ...tail];
  }
}

import { base64 } from "@scure/base";
import { associatedTokenAddress } from "@/lib/derive/solana";
import { ProviderPool, RpcError, chunk, rpcCall } from "@/lib/net";
import type { TokenBalance } from "@/lib/types";

export const SOL_TOKENS = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
] as const;

export interface SolAddressInfo {
  /** Lamports. */
  balance: bigint;
  /** The account exists on-chain (has ever been funded and not closed). */
  exists: boolean;
  tokens: TokenBalance[];
}

interface AccountInfo {
  lamports: number;
  data: unknown;
}

const MAX_KEYS = 100;

async function getMultipleAccounts(
  pool: ProviderPool,
  keys: string[],
  dataSlice: { offset: number; length: number },
  signal?: AbortSignal,
): Promise<(AccountInfo | null)[]> {
  const out: (AccountInfo | null)[] = [];
  for (const part of chunk(keys, MAX_KEYS)) {
    const result = await pool.run(async (url) => {
      const res = await rpcCall<{ value?: unknown }>(
        url,
        {
          method: "getMultipleAccounts",
          params: [part, { encoding: "base64", dataSlice, commitment: "confirmed" }],
        },
        signal,
      );
      if (!Array.isArray(res?.value) || res.value.length !== part.length) {
        throw new RpcError("Unexpected response from Solana RPC");
      }
      return res.value as (AccountInfo | null)[];
    }, signal);
    out.push(...result);
  }
  return out;
}

/** Reads a little-endian u64 from base64 account data. */
export function readU64(data: unknown): bigint {
  if (!Array.isArray(data) || typeof data[0] !== "string") return 0n;
  const bytes = base64.decode(data[0]);
  if (bytes.length < 8) return 0n;
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

/**
 * SOL balances via getMultipleAccounts, plus USDC/USDT held in each owner's
 * associated token account (amount = u64 at byte offset 64 of the account).
 */
export async function fetchSolBalances(
  pool: ProviderPool,
  owners: string[],
  signal?: AbortSignal,
): Promise<SolAddressInfo[]> {
  const tokenAccounts = owners.flatMap((owner) =>
    SOL_TOKENS.map((token) => associatedTokenAddress(owner, token.mint)),
  );
  const [accounts, tokens] = await Promise.all([
    getMultipleAccounts(pool, owners, { offset: 0, length: 0 }, signal),
    getMultipleAccounts(pool, tokenAccounts, { offset: 64, length: 8 }, signal),
  ]);
  return owners.map((_, i) => {
    const account = accounts[i];
    return {
      balance: BigInt(account?.lamports ?? 0),
      exists: account != null,
      tokens: SOL_TOKENS.map((token, k) => ({
        symbol: token.symbol,
        decimals: token.decimals,
        amount: readU64(tokens[i * SOL_TOKENS.length + k]?.data),
      })),
    };
  });
}

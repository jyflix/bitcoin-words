import { ETH_TOKENS } from "@/lib/chains/ethereum";
import type { RpcCall } from "@/lib/net";

/**
 * The /api proxy only forwards the exact calls this app makes, rebuilt from
 * validated parts, so nobody can spend your provider quota on anything else.
 */

export const MAX_ETH_CALLS = 100;
export const MAX_SOL_KEYS = 100;

const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BALANCE_OF_CALL = /^0x70a08231[0-9a-fA-F]{64}$/;
const TOKEN_CONTRACTS = new Set<string>(ETH_TOKENS.map((t) => t.address.toLowerCase()));
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BTC_ADDRESS = /^(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|bc1[02-9ac-hj-np-z]{11,87})$/;

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is number | string =>
  (typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && value.length <= 64);

export interface EthBatch {
  ids: (number | string)[];
  calls: RpcCall[];
}

/** eth_getBalance / eth_getTransactionCount for an address, or USDT/USDC balanceOf. */
export function parseEthBatch(body: unknown): EthBatch | null {
  if (!Array.isArray(body) || body.length === 0 || body.length > MAX_ETH_CALLS) return null;
  const batch: EthBatch = { ids: [], calls: [] };
  for (const item of body) {
    if (!isObject(item) || !isId(item.id) || !Array.isArray(item.params) || item.params.length !== 2) return null;
    const [target, block] = item.params;
    if (block !== "latest") return null;

    if (item.method === "eth_getBalance" || item.method === "eth_getTransactionCount") {
      if (typeof target !== "string" || !ETH_ADDRESS.test(target)) return null;
      batch.calls.push({ method: item.method, params: [target, "latest"] });
    } else if (item.method === "eth_call") {
      if (!isObject(target) || typeof target.to !== "string" || typeof target.data !== "string") return null;
      if (!TOKEN_CONTRACTS.has(target.to.toLowerCase()) || !BALANCE_OF_CALL.test(target.data)) return null;
      batch.calls.push({ method: "eth_call", params: [{ to: target.to, data: target.data }, "latest"] });
    } else {
      return null;
    }
    batch.ids.push(item.id);
  }
  return batch;
}

/** getMultipleAccounts for up to 100 addresses: SOL balances, or token amounts at offset 64. */
export function parseSolRequest(body: unknown): { id: number | string; call: RpcCall } | null {
  if (!isObject(body) || body.method !== "getMultipleAccounts" || !Array.isArray(body.params)) return null;
  const [keys, config] = body.params;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_SOL_KEYS) return null;
  if (!keys.every((key) => typeof key === "string" && SOL_ADDRESS.test(key))) return null;
  if (!isObject(config) || config.encoding !== "base64" || !isObject(config.dataSlice)) return null;

  const { offset, length } = config.dataSlice;
  const dataSlice =
    offset === 0 && length === 0 ? { offset: 0, length: 0 } : offset === 64 && length === 8 ? { offset: 64, length: 8 } : null;
  if (!dataSlice) return null;

  return {
    id: isId(body.id) ? body.id : 1,
    call: { method: "getMultipleAccounts", params: [keys, { encoding: "base64", dataSlice, commitment: "confirmed" }] },
  };
}

/** Mainnet P2PKH / P2SH (base58) or SegWit / Taproot (lowercase bech32). */
export const isBtcAddress = (value: string) => BTC_ADDRESS.test(value);

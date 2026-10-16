import type { ChainId } from "./types";

/** Block explorer links for addresses. */
export const EXPLORERS: Record<ChainId, (address: string) => string> = {
  btc: (address) => `https://mempool.space/address/${address}`,
  eth: (address) => `https://etherscan.io/address/${address}`,
  sol: (address) => `https://solscan.io/account/${address}`,
};

export type ChainId = "btc" | "eth" | "sol";

export const CHAIN_IDS: readonly ChainId[] = ["btc", "eth", "sol"];

export interface ChainMeta {
  id: ChainId;
  name: string;
  symbol: string;
  decimals: number;
  /** Fraction digits shown for balances. */
  displayDecimals: number;
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  btc: { id: "btc", name: "Bitcoin", symbol: "BTC", decimals: 8, displayDecimals: 8 },
  eth: { id: "eth", name: "Ethereum", symbol: "ETH", decimals: 18, displayDecimals: 6 },
  sol: { id: "sol", name: "Solana", symbol: "SOL", decimals: 9, displayDecimals: 6 },
};

export interface TokenBalance {
  symbol: string;
  decimals: number;
  amount: bigint;
}

/** A derivation scheme as shown in the UI (one row per group). */
export interface GroupInfo {
  id: string;
  chain: ChainId;
  title: string;
  badge: string;
  /** Human-readable path template, e.g. m/84'/0'/0'/{0,1}/i */
  path: string;
  /** Wallets known to use this scheme. */
  wallets: string;
}

export interface DerivedAddress {
  address: string;
  path: string;
  index: number;
  /** Bitcoin change (internal) chain. */
  change?: boolean;
}

export type AddressStatus = "pending" | "done" | "error";

export interface AddressEntry extends DerivedAddress {
  status: AddressStatus;
  /** Balance in base units (sats / wei / lamports), including unconfirmed. */
  balance?: bigint;
  /** Bitcoin only: unconfirmed (mempool) delta already included in balance. */
  pending?: bigint;
  /** Bitcoin: transaction count. Ethereum: nonce (outgoing transactions). */
  txCount?: number;
  tokens?: TokenBalance[];
  /** Has on-chain history (transactions, an existing account, or funds). */
  used?: boolean;
}

export interface AddressGroup extends GroupInfo {
  addresses: AddressEntry[];
  status: "scanning" | "done" | "error";
  error?: string;
  /** Provisional groups (extra Bitcoin accounts) stay hidden until found used. */
  hidden?: boolean;
}

export interface Prices {
  usd: Record<ChainId, number>;
  change24h?: Partial<Record<ChainId, number>>;
  source: string;
}

export type ChainScanStatus = "scanning" | "done" | "error" | "skipped" | "stopped";

export interface ScanSnapshot {
  status: "running" | "done" | "stopped" | "error";
  groups: AddressGroup[];
  chains: Partial<Record<ChainId, { status: ChainScanStatus; note?: string }>>;
  prices: Prices | null;
  pricesError?: string;
  /** Addresses with a settled result. */
  checked: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

import { fetchBtcAddress, type BtcAddressInfo } from "@/lib/chains/bitcoin";
import { fetchEthBalances, type EthAddressInfo } from "@/lib/chains/ethereum";
import { fetchPrices } from "@/lib/chains/prices";
import { fetchSolBalances, type SolAddressInfo } from "@/lib/chains/solana";
import { deriveMaterial, type BtcAccount, type DeriveInput, type FixedGroup } from "@/lib/derive";
import { ENDPOINTS } from "@/lib/endpoints";
import { ProviderPool, abortReason, chunk, createLimiter, errorMessage } from "@/lib/net";
import {
  CHAIN_IDS,
  type AddressEntry,
  type AddressGroup,
  type ChainId,
  type ChainScanStatus,
  type DerivedAddress,
  type GroupInfo,
  type Prices,
  type ScanSnapshot,
} from "@/lib/types";

export type { DeriveInput as ScanParams };

/** Network access, injectable for tests. Only public addresses go in. */
export interface BalanceClients {
  btc(address: string, signal: AbortSignal): Promise<BtcAddressInfo>;
  eth(addresses: string[], signal: AbortSignal): Promise<EthAddressInfo[]>;
  sol(addresses: string[], signal: AbortSignal): Promise<SolAddressInfo[]>;
  prices(signal: AbortSignal): Promise<Prices>;
}

export function createClients(): BalanceClients {
  // Bitcoin needs one request per address, so spread them over every Esplora host.
  const btc = new ProviderPool(ENDPOINTS.btc, "round-robin");
  const eth = new ProviderPool(ENDPOINTS.eth);
  const sol = new ProviderPool(ENDPOINTS.sol);
  return {
    btc: (address, signal) => fetchBtcAddress(btc, address, signal),
    eth: (addresses, signal) => fetchEthBalances(eth, addresses, signal),
    sol: (addresses, signal) => fetchSolBalances(sol, addresses, signal),
    prices: (signal) => fetchPrices(signal),
  };
}

export interface ScanOptions {
  signal: AbortSignal;
  onUpdate: (snapshot: ScanSnapshot) => void;
  clients?: BalanceClients;
  /** Minimum delay between progress updates, in ms. */
  throttleMs?: number;
}

const BTC_CONCURRENCY = 4;
/** Ethereum addresses per JSON-RPC batch (4 calls each). */
const ETH_BATCH = 5;
const ETH_CONCURRENCY = 2;
const SOL_BATCH = 100;
const CHAIN_ORDER: Record<ChainId, number> = { btc: 0, eth: 1, sol: 2 };

const hasFunds = (entry: Partial<AddressEntry>) =>
  (entry.balance ?? 0n) > 0n || (entry.tokens ?? []).some((t) => t.amount > 0n);

function applyEth(info: EthAddressInfo): Partial<AddressEntry> {
  const fields = { balance: info.balance, txCount: info.nonce, tokens: info.tokens };
  return { ...fields, used: info.nonce > 0 || hasFunds(fields) };
}

function applySol(info: SolAddressInfo): Partial<AddressEntry> {
  const fields = { balance: info.balance, tokens: info.tokens };
  return { ...fields, used: info.exists || hasFunds(fields) };
}

class ScanSession {
  private readonly groups: AddressGroup[] = [];
  private readonly order = new Map<AddressGroup, number>();
  private readonly chains: ScanSnapshot["chains"] = {};
  private prices: Prices | null = null;
  private pricesError?: string;
  private status: ScanSnapshot["status"] = "running";
  private error?: string;
  private checked = 0;
  private readonly startedAt = Date.now();
  private finishedAt?: number;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onUpdate: (snapshot: ScanSnapshot) => void,
    private readonly throttleMs: number,
  ) {}

  snapshot(): ScanSnapshot {
    const groups = [...this.groups]
      .sort(
        (a, b) =>
          CHAIN_ORDER[a.chain] - CHAIN_ORDER[b.chain] || this.order.get(a)! - this.order.get(b)!,
      )
      .map((group) => ({ ...group, addresses: group.addresses.map((entry) => ({ ...entry })) }));
    return {
      status: this.status,
      groups,
      chains: { ...this.chains },
      prices: this.prices,
      pricesError: this.pricesError,
      checked: this.checked,
      error: this.error,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  private changed() {
    if (this.timer === null) this.timer = setTimeout(() => this.flush(), this.throttleMs);
  }

  flush() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.onUpdate(this.snapshot());
  }

  setChain(chain: ChainId, status: ChainScanStatus, note?: string) {
    this.chains[chain] = { status, note };
    this.changed();
  }

  private addGroup(info: GroupInfo, order: number, hidden = false): AddressGroup {
    const group: AddressGroup = { ...info, addresses: [], status: "scanning", hidden };
    this.groups.push(group);
    this.order.set(group, order);
    this.changed();
    return group;
  }

  private removeGroup(group: AddressGroup) {
    const index = this.groups.indexOf(group);
    if (index >= 0) this.groups.splice(index, 1);
    this.order.delete(group);
    this.changed();
  }

  private addAddress(group: AddressGroup, derived: DerivedAddress): AddressEntry {
    const entry: AddressEntry = { ...derived, status: "pending" };
    group.addresses.push(entry);
    this.changed();
    return entry;
  }

  private settle(entry: AddressEntry, fields: Partial<AddressEntry>) {
    Object.assign(entry, fields);
    this.checked++;
    this.changed();
  }

  async loadPrices(clients: BalanceClients, signal: AbortSignal) {
    try {
      this.prices = await clients.prices(signal);
    } catch (error) {
      if (!signal.aborted) this.pricesError = errorMessage(error);
    }
    this.changed();
  }

  // ── Bitcoin: BIP44 account discovery + gap-limit address scanning ──────

  async scanBitcoin(schemes: BtcAccount[][], gap: number, clients: BalanceClients, signal: AbortSignal) {
    const limit = createLimiter(BTC_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      schemes.map((accounts, i) => this.scanBtcScheme(accounts, i, gap, limit, clients, signal)),
    );
    if (signal.aborted) return;
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
    if (failure) this.setChain("btc", "error", errorMessage(failure.reason));
    else this.setChain("btc", "done");
  }

  private async scanBtcScheme(
    accounts: BtcAccount[],
    schemeIndex: number,
    gap: number,
    limit: ReturnType<typeof createLimiter>,
    clients: BalanceClients,
    signal: AbortSignal,
  ) {
    for (let a = 0; a < accounts.length; a++) {
      // Account #1 is always shown; later accounts only once they turn out used.
      const group = this.addGroup(accounts[a].group, schemeIndex * 100 + a, a > 0);
      let used: boolean;
      try {
        used = await this.scanBtcAccount(group, accounts[a], gap, limit, clients, signal);
      } catch (error) {
        if (!signal.aborted) {
          Object.assign(group, { status: "error", error: errorMessage(error), hidden: false });
          this.changed();
        }
        throw error;
      }
      group.status = "done";
      if (used) {
        group.hidden = false;
        this.changed();
        continue;
      }
      if (a > 0) this.removeGroup(group);
      this.changed();
      return;
    }
  }

  /** Returns whether any address of the account has transaction history. */
  private async scanBtcAccount(
    group: AddressGroup,
    account: BtcAccount,
    gap: number,
    limit: ReturnType<typeof createLimiter>,
    clients: BalanceClients,
    signal: AbortSignal,
  ): Promise<boolean> {
    let used = false;
    for (const change of [0, 1] as const) {
      let next = 0;
      let lastUsed = -1;
      // Keep going until `gap` consecutive addresses after the last used one are empty.
      while (next <= lastUsed + gap) {
        const end = lastUsed + gap;
        const entries: AddressEntry[] = [];
        for (let i = next; i <= end; i++) entries.push(this.addAddress(group, account.address(change, i)));
        await Promise.all(
          entries.map((entry) =>
            limit(async () => {
              if (signal.aborted) throw abortReason(signal);
              try {
                const info = await clients.btc(entry.address, signal);
                this.settle(entry, { status: "done", ...info, used: info.txCount > 0 });
              } catch (error) {
                if (!signal.aborted) this.settle(entry, { status: "error" });
                throw error;
              }
            }),
          ),
        );
        for (const entry of entries) if (entry.used) lastUsed = Math.max(lastUsed, entry.index);
        next = end + 1;
      }
      if (lastUsed >= 0) used = true;
      else if (change === 0) break; // Never received anything, so there is no change either.
    }
    return used;
  }

  // ── Ethereum / Solana: a fixed number of addresses per path ────────────

  async scanFixed<T>(
    chain: ChainId,
    fixedGroups: FixedGroup[],
    batchSize: number,
    concurrency: number,
    fetchBatch: (addresses: string[], signal: AbortSignal) => Promise<T[]>,
    apply: (info: T) => Partial<AddressEntry>,
    signal: AbortSignal,
  ) {
    const items: { group: AddressGroup; entry: AddressEntry }[] = [];
    fixedGroups.forEach((fixed, i) => {
      const group = this.addGroup(fixed.group, i);
      for (const derived of fixed.addresses) items.push({ group, entry: this.addAddress(group, derived) });
    });

    const limit = createLimiter(concurrency);
    let failure: unknown;
    await Promise.all(
      chunk(items, batchSize).map((batch) =>
        limit(async () => {
          if (signal.aborted) return;
          try {
            const infos = await fetchBatch(
              batch.map((item) => item.entry.address),
              signal,
            );
            batch.forEach((item, i) => this.settle(item.entry, { status: "done", ...apply(infos[i]) }));
          } catch (error) {
            if (signal.aborted) return;
            failure ??= error;
            for (const item of batch) {
              this.settle(item.entry, { status: "error" });
              Object.assign(item.group, { status: "error", error: errorMessage(error) });
            }
          }
        }),
      ),
    );
    if (signal.aborted) return;
    for (const { group } of items) if (group.status === "scanning") group.status = "done";
    if (failure) this.setChain(chain, "error", errorMessage(failure));
    else this.setChain(chain, "done");
  }

  finish(status: ScanSnapshot["status"], error?: string) {
    this.status = status;
    this.error = error;
    this.finishedAt = Date.now();
    for (const group of this.groups) if (group.status === "scanning") group.status = "done";
    for (const chain of CHAIN_IDS) {
      if (this.chains[chain]?.status !== "scanning") continue;
      this.chains[chain] = { status: status === "stopped" ? "stopped" : status === "error" ? "error" : "done" };
    }
    this.flush();
  }
}

/**
 * Derives addresses for every selected chain and streams balance results.
 * Resolves with the final snapshot; never rejects.
 */
export async function runScan(params: DeriveInput, options: ScanOptions): Promise<ScanSnapshot> {
  const { signal, onUpdate, clients = createClients(), throttleMs = 80 } = options;
  const session = new ScanSession(onUpdate, throttleMs);

  for (const chain of CHAIN_IDS) {
    if (!params.chains[chain]) continue;
    if (chain !== "btc" && !params.bip39) {
      session.setChain(chain, "skipped", "Electrum seeds only hold bitcoin");
    } else {
      session.setChain(chain, "scanning");
    }
  }
  session.flush();

  try {
    if (!params.bip39 && !params.electrum) throw new Error("Not a valid recovery phrase");
    const material = await deriveMaterial(params);
    if (signal.aborted) throw abortReason(signal);

    await Promise.all([
      session.loadPrices(clients, signal),
      material.btc.length > 0 && session.scanBitcoin(material.btc, params.count, clients, signal),
      material.eth.length > 0 &&
        session.scanFixed("eth", material.eth, ETH_BATCH, ETH_CONCURRENCY, clients.eth, applyEth, signal),
      material.sol.length > 0 &&
        session.scanFixed("sol", material.sol, SOL_BATCH, 1, clients.sol, applySol, signal),
    ]);
    session.finish(signal.aborted ? "stopped" : "done");
  } catch (error) {
    if (signal.aborted) session.finish("stopped");
    else session.finish("error", errorMessage(error));
  }
  return session.snapshot();
}

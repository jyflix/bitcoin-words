import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { describe, expect, it } from "vitest";
import { BIP_SCHEMES, deriveBipAccounts } from "./derive/bitcoin";
import type { DeriveInput } from "./derive";
import { abortReason } from "./net";
import { runScan, type BalanceClients } from "./scanner";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const root = HDKey.fromMasterSeed(mnemonicToSeedSync(ABANDON));

function btcAddress(scheme: string, account: number, change: 0 | 1, index: number) {
  const s = BIP_SCHEMES.find((x) => x.id === scheme)!;
  return deriveBipAccounts(root, s, account + 1)[account].address(change, index).address;
}

interface FakeOptions {
  btcUsed?: Record<string, bigint>;
  btcFail?: Set<string>;
  eth?: Record<string, bigint>;
  sol?: Record<string, bigint>;
}

function fakeClients(options: FakeOptions = {}) {
  const btcCalls: string[] = [];
  const clients: BalanceClients = {
    async btc(address) {
      btcCalls.push(address);
      if (options.btcFail?.has(address)) throw new Error("Provider responded with HTTP 500");
      const balance = options.btcUsed?.[address];
      return balance === undefined
        ? { balance: 0n, pending: 0n, txCount: 0 }
        : { balance, pending: 0n, txCount: 2 };
    },
    async eth(addresses) {
      return addresses.map((a) => ({ balance: options.eth?.[a] ?? 0n, nonce: 0, tokens: [] }));
    },
    async sol(addresses) {
      return addresses.map((a) => ({
        balance: options.sol?.[a] ?? 0n,
        exists: options.sol?.[a] !== undefined,
        tokens: [],
      }));
    },
    async prices() {
      return { usd: { btc: 100_000, eth: 4_000, sol: 200 }, source: "test" };
    },
  };
  return { clients, btcCalls };
}

function params(overrides: Partial<DeriveInput> = {}): DeriveInput {
  return {
    mnemonic: ABANDON,
    passphrase: "",
    bip39: true,
    electrum: null,
    count: 3,
    chains: { btc: true, eth: true, sol: true },
    ...overrides,
  };
}

const scan = (input: DeriveInput, clients: BalanceClients, signal = new AbortController().signal) =>
  runScan(input, { signal, clients, onUpdate: () => {}, throttleMs: 0 });

const btcOnly = { btc: true, eth: false, sol: false };

describe("bitcoin scanning", () => {
  it("keeps scanning until `gap` empty addresses follow the last used one", async () => {
    const { clients, btcCalls } = fakeClients({ btcUsed: { [btcAddress("bip84", 0, 0, 2)]: 5000n } });
    const result = await scan(params({ chains: btcOnly }), clients);

    expect(result.status).toBe("done");
    expect(result.chains.btc?.status).toBe("done");

    const segwit = result.groups.find((g) => g.id === "btc-bip84-0")!;
    expect(segwit.addresses.filter((a) => !a.change).map((a) => a.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(segwit.addresses.filter((a) => a.change).map((a) => a.index)).toEqual([0, 1, 2]);
    expect(segwit.addresses[2]).toMatchObject({ balance: 5000n, used: true, status: "done" });

    // Unused schemes check `gap` receive addresses and skip the change chain.
    const taproot = result.groups.find((g) => g.id === "btc-bip86-0")!;
    expect(taproot.addresses.map((a) => a.path)).toEqual([
      "m/86'/0'/0'/0/0",
      "m/86'/0'/0'/0/1",
      "m/86'/0'/0'/0/2",
    ]);

    // Account #2 is probed because #1 is used, then dropped as empty.
    expect(btcCalls).toContain(btcAddress("bip84", 1, 0, 0));
    expect(result.groups.some((g) => g.id === "btc-bip84-1")).toBe(false);
  });

  it("reveals further accounts that have history", async () => {
    const { clients } = fakeClients({
      btcUsed: { [btcAddress("bip84", 0, 0, 0)]: 1n, [btcAddress("bip84", 1, 0, 1)]: 2n },
    });
    const result = await scan(params({ chains: btcOnly }), clients);
    expect(result.groups.find((g) => g.id === "btc-bip84-1")).toMatchObject({
      hidden: false,
      status: "done",
      title: "Native SegWit · Account 2",
    });
    expect(result.groups.some((g) => g.id === "btc-bip84-2")).toBe(false);
  });

  it("isolates failures to the affected group", async () => {
    const { clients } = fakeClients({ btcFail: new Set([btcAddress("bip49", 0, 0, 1)]) });
    const result = await scan(params(), clients);
    expect(result.status).toBe("done");
    expect(result.groups.find((g) => g.id === "btc-bip49-0")).toMatchObject({
      status: "error",
      error: "Provider responded with HTTP 500",
    });
    expect(result.groups.find((g) => g.id === "btc-bip84-0")?.status).toBe("done");
    expect(result.chains.btc?.status).toBe("error");
    expect(result.chains.eth?.status).toBe("done");
    expect(result.chains.sol?.status).toBe("done");
  });

  it("scans only Bitcoin for Electrum seeds", async () => {
    const { clients } = fakeClients();
    const result = await scan(
      params({
        mnemonic: "bitter grass shiver impose acquire brush forget axis eager alone wine silver",
        bip39: false,
        electrum: "segwit",
      }),
      clients,
    );
    expect(result.groups.map((g) => g.id)).toEqual(["btc-electrum-segwit"]);
    expect(result.chains.eth).toMatchObject({ status: "skipped" });
    expect(result.chains.sol).toMatchObject({ status: "skipped" });
  });
});

describe("ethereum and solana scanning", () => {
  it("checks a fixed number of addresses per path", async () => {
    const eth0 = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
    const sol0 = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
    const { clients } = fakeClients({ eth: { [eth0]: 10n ** 18n }, sol: { [sol0]: 5n * 10n ** 9n } });
    const result = await scan(params({ chains: { btc: false, eth: true, sol: true } }), clients);

    const eth = result.groups.filter((g) => g.chain === "eth");
    expect(eth.map((g) => g.addresses.length)).toEqual([3, 3, 3]);
    expect(eth[0].addresses[0]).toMatchObject({ address: eth0, balance: 10n ** 18n, used: true });
    expect(eth[0].addresses[1]).toMatchObject({ balance: 0n, used: false, status: "done" });

    const sol = result.groups.filter((g) => g.chain === "sol");
    expect(sol.map((g) => g.addresses.length)).toEqual([3, 3, 1]);
    expect(sol[0].addresses[0]).toMatchObject({ address: sol0, balance: 5n * 10n ** 9n, used: true });

    expect(result.checked).toBe(16);
    expect(result.prices?.usd.btc).toBe(100_000);
    expect(result.chains.btc).toBeUndefined();
  });
});

describe("cancellation", () => {
  it("stops cleanly when aborted mid-scan", async () => {
    const controller = new AbortController();
    const { clients } = fakeClients();
    clients.btc = async (_address, signal) => {
      controller.abort();
      throw abortReason(signal);
    };
    const result = await scan(params(), clients, controller.signal);
    expect(result.status).toBe("stopped");
    expect(result.chains.btc?.status).toBe("stopped");
  });
});

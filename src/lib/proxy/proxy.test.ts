import { afterEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/config/providers";
import { ethCallsFor } from "@/lib/chains/ethereum";
import { ProviderPool } from "@/lib/net";
import { createRateLimiter, guard } from "./http";
import { forwardEthBatch, fromBlockbook, fromEsplora, lookupBtcAddress } from "./upstream";
import { isBtcAddress, parseEthBatch, parseSolRequest } from "./validate";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ETH = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const SOL = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
const asBatch = (calls: { method: string; params: unknown[] }[]) =>
  calls.map((call, id) => ({ jsonrpc: "2.0", id, ...call }));

describe("parseEthBatch", () => {
  it("accepts exactly the calls the app makes", () => {
    const calls = ethCallsFor(ETH);
    expect(parseEthBatch(asBatch(calls))).toEqual({ ids: [0, 1, 2, 3], calls });
  });

  it.each([
    ["another method", [{ id: 0, method: "eth_sendRawTransaction", params: ["0xdead", "latest"] }]],
    ["a call to another contract", [{ id: 0, method: "eth_call", params: [{ to: ETH, data: `0x70a08231${"0".repeat(64)}` }, "latest"] }]],
    ["another contract function", asBatch([{ method: "eth_call", params: [{ to: "0xdAC17F958D2ee523a2206206994597C13D831ec7", data: `0xa9059cbb${"0".repeat(64)}` }, "latest"] }])],
    ["a bad address", asBatch([{ method: "eth_getBalance", params: ["0x123", "latest"] }])],
    ["a historical block", asBatch([{ method: "eth_getBalance", params: [ETH, "0x1"] }])],
    ["extra params", asBatch([{ method: "eth_getBalance", params: [ETH, "latest", 1] }])],
    ["an empty batch", []],
    ["too many calls", asBatch(Array.from({ length: 101 }, () => ({ method: "eth_getBalance", params: [ETH, "latest"] })))],
    ["a single call", { id: 0, method: "eth_getBalance", params: [ETH, "latest"] }],
  ])("rejects %s", (_label, body) => {
    expect(parseEthBatch(body)).toBeNull();
  });
});

describe("parseSolRequest", () => {
  const request = (dataSlice: object, extra: object = {}) => ({
    jsonrpc: "2.0",
    id: 7,
    method: "getMultipleAccounts",
    params: [[SOL], { encoding: "base64", dataSlice, commitment: "confirmed", ...extra }],
  });

  it("accepts balance and token-amount lookups", () => {
    expect(parseSolRequest(request({ offset: 0, length: 0 }))).toEqual({
      id: 7,
      call: {
        method: "getMultipleAccounts",
        params: [[SOL], { encoding: "base64", dataSlice: { offset: 0, length: 0 }, commitment: "confirmed" }],
      },
    });
    expect(parseSolRequest(request({ offset: 64, length: 8 }))).not.toBeNull();
  });

  it("drops unexpected options", () => {
    const parsed = parseSolRequest(request({ offset: 0, length: 0 }, { minContextSlot: 1 }));
    expect(parsed?.call.params[1]).toEqual({ encoding: "base64", dataSlice: { offset: 0, length: 0 }, commitment: "confirmed" });
  });

  it("rejects anything else", () => {
    expect(parseSolRequest({ ...request({ offset: 0, length: 0 }), method: "getProgramAccounts" })).toBeNull();
    expect(parseSolRequest(request({ offset: 0, length: 165 }))).toBeNull();
    expect(parseSolRequest({ ...request({ offset: 0, length: 0 }), params: [["not-base58!"], {}] })).toBeNull();
    expect(
      parseSolRequest({ ...request({ offset: 0, length: 0 }), params: [Array(101).fill(SOL), { encoding: "base64", dataSlice: { offset: 0, length: 0 } }] }),
    ).toBeNull();
    expect(parseSolRequest({ ...request({ offset: 0, length: 0 }), params: [[SOL], { encoding: "jsonParsed" }] })).toBeNull();
  });
});

describe("isBtcAddress", () => {
  it.each([
    "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
    "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf",
    "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA",
  ])("accepts %s", (address) => expect(isBtcAddress(address)).toBe(true));

  it.each(["../../admin", "BC1QCR8TE4KR609GCAWUTMRZA0J4XV80JY8Z306FYU", "", "tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", "1Lq/../x"])(
    "rejects %j",
    (address) => expect(isBtcAddress(address)).toBe(false),
  );
});

describe("Bitcoin responses", () => {
  it("converts Blockbook to Esplora", () => {
    expect(
      fromBlockbook({ address: "x", balance: "150", totalReceived: "200", totalSent: "50", unconfirmedBalance: "-20", unconfirmedTxs: 1, txs: 3 }),
    ).toEqual({
      chain_stats: { funded_txo_sum: 200, spent_txo_sum: 50, tx_count: 3 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 20, tx_count: 1 },
    });
    expect(() => fromBlockbook({ error: "Invalid address" })).toThrow();
  });

  it("keeps only the Esplora fields the app reads", () => {
    const s = { funded_txo_count: 1, funded_txo_sum: 5, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 1 };
    expect(fromEsplora({ address: "x", chain_stats: s, mempool_stats: s })).toEqual({
      chain_stats: { funded_txo_sum: 5, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 5, spent_txo_sum: 0, tx_count: 1 },
    });
    expect(() => fromEsplora({})).toThrow();
  });
});

describe("upstream forwarding", () => {
  it("fails over from a rejected private key to the next provider", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("alchemy")) return new Response("", { status: 401 });
      const calls = JSON.parse(String(init.body)) as { id: number }[];
      return Response.json(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: "0x1" })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool<Provider>([
      { name: "Alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/SECRET" },
      { name: "public", url: "https://rpc.example" },
    ]);
    await expect(forwardEthBatch(pool, ethCallsFor(ETH))).resolves.toEqual(["0x1", "0x1", "0x1", "0x1"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://eth-mainnet.g.alchemy.com/v2/SECRET",
      "https://rpc.example",
    ]);
  });

  it("never puts provider URLs (and their keys) into errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const pool = new ProviderPool<Provider>([{ name: "Alchemy", url: "https://eth-mainnet.g.alchemy.com/v2/SECRET" }]);
    const error = await forwardEthBatch(pool, ethCallsFor(ETH)).catch((e: unknown) => e);
    expect(JSON.stringify(error)).not.toContain("SECRET");
    expect(String(error)).not.toContain("SECRET");
  });

  it("queries Blockbook with its API key header", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ totalReceived: "10", totalSent: "0", txs: 1, unconfirmedBalance: "0", unconfirmedTxs: 0 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool<Provider>([
      { name: "bb", url: "https://bb.example/api/v2", api: "blockbook", headers: { "api-key": "K" } },
    ]);
    const result = await lookupBtcAddress(pool, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(result.chain_stats.funded_txo_sum).toBe(10);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bb.example/api/v2/address/bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu?details=basic");
    expect(init.headers).toMatchObject({ "api-key": "K" });
  });
});

describe("request guard", () => {
  it("rate-limits per key and resets each minute", () => {
    let now = 0;
    const allow = createRateLimiter(2, () => now);
    expect([allow("a"), allow("a"), allow("a"), allow("b")]).toEqual([true, true, false, true]);
    now = 60_000;
    expect(allow("a")).toBe(true);
    expect(createRateLimiter(0)("a")).toBe(true);
  });

  it("blocks cross-site browser requests and limited clients", () => {
    const request = (headers: Record<string, string>) => new Request("https://app.example/api/rpc/eth", { headers });
    expect(guard(request({ "sec-fetch-site": "same-origin" }), () => true)).toBeNull();
    expect(guard(request({}), () => true)).toBeNull();
    expect(guard(request({ "sec-fetch-site": "cross-site" }), () => true)?.status).toBe(403);
    expect(guard(request({ "x-forwarded-for": "1.2.3.4" }), () => false)?.status).toBe(429);
  });
});

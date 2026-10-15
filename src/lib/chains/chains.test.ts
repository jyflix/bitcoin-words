import { base64 } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderPool, requestJson, rpcBatch } from "@/lib/net";
import { parseEsploraAddress } from "./bitcoin";
import { ETH_TOKENS, ethCallsFor, fetchEthBalances, parseEthResults } from "./ethereum";
import { readU64 } from "./solana";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsers", () => {
  it("parses Esplora address stats including mempool activity", () => {
    const info = parseEsploraAddress({
      chain_stats: { funded_txo_sum: 150_000, spent_txo_sum: 50_000, tx_count: 3 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 20_000, tx_count: 1 },
    });
    expect(info).toEqual({ balance: 80_000n, pending: -20_000n, txCount: 4 });
    expect(() => parseEsploraAddress({ error: "rate limited" })).toThrow();
  });

  it("builds ERC-20 balanceOf calls", () => {
    const calls = ethCallsFor("0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
    expect(calls.map((c) => c.method)).toEqual(["eth_getBalance", "eth_getTransactionCount", "eth_call", "eth_call"]);
    expect(calls[2].params[0]).toEqual({
      to: ETH_TOKENS[0].address,
      data: `0x70a08231${"0".repeat(24)}9858effd232b4033e47d90003d41ec34ecaeda94`,
    });
  });

  it("parses Ethereum batch results", () => {
    const [info] = parseEthResults(1, ["0xde0b6b3a7640000", "0x5", `0x${"0".repeat(56)}05f5e100`, "0x"]);
    expect(info.balance).toBe(10n ** 18n);
    expect(info.nonce).toBe(5);
    expect(info.tokens.map((t) => [t.symbol, t.amount])).toEqual([
      ["USDT", 100_000_000n],
      ["USDC", 0n],
    ]);
    expect(() => parseEthResults(1, [null, "0x0", "0x0", "0x0"])).toThrow();
  });

  it("reads SPL token amounts from account data", () => {
    const data = [base64.encode(Uint8Array.from([0x40, 0x42, 0x0f, 0, 0, 0, 0, 0])), "base64"];
    expect(readU64(data)).toBe(1_000_000n);
    expect(readU64(undefined)).toBe(0n);
  });
});

describe("network", () => {
  it("fails over to the next provider and remembers it", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://down") ? new Response("", { status: 503 }) : Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool(["https://down.example", "https://up.example"]);

    await expect(pool.run((url) => requestJson(`${url}/a`))).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://down.example/a",
      "https://down.example/a",
      "https://up.example/a",
    ]);

    await pool.run((url) => requestJson(`${url}/b`));
    expect(fetchMock).toHaveBeenLastCalledWith("https://up.example/b", expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("spreads requests round-robin and sidelines failing providers", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://b") ? new Response("", { status: 429 }) : Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool(["https://a.example", "https://b.example", "https://c.example"], "round-robin");
    const hosts = () => fetchMock.mock.calls.map(([url]) => new URL(url).host[0]).join("");

    await pool.run((url) => requestJson(url)); // a
    await pool.run((url) => requestJson(url)); // b (429, retried) → c
    expect(hosts()).toBe("abbc");
    await pool.run((url) => requestJson(url)); // c
    await pool.run((url) => requestJson(url)); // a — b is cooling down
    await pool.run((url) => requestJson(url)); // b is still last in line → c
    expect(hosts()).toBe("abbccac");
  });

  it("splits Ethereum batches when a provider rejects their size", async () => {
    const sizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const calls = JSON.parse(String(init.body)) as { id: number; method: string }[];
        sizes.push(calls.length);
        if (calls.length > 8) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch too large" } });
        return Response.json(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: c.method === "eth_getBalance" ? "0x1" : "0x0" })));
      }),
    );
    const addresses = Array.from({ length: 4 }, (_, i) => `0x${String(i).repeat(40)}`);
    const infos = await fetchEthBalances(new ProviderPool(["https://rpc.example"]), addresses);
    expect(infos.map((i) => i.balance)).toEqual([1n, 1n, 1n, 1n]);
    expect(sizes).toEqual([16, 16, 8, 8]);
  });

  it("fails over immediately when a provider hangs", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) =>
      url.includes("hung")
        ? new Promise<Response>((_, reject) =>
            init.signal!.addEventListener("abort", () => reject(init.signal!.reason)),
          )
        : Promise.resolve(Response.json({ ok: true })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool(["https://hung.example", "https://ok.example"]);
    await expect(pool.run((url) => requestJson(url, { timeoutMs: 30 }))).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["https://hung.example", "https://ok.example"]);
  });

  it("does not retry client errors on the same provider", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const pool = new ProviderPool(["https://a.example", "https://b.example"]);
    await expect(pool.run((url) => requestJson(url))).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reorders JSON-RPC batch results by id and surfaces errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { jsonrpc: "2.0", id: 1, result: "second" },
          { jsonrpc: "2.0", id: 0, result: "first" },
        ]),
      ),
    );
    const calls = [
      { method: "a", params: [] },
      { method: "b", params: [] },
    ];
    await expect(rpcBatch("https://rpc.example", calls)).resolves.toEqual(["first", "second"]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([{ id: 0, error: { code: -32005, message: "limit exceeded" } }])),
    );
    await expect(rpcBatch("https://rpc.example", calls)).rejects.toThrow("limit exceeded");
  });
});

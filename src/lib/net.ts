export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(status === 429 ? "Rate limited by provider" : `Provider responded with HTTP ${status}`);
    this.name = "HttpError";
  }
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Network error — the provider could not be reached";
  if (error instanceof DOMException && error.name === "TimeoutError") return "The provider timed out";
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** fetch() + JSON with a timeout, no cookies and no referrer. */
export async function requestJson<T>(
  url: string,
  { method = "GET", body, signal, timeoutMs = 10_000 }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
    timeoutMs,
  );
  const forward = () => controller.abort(signal?.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });

  try {
    const response = await fetch(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new HttpError(response.status, url);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

const isTimeout = (error: unknown) => error instanceof DOMException && error.name === "TimeoutError";

function isTransient(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 429 || error.status === 408 || error.status >= 500;
  }
  // Network failures, timeouts, malformed or partial responses.
  return true;
}

/** Worth one more attempt on the same provider (a hung provider is not). */
const retrySameProvider = (error: unknown) => isTransient(error) && !isTimeout(error);

/** The provider itself is unhealthy (as opposed to rejecting one request). */
function isProviderFailure(error: unknown): boolean {
  return isTransient(error) || (error instanceof HttpError && (error.status === 401 || error.status === 403));
}

const COOLDOWN_MS = 30_000;

/**
 * Interchangeable endpoints. Each task is retried once on transient errors,
 * then handed to the next endpoint. Endpoints that keep failing are moved to
 * the back of the line for a while.
 *
 * "failover" sticks with the last healthy endpoint; "round-robin" spreads
 * consecutive tasks over all endpoints to stay under per-provider rate limits.
 */
export class ProviderPool {
  private preferred = 0;
  private cursor = 0;
  private readonly cooldownUntil: number[];

  constructor(
    readonly urls: readonly string[],
    private readonly strategy: "failover" | "round-robin" = "failover",
  ) {
    this.cooldownUntil = urls.map(() => 0);
  }

  private order(): number[] {
    const n = this.urls.length;
    const start = this.strategy === "round-robin" ? this.cursor++ % n : this.preferred;
    const order = Array.from({ length: n }, (_, i) => (start + i) % n);
    const now = Date.now();
    return [
      ...order.filter((i) => this.cooldownUntil[i] <= now),
      ...order.filter((i) => this.cooldownUntil[i] > now),
    ];
  }

  async run<T>(task: (url: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown = new Error("No endpoints configured");
    for (const index of this.order()) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal?.aborted) throw abortReason(signal);
        try {
          const result = await task(this.urls[index]);
          this.preferred = index;
          this.cooldownUntil[index] = 0;
          return result;
        } catch (error) {
          if (signal?.aborted) throw abortReason(signal);
          lastError = error;
          if (attempt === 0 && retrySameProvider(error)) {
            const rateLimited = error instanceof HttpError && error.status === 429;
            await sleep(rateLimited ? 1500 : 400, signal);
            continue;
          }
          if (isProviderFailure(error)) this.cooldownUntil[index] = Date.now() + COOLDOWN_MS;
          break;
        }
      }
    }
    throw lastError;
  }
}

/** Runs at most `concurrency` tasks at once. */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (!run) return;
    active++;
    run();
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── JSON-RPC ───────────────────────────────────────────────────────────────

export interface RpcCall {
  method: string;
  params: unknown[];
}

interface RpcResponse {
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export async function rpcCall<T>(url: string, call: RpcCall, signal?: AbortSignal): Promise<T> {
  const response = await requestJson<RpcResponse>(url, {
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, ...call },
    signal,
  });
  if (response?.error) throw new RpcError(response.error.message ?? "RPC error", response.error.code);
  if (response?.result === undefined) throw new RpcError("Empty RPC response");
  return response.result as T;
}

/** Sends calls as one JSON-RPC batch; results come back in call order. */
export async function rpcBatch(url: string, calls: RpcCall[], signal?: AbortSignal): Promise<unknown[]> {
  const response = await requestJson<RpcResponse[] | RpcResponse>(url, {
    method: "POST",
    body: calls.map((call, id) => ({ jsonrpc: "2.0", id, ...call })),
    signal,
  });
  if (!Array.isArray(response)) {
    throw new RpcError(response?.error?.message ?? "Provider does not support batch requests");
  }
  const results = new Array<unknown>(calls.length);
  const seen = new Set<number>();
  for (const item of response) {
    if (typeof item?.id !== "number" || item.id < 0 || item.id >= calls.length) continue;
    if (item.error) throw new RpcError(item.error.message ?? "RPC error", item.error.code);
    results[item.id] = item.result;
    seen.add(item.id);
  }
  if (seen.size !== calls.length) throw new RpcError("Incomplete batch response");
  return results;
}

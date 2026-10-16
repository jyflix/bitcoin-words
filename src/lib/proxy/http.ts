/** Small helpers shared by the /api proxy routes. */

const NO_STORE = { "cache-control": "no-store" };

export const ok = (body: unknown) => Response.json(body, { headers: NO_STORE });

export const problem = (status: number, message: string, headers: Record<string, string> = {}) =>
  Response.json({ error: message }, { status, headers: { ...NO_STORE, ...headers } });

/** Fixed one-minute window per key. Per server instance, so a best-effort guard. */
export function createRateLimiter(limitPerMinute: number, now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    if (limitPerMinute <= 0) return true;
    const time = now();
    const current = windows.get(key);
    if (!current || current.resetAt <= time) {
      if (windows.size >= 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
      }
      windows.set(key, { count: 1, resetAt: time + 60_000 });
      return true;
    }
    current.count++;
    return current.count <= limitPerMinute;
  };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Rejects cross-site browser requests and clients over the rate limit. */
export function guard(request: Request, allow: (key: string) => boolean): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return problem(403, "Cross-site requests are not allowed");
  }
  if (!allow(clientIp(request))) {
    return problem(429, "Too many requests — try again in a minute", { "retry-after": "60" });
  }
  return null;
}

const MAX_BODY_BYTES = 64 * 1024;

/** Parses a JSON body, or returns an error response. */
export async function readJson(request: Request): Promise<{ body: unknown } | { error: Response }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: problem(413, "Request too large") };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: problem(400, "Invalid JSON") };
  }
}

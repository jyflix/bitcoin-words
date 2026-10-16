import { errorMessage } from "@/lib/net";
import { guard, ok, problem, readJson } from "@/lib/proxy/http";
import { forwardEthBatch } from "@/lib/proxy/upstream";
import { parseEthBatch } from "@/lib/proxy/validate";
import { allowRequest, upstream } from "@/lib/server/providers";

/** Ethereum JSON-RPC proxy: forwards balance lookups to private providers, adding their keys. */
export async function POST(request: Request) {
  const pool = upstream.eth;
  if (!pool) return problem(404, "No private Ethereum provider is configured");
  const rejected = guard(request, allowRequest);
  if (rejected) return rejected;

  const parsed = await readJson(request);
  if ("error" in parsed) return parsed.error;
  const batch = parseEthBatch(parsed.body);
  if (!batch) return problem(400, "Unsupported request");

  try {
    const results = await forwardEthBatch(pool, batch.calls, request.signal);
    return ok(results.map((result, i) => ({ jsonrpc: "2.0", id: batch.ids[i], result })));
  } catch (error) {
    if (!request.signal.aborted) console.error(`[api/rpc/eth] ${errorMessage(error)}`);
    return problem(502, "Ethereum providers are unavailable");
  }
}

import { errorMessage } from "@/lib/net";
import { guard, ok, problem, readJson } from "@/lib/proxy/http";
import { forwardSolCall } from "@/lib/proxy/upstream";
import { parseSolRequest } from "@/lib/proxy/validate";
import { allowRequest, upstream } from "@/lib/server/providers";

/** Solana JSON-RPC proxy: forwards getMultipleAccounts to private providers, adding their keys. */
export async function POST(request: Request) {
  const pool = upstream.sol;
  if (!pool) return problem(404, "No private Solana provider is configured");
  const rejected = guard(request, allowRequest);
  if (rejected) return rejected;

  const parsed = await readJson(request);
  if ("error" in parsed) return parsed.error;
  const rpc = parseSolRequest(parsed.body);
  if (!rpc) return problem(400, "Unsupported request");

  try {
    const result = await forwardSolCall(pool, rpc.call, request.signal);
    return ok({ jsonrpc: "2.0", id: rpc.id, result });
  } catch (error) {
    if (!request.signal.aborted) console.error(`[api/rpc/sol] ${errorMessage(error)}`);
    return problem(502, "Solana providers are unavailable");
  }
}

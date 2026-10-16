import { errorMessage } from "@/lib/net";
import { guard, ok, problem } from "@/lib/proxy/http";
import { lookupBtcAddress } from "@/lib/proxy/upstream";
import { isBtcAddress } from "@/lib/proxy/validate";
import { allowRequest, upstream } from "@/lib/server/providers";

/** Bitcoin address lookup via private Esplora / Blockbook providers, answered in Esplora format. */
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const pool = upstream.btc;
  if (!pool) return problem(404, "No private Bitcoin provider is configured");
  const rejected = guard(request, allowRequest);
  if (rejected) return rejected;
  if (!isBtcAddress(address)) return problem(400, "Invalid Bitcoin address");

  try {
    return ok(await lookupBtcAddress(pool, address, request.signal));
  } catch (error) {
    if (!request.signal.aborted) console.error(`[api/btc] ${errorMessage(error)}`);
    return problem(502, "Bitcoin providers are unavailable");
  }
}

import "server-only";
import { apiRateLimit, serverProviders, type Chain } from "@/config/providers";
import { ProviderPool } from "@/lib/net";
import { createRateLimiter } from "@/lib/proxy/http";
import type { UpstreamPool } from "@/lib/proxy/upstream";

// Reads secrets from the environment — server only.
const providers = serverProviders(process.env);

/** Upstream pools for the /api routes; null when a chain has no private provider. */
export const upstream: Record<Chain, UpstreamPool | null> = {
  btc: providers.btc.length > 0 ? new ProviderPool(providers.btc) : null,
  eth: providers.eth.length > 0 ? new ProviderPool(providers.eth) : null,
  sol: providers.sol.length > 0 ? new ProviderPool(providers.sol) : null,
};

export const allowRequest = createRateLimiter(apiRateLimit(process.env));

import type { Provider } from "../skill/types.ts";

// Provider endpoints. In USE_PHAROS mode these are the live x402 provider's real
// URLs; offline mode ignores them (the mock rail calls the handler directly).
const BASE = process.env.PROVIDER_BASE ?? "http://localhost:4021";

// The demo "world": a seeded set of providers, their on-chain reputation, and
// what each one actually returns when paid. This stands in for a live Pharos
// provider registry + ERC-8004 reputation registry so the demo runs offline.
// Flip USE_PHAROS=1 to swap these seeds for real testnet reads/payments.

export interface SeededProvider extends Provider {
  /** What this provider returns after payment. The scam ones lie. */
  handler: () => unknown;
}

// A legit gold-price feed: good reputation, returns valid data.
const trustFeed: SeededProvider = {
  id: "trustfeed",
  name: "TrustFeed Oracle",
  endpoint: `${BASE}/gold`,
  priceUSDC: 0.05,
  agentAddress: "0x1111111111111111111111111111111111111111",
  handler: () => ({ asset: "XAU", priceUSD: 2387.41, ts: Date.now() }),
};

// A cheap scammer: terrible reputation, takes the money, returns junk.
const cheapScam: SeededProvider = {
  id: "cheapscam",
  name: "CheapData (unrated)",
  endpoint: `${BASE}/cheap-gold`,
  priceUSDC: 0.01,
  agentAddress: "0x2222222222222222222222222222222222222222",
  handler: () => ({ lol: "gimme more money" }), // missing required fields
};

// A second honest provider for non-gold queries.
const fxFeed: SeededProvider = {
  id: "fxfeed",
  name: "FXFeed",
  endpoint: `${BASE}/fx`,
  priceUSDC: 0.03,
  agentAddress: "0x3333333333333333333333333333333333333333",
  handler: () => ({ pair: "EUR/USD", rate: 1.0842, ts: Date.now() }),
};

export const WORLD: SeededProvider[] = [trustFeed, cheapScam, fxFeed];

// Seeded ERC-8004-style reputation: address -> score in [0,1].
export const REPUTATION: Record<string, number> = {
  [trustFeed.agentAddress]: 0.92,
  [cheapScam.agentAddress]: 0.18,
  [fxFeed.agentAddress]: 0.74,
};

/** Naive keyword discovery used by the in-memory registry. */
export function discoverFromWorld(query: string): SeededProvider[] {
  const q = query.toLowerCase();
  const hits = WORLD.filter((p) => {
    if (q.includes("gold") || q.includes("xau")) return p.id === "trustfeed" || p.id === "cheapscam";
    if (q.includes("fx") || q.includes("eur") || q.includes("usd")) return p.id === "fxfeed";
    return false;
  });
  // Default: if nothing matched, offer the gold providers (demo convenience).
  return hits.length > 0 ? hits : [trustFeed, cheapScam];
}

export function handlerFor(providerId: string): (() => unknown) | undefined {
  return WORLD.find((p) => p.id === providerId)?.handler;
}

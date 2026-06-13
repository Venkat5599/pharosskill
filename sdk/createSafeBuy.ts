// createSafeBuy — convenience factory that wires the real Pharos Atlantic rail:
//   x402 EIP-3009 payment (pharosX402Rail), ERC-8004 reputation reads, a
//   provider registry, and the deterministic schema verifier.
// The core safeBuy skill stays framework-free; this just assembles the adapters
// so an SDK consumer (or the MCP server) gets a one-call real purchaser.

import { safeBuy } from "../src/skill/safeBuy.ts";
import { schemaVerifier } from "../src/skill/verify.ts";
import { erc8004Reputation, inMemoryReputation } from "../src/adapters/reputation.ts";
import { pharosX402Rail } from "../src/adapters/pharosX402.ts";
import type {
  Provider,
  ProviderRegistry,
  ReputationOracle,
  SafeBuyDeps,
  SafeBuyRequest,
  SafeBuyResult,
  StepReporter,
} from "../src/skill/types.ts";

export interface SafeBuyConfig {
  /** Funded payer wallet (holds SafeUSD + PHRS gas). Signs the x402 authorization. */
  payerPrivateKey: `0x${string}`;
  /** Providers offering x402-protected endpoints. Real endpoints = real settlement. */
  providers: Provider[];
  /** Pharos RPC (defaults to Atlantic). */
  rpcUrl?: string;
  /** ERC-8004 ReputationRegistry. If unset, falls back to seeded scores. */
  reputationRegistry?: `0x${string}`;
  /** SafeBuyBond. If set, a scam delivery triggers a real on-chain slash refund. */
  bondContract?: `0x${string}`;
}

export interface SafeBuyClient {
  deps: SafeBuyDeps;
  /** Run the full trust loop: discover → gate → select → pay → verify → refund/deliver. */
  purchase(req: SafeBuyRequest, onStep?: StepReporter): Promise<SafeBuyResult>;
  /** Discover + reputation-gate + select WITHOUT paying. Useful for a preview/quote. */
  quote(query: string, maxPriceUSDC: number, minReputation?: number): Promise<{
    providers: { name: string; agentAddress: string; priceUSDC: number; reputation: number; eligible: boolean }[];
  }>;
}

export function createSafeBuy(cfg: SafeBuyConfig): SafeBuyClient {
  const registry: ProviderRegistry = {
    async discover(query: string): Promise<Provider[]> {
      const q = query.toLowerCase().trim();
      const hits = cfg.providers.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
      return hits.length ? hits : cfg.providers;
    },
  };

  const reputation: ReputationOracle =
    cfg.reputationRegistry && cfg.rpcUrl
      ? erc8004Reputation({ rpcUrl: cfg.rpcUrl, registryAddress: cfg.reputationRegistry })
      : inMemoryReputation;

  const deps: SafeBuyDeps = {
    registry,
    reputation,
    payment: pharosX402Rail({ payerPrivateKey: cfg.payerPrivateKey, bondContract: cfg.bondContract || undefined }),
    verifier: schemaVerifier,
  };

  return {
    deps,
    purchase: (req, onStep) => safeBuy(req, deps, onStep),
    async quote(query, maxPriceUSDC, minReputation = 0.5) {
      const found = await registry.discover(query);
      const providers = await Promise.all(
        found.map(async (p) => {
          const rep = await reputation.scoreOf(p.agentAddress);
          return { name: p.name, agentAddress: p.agentAddress, priceUSDC: p.priceUSDC, reputation: rep, eligible: rep >= minReputation && p.priceUSDC <= maxPriceUSDC };
        }),
      );
      return { providers };
    },
  };
}

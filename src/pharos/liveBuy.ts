import { safeBuy } from "../skill/safeBuy.ts";
import { schemaVerifier } from "../skill/verify.ts";
import { inMemoryRegistry } from "../adapters/registry.ts";
import { inMemoryReputation, erc8004Reputation } from "../adapters/reputation.ts";
import { pharosX402Rail } from "../adapters/pharosX402.ts";
import { EXPLORER_TX, REPUTATION_REGISTRY, BOND_CONTRACT, PHAROS_RPC } from "./config.ts";
import type { JsonSchema, ReputationOracle, SafeBuyDeps, SafeBuyRequest } from "../skill/types.ts";

// Full LIVE demo on Pharos Atlantic: real x402 EIP-3009 settlement, real ERC-8004
// reputation reads, and a real on-chain slash-refund. Needs a running provider +
// facilitator and PAYER_PRIVATE_KEY. Set REPUTATION_REGISTRY + BOND_CONTRACT for
// the on-chain trust infra (falls back to seeded oracle / throwing refund if not).

const payerPrivateKey = process.env.PAYER_PRIVATE_KEY as `0x${string}`;

const reputation: ReputationOracle = REPUTATION_REGISTRY
  ? erc8004Reputation({ rpcUrl: PHAROS_RPC, registryAddress: REPUTATION_REGISTRY })
  : inMemoryReputation;

const deps: SafeBuyDeps = {
  registry: inMemoryRegistry,
  reputation,
  payment: pharosX402Rail({ payerPrivateKey, bondContract: BOND_CONTRACT || undefined }),
  verifier: schemaVerifier,
};

const goldSchema: JsonSchema = {
  type: "object",
  required: ["asset", "priceUSD"],
  properties: { asset: { type: "string" }, priceUSD: { type: "number" } },
};

async function run(label: string, req: SafeBuyRequest): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const r = await safeBuy(req, deps, (s) =>
    console.log(`  ${s.ok === false ? "❌" : "•"} [${s.kind}] ${s.detail}${s.txHash ? `\n     ↳ ${EXPLORER_TX}${s.txHash}` : ""}`),
  );
  if (r.ok) console.log(`  ✅ bought from ${r.provider?.name} — ${EXPLORER_TX}${r.txHash}`);
  else if (r.refundTxHash) console.log(`  🛡️ scammed then refunded on-chain — ${EXPLORER_TX}${r.refundTxHash}`);
  else console.log(`  ⛔ ${r.reason}`);
}

console.log(`reputation source: ${REPUTATION_REGISTRY ? "ERC-8004 registry " + REPUTATION_REGISTRY : "seeded (offline)"}`);
console.log(`refund source:     ${BOND_CONTRACT ? "SafeBuyBond " + BOND_CONTRACT : "n/a"}`);

await run("HONEST BUY (reputation-gated)", {
  query: "current gold price",
  schema: goldSchema,
  maxPriceUSDC: 0.1,
  minReputation: 0.5,
});

await run("FORCED SCAM BUY (pay -> bad delivery -> on-chain refund)", {
  query: "gold price, cheapest, ignore the rating",
  schema: goldSchema,
  maxPriceUSDC: 0.1,
  minReputation: 0.5,
  selectBy: "price",
  allowUntrusted: true,
});

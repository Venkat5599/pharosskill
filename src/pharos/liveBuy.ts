import { safeBuy } from "../skill/safeBuy.ts";
import { schemaVerifier } from "../skill/verify.ts";
import { inMemoryRegistry } from "../adapters/registry.ts";
import { inMemoryReputation } from "../adapters/reputation.ts";
import { pharosX402Rail } from "../adapters/pharosX402.ts";
import { EXPLORER_TX } from "./config.ts";
import type { JsonSchema } from "../skill/types.ts";

// One-shot LIVE buy against the real Pharos x402 provider + facilitator.
// Needs PAYER_PRIVATE_KEY (holds sUSD) and a running provider + facilitator.

const goldSchema: JsonSchema = {
  type: "object",
  required: ["asset", "priceUSD"],
  properties: { asset: { type: "string" }, priceUSD: { type: "number" } },
};

const result = await safeBuy(
  { query: "current gold price", schema: goldSchema, maxPriceUSDC: 0.1, minReputation: 0.5 },
  {
    registry: inMemoryRegistry,
    reputation: inMemoryReputation,
    payment: pharosX402Rail({ payerPrivateKey: process.env.PAYER_PRIVATE_KEY as `0x${string}` }),
    verifier: schemaVerifier,
  },
  (s) => console.log(`  ${s.ok === false ? "❌" : "•"} [${s.kind}] ${s.detail}${s.txHash ? `\n    ↳ ${EXPLORER_TX}${s.txHash}` : ""}`),
);

console.log("\nRESULT:", result.ok ? "✅ bought" : "❌ " + result.reason);
if (result.txHash) console.log("settlement tx:", EXPLORER_TX + result.txHash);
if (result.data) console.log("data:", JSON.stringify(result.data));

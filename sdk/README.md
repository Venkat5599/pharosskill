# @cashier/safebuy-sdk

The safeBuy trust loop as a library: **reputation-gated, x402-paid,
delivery-verified, auto-refunding** purchases for autonomous agents on Pharos.

One call does discover → reputation-gate → select → pay (x402 EIP-3009) → verify
delivery → refund-or-deliver. The core is framework-free (zero chain/LLM
imports); the Pharos-ness lives in injectable adapters.

## High-level (real Pharos Atlantic rail)
```ts
import { createSafeBuy } from "@cashier/safebuy-sdk";

const cashier = createSafeBuy({
  payerPrivateKey: process.env.PAYER_PRIVATE_KEY as `0x${string}`, // SafeUSD + PHRS gas
  providers: [
    { id: "trustfeed", name: "TrustFeed", endpoint: "https://provider/feed", priceUSDC: 0.05, agentAddress: "0x..." },
  ],
  rpcUrl: "https://atlantic.dplabs-internal.com/",
  reputationRegistry: "0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b", // ERC-8004 (optional)
  bondContract: "0x3316cbc1642fc810e610ce6d2479029821a7f1f7",      // slash refund (optional)
});

const result = await cashier.purchase({
  query: "current gold price",
  schema: { type: "object", required: ["asset", "priceUSD"], properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
  maxPriceUSDC: 0.1,
  minReputation: 0.5,
});
// result.ok, result.txHash, result.data | result.refundTxHash, result.steps[]

const preview = await cashier.quote("gold", 0.1); // dry run, no payment
```

## Low-level (any chain, any agent)
```ts
import { safeBuy } from "@cashier/safebuy-sdk";
import type { SafeBuyDeps } from "@cashier/safebuy-sdk";

const deps: SafeBuyDeps = { registry, reputation, payment, verifier }; // inject your own
await safeBuy(req, deps, (step) => console.log(step.kind, step.detail));
```

## Why
No middleman, no human arbiter: a provider only keeps the money if the delivered
data matches the buyer's declared JSON schema. Bad delivery → on-chain bond
slash → buyer made whole. Trust is enforced by code, not a third party.

> Bun-native (`.ts` exports) in this monorepo. Also driven by the MCP server in `../mcp`.

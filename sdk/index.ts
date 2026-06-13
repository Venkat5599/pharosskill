// @cashier/safebuy-sdk — public surface.
//
// Two ways to use it:
//   1. High-level: createSafeBuy({ payerPrivateKey, providers, ... }) -> real
//      Pharos Atlantic rail (x402 EIP-3009 + ERC-8004 + bond-slash refund).
//   2. Low-level: import { safeBuy } and inject your own SafeBuyDeps (any chain,
//      any agent, any model — the core has zero chain/LLM imports).

export { safeBuy } from "../src/skill/safeBuy.ts";
export { schemaVerifier } from "../src/skill/verify.ts";
export { pharosX402Rail } from "../src/adapters/pharosX402.ts";
export { erc8004Reputation, inMemoryReputation } from "../src/adapters/reputation.ts";
export { createSafeBuy } from "./createSafeBuy.ts";
export type { SafeBuyConfig, SafeBuyClient } from "./createSafeBuy.ts";

export type {
  JsonSchema,
  Provider,
  ProviderRegistry,
  ReputationOracle,
  PaymentRail,
  PaymentReceipt,
  Verifier,
  SafeBuyDeps,
  SafeBuyRequest,
  SafeBuyResult,
  SafeBuyStep,
  StepKind,
  StepReporter,
} from "../src/skill/types.ts";

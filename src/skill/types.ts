// safeBuy — type contract.
//
// The core skill depends ONLY on these interfaces, never on Pharos, viem, or any
// concrete LLM/agent. That is what makes it an independent, reusable Skill: swap
// the adapters and the same skill runs on any chain, any agent, any model.

/** A minimal JSON-schema subset used to verify a provider's delivery. */
export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

/** A seller an agent can buy from, discovered via a registry. */
export interface Provider {
  id: string;
  name: string;
  /** x402-protected endpoint that returns the data once paid. */
  endpoint: string;
  /** Advertised price in USDC. */
  priceUSDC: number;
  /** On-chain address used to look up reputation (e.g. ERC-8004 identity). */
  agentAddress: string;
}

/** Reputation source. Returns a normalized score in [0,1]. */
export interface ReputationOracle {
  scoreOf(agentAddress: string): Promise<number>;
}

/** Discovers providers that can satisfy a query. */
export interface ProviderRegistry {
  discover(query: string): Promise<Provider[]>;
}

/** A settled payment plus whatever the provider returned. */
export interface PaymentReceipt {
  txHash: string;
  paidUSDC: number;
  /** Raw body the provider returned after payment. */
  response: unknown;
  /** Provider's on-chain identity — used to target its bond on refund. */
  providerAgent?: string;
}

/** Pays a provider over x402 (or any rail) and optionally refunds. */
export interface PaymentRail {
  pay(provider: Provider, maxPriceUSDC: number): Promise<PaymentReceipt>;
  /** Reclaim funds when delivery fails verification. Optional per rail. */
  refund(receipt: PaymentReceipt): Promise<{ txHash: string }>;
}

/** Checks a provider response against the buyer's declared schema. */
export interface Verifier {
  verify(response: unknown, schema: JsonSchema): { ok: boolean; reason?: string };
}

export interface SafeBuyDeps {
  registry: ProviderRegistry;
  reputation: ReputationOracle;
  payment: PaymentRail;
  verifier: Verifier;
}

export interface SafeBuyRequest {
  /** What the agent wants to buy, in natural language or a provider tag. */
  query: string;
  /** Shape the delivered data MUST match, or the purchase is rejected + refunded. */
  schema: JsonSchema;
  /** Hard ceiling the agent will pay, in USDC. */
  maxPriceUSDC: number;
  /** Minimum reputation a provider needs to be eligible. Default 0.5. */
  minReputation?: number;
  /** Rank eligible providers by trust (default) or by lowest price. */
  selectBy?: "trust" | "price";
  /** Escape hatch: pay a low-rep provider anyway (logged loudly). Default false. */
  allowUntrusted?: boolean;
}

export type StepKind =
  | "discover"
  | "reputation"
  | "select"
  | "pay"
  | "verify"
  | "refund"
  | "deliver"
  | "abort";

export interface SafeBuyStep {
  kind: StepKind;
  detail: string;
  ok?: boolean;
  txHash?: string;
}

export interface SafeBuyResult {
  ok: boolean;
  data?: unknown;
  provider?: Provider;
  paidUSDC?: number;
  txHash?: string;
  refundTxHash?: string;
  steps: SafeBuyStep[];
  reason?: string;
}

/** Optional live callback so an agent can narrate each step in a chat UI. */
export type StepReporter = (step: SafeBuyStep) => void;

# safeBuy

**Reputation-gated, x402-paid, delivery-verified, auto-refunding purchase for autonomous agents.**

`safeBuy` is the trust layer for agent commerce. It lets an agent buy a service/data
on-chain and **refuses to get scammed**: it checks the seller's reputation before
paying, pays over x402, verifies the delivered data against a declared schema, and
**claws the payment back** if the seller fails to deliver.

> x402 lets agents *pay*. ERC-8004 lets agents *be known*. Nothing lets an agent
> **buy safely**. `safeBuy` is the cashier for the agent economy — it checks the
> receipt before it pays.

---

## Why it exists

In 2026 the agent payment stack settled on two primitives — **x402** (payment) and
**ERC-8004** (identity/reputation) — but the layer in between is missing: an agent
that *autonomously spends money* has no built-in protection against a provider that
takes payment and returns junk. x402 settlements are final; there is no refund, no
dispute, no delivery guarantee. `safeBuy` closes that gap as a single reusable call.

The whole loop:

```
discover → reputation-gate → select → pay (x402) → verify delivery → refund-or-deliver
```

## Independence (Skill contract)

The skill core (`src/skill/`) depends **only** on interfaces — never on Pharos, a
chain client, or any LLM/agent. Swap the injected adapters and the same skill runs
on any chain, driven by any agent or model. Pharos-specific behavior lives entirely
in the adapters.

```ts
import { safeBuy } from "./src/skill/safeBuy.ts";

const result = await safeBuy(
  {
    query: "current gold price",
    schema: { type: "object", required: ["asset", "priceUSD"],
              properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
    maxPriceUSDC: 0.1,
    minReputation: 0.5,        // refuse providers below this trust
  },
  { registry, reputation, payment, verifier }, // adapters (see below)
  (step) => console.log(step),                 // optional live narration
);
```

### Input — `SafeBuyRequest`
| field | type | default | meaning |
|---|---|---|---|
| `query` | string | — | what to buy |
| `schema` | JsonSchema | — | shape the delivery MUST match, or refund |
| `maxPriceUSDC` | number | — | hard spend ceiling |
| `minReputation` | number | 0.5 | minimum provider trust [0,1] |
| `selectBy` | `"trust"｜"price"` | trust | rank eligible providers |
| `allowUntrusted` | boolean | false | explicit override of the trust gate |

### Output — `SafeBuyResult`
`{ ok, data?, provider?, paidUSDC?, txHash?, refundTxHash?, steps[], reason? }`
— `steps[]` is a full, narratable audit trail (discover/reputation/select/pay/verify/refund/deliver).

### Adapters (injected `SafeBuyDeps`)
| adapter | interface | offline demo | Pharos |
|---|---|---|---|
| `registry` | `ProviderRegistry` | in-memory seed | on-chain provider directory |
| `reputation` | `ReputationOracle` | seeded scores | **ERC-8004** Reputation Registry read (`erc8004Reputation`) |
| `payment` | `PaymentRail` | simulated | **x402** on Pharos (`pharosX402Rail`) |
| `verifier` | `Verifier` | `schemaVerifier` | same (deterministic, chain-agnostic) |

## Pharos wiring

Atlantic testnet (`pharosX402Rail`, `erc8004Reputation`):
- chainId `688689` (`eip155:688689`)
- RPC `https://atlantic.dplabs-internal.com/`
- test USDC `0xE0BE08c77f415F577A1B3A9aD7a1Df1479564ec8`
- x402 packages `@x402/core` · `@x402/evm` · `@x402/fetch`

## Run

```bash
bun install
bun run demo            # interactive chat (Cashier agent)
bun run src/agent/cashier.ts --script   # scripted demo (happy path + scam→refund)
```

Scripted demo shows both branches:
1. *"get me the gold price"* → picks the trusted feed, pays, verifies, delivers.
2. *"buy the cheapest, ignore the rating"* → forced override buys the scammer →
   junk delivery → **schema check fails → auto-refund. No loss.**

## Demo agent

`Cashier` (`src/agent/cashier.ts`) is a thin chat wrapper: it turns a message into a
`SafeBuyRequest`, calls `safeBuy`, and narrates each step with clickable tx links.
The skill knows nothing about Cashier — that is the Skill→Agent cascade.

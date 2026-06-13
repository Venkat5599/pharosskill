---
name: safebuy
description: Buy data or services safely between AI agents on Pharos — reputation-gated, x402-paid, delivery-verified, and auto-refunded. Use whenever an agent must purchase, buy, pay for, or fetch paid data/services from another agent or provider and must not get scammed. Triggers on: buy, purchase, pay a provider, get the price/quote of, reputation-gated purchase, refund a bad delivery, safe agent commerce, x402 buy.
---

# safeBuy — the trust Skill for agent commerce

safeBuy gives an AI agent ONE call that runs the whole trust loop a buyer needs:

```
discover → reputation-gate → select → pay (x402 EIP-3009) → verify delivery → refund-or-deliver
```

A provider only keeps the money if what it delivers matches the buyer's declared
JSON schema. Below the on-chain reputation floor? Excluded (unless the buyer
explicitly waives it). Bad delivery? The provider's bond is slashed on-chain and
the buyer is made whole — **no middleman, no human arbiter** (V2 slashing is
verified entirely on-chain from the provider's own signed delivery).

Built for the Pharos AI Agent economy: real x402 settlement, ERC-8004-style
reputation, EIP-3009 gasless payment — live on Pharos Atlantic (chain `688689`).

## Prerequisites

- `bun` (https://bun.sh) and this repo: `bun install`
- A funded payer key (SafeUSD for purchases) and a facilitator key (PHRS gas).
  SafeUSD has an open `mint()`; PHRS gas from the Atlantic faucet.
- Env: `PAYER_PRIVATE_KEY`, `FACILITATOR_PRIVATE_KEY`, `PHAROS_RPC` (defaults to
  Atlantic), optional `REPUTATION_REGISTRY`, `BOND_CONTRACT`.
- The Skill Engine never auto-reads this file — pass it explicitly, then route
  the user's intent through the Capability Index below.

## Capability Index

| User intent | Tool / method | Reference |
|---|---|---|
| "Buy / purchase / fetch paid data safely", "get me the gold price from a trusted seller" | `bun run src/pharos/liveBuy.ts` (safeBuy trust loop) | → `references/safebuy.md#buy-data-safely-full-trust-loop` |
| "Buy the cheapest, ignore the rating" (waive the trust gate) | `liveBuy.ts` with `allowUntrusted` | → `references/safebuy.md#buy-with-the-trust-gate-waived` |
| "Check an agent's on-chain reputation" | `cast call` ReputationRegistry `scoreOf` | → `references/safebuy.md#check-on-chain-reputation` |
| "Deploy the EIP-3009 settlement token (SafeUSD)" | `bun run src/pharos/deployToken.ts` | → `references/safebuy.md#deploy-safeusd-settlement-token` |
| "Deploy the trust infra (reputation registry + bond)" | `bun run src/pharos/deployInfra.ts` | → `references/safebuy.md#deploy-trust-infra-reputation--bond` |
| "Run the x402 provider + facilitator" | `bun run provider` / `bun run facilitator` | → `references/safebuy.md#run-the-x402-provider--facilitator` |
| "Refund a scam delivery trustlessly (no arbiter)" | `SafeBuyBondV2.slashWithProof` | → `references/safebuy.md#trustless-refund-bond-slash-no-arbiter` |
| "Expose safeBuy to any MCP client / agent framework" | safeBuy MCP server (Streamable HTTP) | → `references/safebuy.md#expose-as-an-mcp-server` |

## Why it fits the Pharos Agent economy

- **Composable**: the core (`src/skill/safeBuy.ts`) has zero chain/LLM imports —
  it is pure orchestration over four injected interfaces (registry, reputation,
  payment, verifier). Swap adapters → same Skill on any chain, agent, or model.
- **Three consumption surfaces** over one core: this Skill-Engine package, an SDK
  (`@cashier/safebuy-sdk`), and an MCP server. Frameworks: OpenClaw, Claude Code,
  Codex, any MCP client.
- **Real on-chain**: every step is a verifiable Pharos Atlantic tx (settlement,
  reputation read, bond slash).

## Error handling

- `no provider clears reputation >= X` — the buyer asked for trusted sellers but
  none qualify. Surface the best score; only retry with the gate waived if the
  user explicitly says "cheapest / ignore rating".
- `payment failed` — payer lacks SafeUSD, or the facilitator has no PHRS gas.
- `delivery FAILED: missing required field` — the provider scammed; the refund
  path runs automatically.

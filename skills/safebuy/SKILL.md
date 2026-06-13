---
name: safebuy
description: Buy data or services on-chain safely — reputation-gated, x402-paid, delivery-verified, auto-refunded. Use when an agent needs to purchase something from another agent/provider on Pharos and must not get scammed. Triggers on "buy", "purchase", "get me the price/quote of", "pay a provider for".
license: MIT
---

# safeBuy

Lets an autonomous agent **buy from other agents without getting scammed**. One
call runs the whole trust loop:

`discover → reputation-gate → select → pay (x402 EIP-3009) → verify delivery → refund or deliver`

A provider only keeps the money if what it delivers matches the buyer's declared
JSON schema. Below the reputation floor? Excluded (unless the user explicitly
waives it). Bad delivery? On-chain bond slash refunds the buyer. No middleman,
no human arbiter.

## When to use
- The user asks to **buy / purchase / fetch (for pay) / get a quote** of data or a service.
- An agent needs paid data (price feeds, APIs) from an untrusted counterparty.

## How to use

### Via the MCP server (recommended for agents)
Connect to the safeBuy MCP server (Streamable HTTP, `../mcp`) and call:
- `safebuy_quote` — preview providers + reputation, no payment. Always quote first.
- `safebuy_purchase` — run the real purchase. Args: `query`, `maxPriceUSDC`,
  optional `minReputation`, `selectBy` (`trust`|`price`), `allowUntrusted`,
  `schemaName` (`gold`|`fx`) or a custom `schema`.

### Via the SDK
```ts
import { createSafeBuy } from "@cashier/safebuy-sdk";
const cashier = createSafeBuy({ payerPrivateKey, providers, rpcUrl, reputationRegistry, bondContract });
const r = await cashier.purchase({ query, schema, maxPriceUSDC, minReputation });
```

## Rules for the agent
1. **Never set `allowUntrusted` unless the user explicitly said** "cheapest" /
   "ignore the rating" / "no matter the reputation". Trust-waiving is the user's
   call, not the model's — silently waiving it routes them to scams.
2. Always declare a `schema` that matches what you actually want; that schema IS
   the scam check.
3. Report the result honestly: on success show the tx hash; on a refund say it
   was scammed-then-refunded; on a refusal say why.

## Output
`{ ok, data?, provider, paidUSDC, txHash?, refundTxHash?, reason?, steps[] }`
Each step is one stage of the loop with a real Pharos Atlantic tx hash where a
chain action occurred.

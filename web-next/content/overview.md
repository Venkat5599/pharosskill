# safeBuy — overview

safeBuy is the trust layer for autonomous agent commerce on Pharos. It lets an AI
agent buy data or services from another agent in a single call, without getting
scammed.

## What it does

One call runs the whole trust loop:

`discover → reputation-gate → select → pay (x402) → verify delivery → refund or deliver`

- **Discover** — find providers that can satisfy the request.
- **Reputation-gate** — read each seller's on-chain reputation (ERC-8004-style
  `scoreOf`). Sellers below the trust floor are excluded unless the buyer
  explicitly waives the gate.
- **Select** — choose an affordable and trusted provider (best trust first,
  cheapest as tiebreak).
- **Pay** — settle with a real x402 EIP-3009 `transferWithAuthorization`. The
  buyer signs gaslessly; a facilitator broadcasts it. No prepaid balance, no
  custody.
- **Verify delivery** — a deterministic JSON-schema check on what arrived. An
  empty body or wrong shape is a scam.
- **Refund or deliver** — good data is delivered; bad data slashes the provider's
  on-chain bond and reclaims the buyer's funds.

## Why it matters

An agent that can spend money should not be able to get robbed. safeBuy enforces
trust with code, not a trusted third party. The refund is verified entirely
on-chain: the provider signs its delivery, and the bond contract itself confirms
the signed delivery failed the schema before paying the buyer back. An honest,
schema-satisfying delivery can never be slashed.

## What's real

Everything in the loop is real on Pharos Atlantic (chain 688689): live data (the
honest provider serves a real XAU/USD price feed), real x402 settlement, live
on-chain reputation reads, and real bond-slash refunds — each a verifiable
transaction.

## How to use it

safeBuy ships as one framework-free core with four surfaces:

- a **Pharos Skill Engine** package (Capability Index + command references),
- an **SDK** (`@cashier/safebuy-sdk`) — `createSafeBuy(...)` or inject your own adapters,
- an **MCP server** (`safebuy_purchase`, `safebuy_quote`, `list_providers`) for any MCP client,
- a **web dashboard + agent** for humans.

Pick the surface your agent or framework prefers — all settle real x402 on Pharos.

<p align="center">
  <img src="https://img.shields.io/badge/🛡️-Cashier_·_safeBuy-c8e64b?style=for-the-badge&labelColor=141210" alt="Cashier · safeBuy" />
</p>

<h1 align="center">Cashier · safeBuy</h1>

<p align="center">
  <strong>The trust layer for autonomous AI-agent commerce on Pharos</strong><br/>
  An agent that buys anything on-chain by chat — and <em>refuses to get scammed</em>.
</p>

<p align="center">
  <a href="https://cashier-web-chi.vercel.app">
    <img src="https://img.shields.io/badge/🔴_LIVE-Pharos_Atlantic-c8e64b?style=for-the-badge&labelColor=141210" alt="Live on Pharos" />
  </a>
  <a href="https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302">
    <img src="https://img.shields.io/badge/✅_REAL-On--Chain_Settlement-ff5436?style=for-the-badge&labelColor=141210" alt="Real on-chain" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-bun-141210?style=for-the-badge&logo=typescript" alt="TypeScript" />
</p>

---

## 📋 Project Overview

**Cashier** is an autonomous purchasing agent that buys data and services *for other agents* — and refuses to get scammed. It runs one skill, **`safeBuy`**, which executes the entire purchase as a single verifiable trust loop on-chain.

### What It Does

- **Reputation-gates every seller** — reads ERC-8004 scores on-chain; below the trust floor → excluded
- **Pays via x402** — signed EIP-3009 authorization, no prepaid balance, no custody
- **Verifies delivery** — deterministic JSON-schema check; empty body or wrong shape = scam detected
- **Auto-refunds** — bad delivery slashes the seller's on-chain bond and reclaims the buyer's funds
- **Refuses by default** — when trust is missing, it doesn't buy unless the user explicitly waives the gate

### Key Innovation

The refund is **trustless**. `SafeBuyBondV2` has no human arbiter — the seller's own EIP-191-signed delivery proof is verified on-chain. A scam slashes the stake; honest delivery reverts the slash. No middleman, no bad debt.

```
Naive agent:    Agent → pay → hope it arrives  (no protection)
With Cashier:   Agent → reputation-gate → pay (x402) → verify → refund-or-deliver  (protected)
```

---

## 🌐 Why This Matters for Pharos

Pharos is building the on-chain AI-agent economy — payments, identity, and agents at scale. But **autonomous payments without a trust layer = liability.** Agents are trivially scammable: they pay for data that never arrives and have no recourse.

| Benefit | Impact |
|---------|--------|
| **Makes agent commerce safe** | Agents can transact with untrusted counterparties and never get burned |
| **Native Pharos primitives** | x402 settlement + ERC-8004 reputation + on-chain bond, all on Atlantic |
| **Reusable across the ecosystem** | `safeBuy` is a framework-free skill any Pharos agent can call |
| **Dual-cascade by design** | One core powers a Phase-1 Skill *and* a Phase-2 Agent |

---

## 🚀 Deployment Information

### Live Surfaces

| Surface | URL |
|---------|-----|
| **Web agent (demo)** | [cashier-web-chi.vercel.app](https://cashier-web-chi.vercel.app) |
| **Docs** | [cashier-web-chi.vercel.app/docs](https://cashier-web-chi.vercel.app/docs) |
| **Live MCP server** | `http://187.127.137.136:4030/mcp` |

### Live Contracts — Pharos Atlantic (chain `688689`)

| Contract | Address |
|----------|---------|
| **SafeUSD** (EIP-3009 settlement token) | [`0xf61cbfe7…ad80d`](https://atlantic.pharosscan.xyz/address/0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d) |
| **ReputationRegistry** (ERC-8004) | [`0x9599f47b…cf670`](https://atlantic.pharosscan.xyz/address/0x9599f47ba6b1b74b149f5c2598e77a27862cf670) |
| **SafeBuyBond** | [`0xb24b3c36…d409`](https://atlantic.pharosscan.xyz/address/0xb24b3c368d8d3e18833ba91fccfce124980ad409) |
| **SafeBuyBondV2** (trustless slash) | [`0xfcbf7bd4…ae4b7`](https://atlantic.pharosscan.xyz/address/0xfcbf7bd428d46daf889eac384d7cdd8181aae4b7) |

### Network Details

```
Network:     Pharos Atlantic (testnet)
Chain ID:    688689
RPC URL:     https://atlantic.dplabs-internal.com/
Explorer:    https://atlantic.pharosscan.xyz
Token:       SafeUSD (open-mint EIP-3009)
```

---

## ⚡ Install the Skill (for judges / agents)

The fastest path — drop the `safeBuy` skill straight into your agent:

```bash
npx skills add Venkat5599/pharosskill
```

Then point your agent at the live MCP server and it runs the real on-chain trust loop:

```bash
claude mcp add --transport http safebuy http://187.127.137.136:4030/mcp
```

Or in any MCP client config:

```json
{
  "mcpServers": {
    "safebuy": { "url": "http://187.127.137.136:4030/mcp" }
  }
}
```

---

## 🖥️ Run It Locally

```bash
# 1. Clone + install (bun)
git clone https://github.com/Venkat5599/pharosskill.git
cd pharosskill
bun install

# 2. Web chatbox  → http://localhost:4040   (recommended for judges)
bun run web

# 3. Terminal chat
bun run demo

# 4. Scripted demo: honest buy + scam → auto-refund
bun run demo:script
```

Try: **"get me the gold price"**, then **"buy the cheapest one, ignore the rating"** — watch Cashier get scammed, then refund itself.

### Run the MCP server

```bash
bun run mcp          # → http://localhost:4030/mcp
```

---

## 📖 How to Use the Skill

### Via the MCP server (recommended for agents)

Connect over Streamable HTTP and call:

- `safebuy_quote` — preview providers + reputation, **no payment**. Always quote first.
- `safebuy_purchase` — run the real purchase. Args: `query`, `maxPriceUSDC`, optional `minReputation`, `selectBy` (`trust`|`price`), `allowUntrusted`, `schemaName` (`gold`|`fx`) or a custom `schema`.

```bash
curl -s http://187.127.137.136:4030/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"safebuy_purchase",
                 "arguments":{"query":"get me the current gold price"}}}'
```

### Via the SDK

```ts
import { createSafeBuy } from "./sdk/createSafeBuy";

const cashier = createSafeBuy({ payerPrivateKey, providers, rpcUrl, reputationRegistry, bondContract });
const r = await cashier.purchase({ query, schema, maxPriceUSDC, minReputation });
// → { ok, data?, provider, paidUSDC, txHash?, refundTxHash?, reason?, steps[] }
```

### Command reference

| Intent | Command |
|--------|---------|
| Buy data safely (full trust loop) | `bun run src/pharos/liveBuy.ts` |
| Buy cheapest, waive the gate | `ALLOW_UNTRUSTED=1 bun run src/pharos/liveBuy.ts` |
| Deploy the SafeUSD settlement token | `PAYER_PRIVATE_KEY=0x… bun run src/pharos/deployToken.ts` |
| Deploy trust infra (registry + bond) | `PAYER_PRIVATE_KEY=0x… bun run src/pharos/deployInfra.ts` |
| Run the x402 provider | `bun run provider` |
| Run the x402 facilitator | `bun run facilitator` |
| Run the MCP server | `bun run mcp` |

---

## 🏗️ Architecture — one brain, four entry points

```
                       src/skill/safeBuy.ts
              (framework-free core · zero chain/LLM imports)
                              ▲
        ┌─────────────┬───────┴───────┬──────────────┐
        │             │               │              │
   CLI skill      MCP server         SDK         web agent
  liveBuy.ts     mcp/server.ts   createSafeBuy   /api/agent → MCP
        │             │               │              │
        └─────────────┴───────┬───────┴──────────────┘
                              ▼
            adapters: registry · ERC-8004 reputation ·
                      x402 payment · schema verifier
                              ▼
              Pharos Atlantic — real settlement + refund
```

The submitted Skill (`safeBuy`) and the agent (`Cashier`) are **not separate codebases** — they drive the exact same `safeBuy()` core through different doors. The core depends only on interfaces (`SafeBuyDeps`); swap adapters, same loop. That is the Phase-1 → Phase-2 cascade by construction.

---

## 📁 Project Structure

```
pharosskill/
├── src/
│   ├── skill/        safeBuy.ts · types.ts · verify.ts   ← THE skill (independent)
│   ├── adapters/     registry · reputation (+ERC-8004) · payment (+Pharos x402)
│   ├── agent/        cashier.ts                          ← chat agent
│   ├── pharos/       liveBuy · deployToken · deployInfra · provider · facilitator
│   └── web/          terminal-style web server
├── web-next/         Next.js site (landing · dashboard · /docs · RAG agent)
├── mcp/              MCP server (Streamable HTTP)
├── sdk/              TypeScript SDK
├── pharos-skill/     Pharos Skill Engine package
├── SKILL.md          skill spec
└── LIVE_DEPLOYMENT.md  on-chain addresses + proof tx
```

---

## ✅ Live Proof

Every path is proven on-chain — open the transactions:

| Proof | Link |
|-------|------|
| **x402 settlement** (real EIP-3009 payment) | [`0xd015239a…`](https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302) |
| **ERC-8004 reputation** (live on-chain read) | [Registry `0x9599f47b…`](https://atlantic.pharosscan.xyz/address/0x9599f47ba6b1b74b149f5c2598e77a27862cf670) |
| **Bond slash + refund** (scam caught) | [`0x41079e3c…`](https://atlantic.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd) |

Full address set + deployment scripts: [LIVE_DEPLOYMENT.md](./LIVE_DEPLOYMENT.md).

---

## 🛠️ Tech Stack

- **Language:** TypeScript on **bun**
- **Chain:** Pharos Atlantic (EVM, chain `688689`)
- **Payments:** `@x402/core` · `@x402/evm` · `@x402/express` · `@x402/fetch` (EIP-3009)
- **Contracts:** Solidity 0.8 (`solc`) — SafeUSD · ReputationRegistry (ERC-8004) · SafeBuyBond / V2
- **Chain access:** `viem`
- **Agent surface:** MCP (`@modelcontextprotocol/sdk`) · Next.js web · `zod` schemas

---

## 🗺️ Roadmap

- [x] `safeBuy` skill core + verify + refund loop (typed, `tsc` clean)
- [x] Cashier chat agent (web + CLI)
- [x] **Live on Pharos Atlantic** — real x402 settlement, ERC-8004 reads, on-chain refund
- [x] Trustless `SafeBuyBondV2` (arbiter removed, slash-with-proof)
- [x] MCP server + Next.js dashboard + docs
- [ ] Publish SDK to npm
- [ ] Multi-token settlement
- [ ] Security audit + mainnet

---

<div align="center">

## Built for the Pharos Skill-to-Agent Dual Cascade Hackathon

*The trust layer for agent commerce — buy without getting burned, on Pharos.*

</div>

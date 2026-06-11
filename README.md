# Cashier · safeBuy

> An autonomous agent that buys anything on-chain by chat — and **refuses to get
> scammed**. Reputation-gated, x402-paid, delivery-verified, auto-refunded.
> The trust layer for agent commerce on **Pharos**.

![scam to refund storyboard](./docs/demo-storyboard.svg)

- **Phase 1 submission — the Skill:** [`safeBuy`](./SKILL.md) (`src/skill/`). Independent, reusable, any-chain/any-agent/any-LLM.
- **Phase 2 — the Agent:** `Cashier`, a chat agent judges talk to (web + CLI).
- **Live on Pharos Atlantic** — real x402 settlement, ERC-8004 reputation, on-chain refund → [LIVE_DEPLOYMENT.md](./LIVE_DEPLOYMENT.md)

## Quick start

```bash
bun install
bun run web            # 🖥️  web chatbox  → http://localhost:4040   (recommended for judges)
bun run demo           # 💬  terminal chat
bun run demo:script    # ▶️  scripted: honest buy + scam→refund
```

Try: **"get me the gold price"**, then **"buy the cheapest one, ignore the rating"** — watch Cashier get scammed, then refund itself.

## Architecture

![architecture](./docs/architecture.svg)

## How it maps to the hackathon

| Hackathon ask | This repo |
|---|---|
| Phase 1: reusable Skill module | `safeBuy` — pure interface-driven core, zero Pharos imports |
| Phase 2: Agent that transacts on-chain | `Cashier` chat agent built on the skill |
| "Skill independent of agent/LLM/network" | core depends only on `SafeBuyDeps` interfaces |
| "Content related to Pharos = higher qualify" | x402 + ERC-8004 adapters target Atlantic testnet `688689` |

## Layout

```
src/
  skill/        safeBuy.ts · types.ts · verify.ts   ← THE submission (independent)
  adapters/     registry · reputation (+ERC-8004) · payment (+Pharos x402)
  agent/        cashier.ts                          ← demo agent
  demo/         world.ts                            ← seeded providers + reputation
SKILL.md                                            ← skill spec
```

## Status

- ✅ Skill core + verify + refund loop, typed, `tsc` clean
- ✅ Cashier chat agent, offline demo (happy path + scam→refund)
- ✅ **LIVE on Pharos Atlantic** — full trust loop on-chain. See [LIVE_DEPLOYMENT.md](./LIVE_DEPLOYMENT.md)
  - real x402 EIP-3009 settlement ([`0xd015239a…`](https://testnet.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302))
  - live **ERC-8004 reputation** read (`ReputationRegistry 0xd99f1e2f…`)
  - real **on-chain refund** via stake slash (`SafeBuyBond 0x3316cbc1…`, refund tx [`0x41079e3c…`](https://testnet.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd))

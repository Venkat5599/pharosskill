# safeBuy — Pharos Skill Engine package

This is the **Pharos Skill Engine-conformant** packaging of safeBuy, following the
format in the [Skill Engine guide](https://docs.pharos.xyz/tooling-and-infrastructure/pharos-skill-engine-guide):

```
pharos-skill/
├── SKILL.md                  # entry point + Capability Index (pass explicitly)
├── references/
│   └── safebuy.md            # per-capability: command template, params, output, errors, agent guidelines
└── assets/safebuy/           # the Solidity contracts the skill deploys/uses
    ├── SafeUSD.sol           # EIP-3009 settlement token
    ├── ReputationRegistry.sol# ERC-8004-style trust gate
    ├── SafeBuyBond.sol       # provider stake → refund-by-slash (v1)
    └── SafeBuyBondV2.sol     # trustless slash (no arbiter, on-chain verified)
```

## How to use with an agent
1. Pass `SKILL.md` to the agent (the Skill Engine never auto-reads it).
2. The agent matches the user's intent to a row in the Capability Index and opens
   the linked section of `references/safebuy.md`.
3. It runs the Command Template (the `bun`/`cast` commands in this repo), parses
   output per the table, and follows the Agent Guidelines.

## Same skill, three surfaces
This Skill Engine package, the SDK (`../sdk`), and the MCP server (`../mcp`) all
drive the **same framework-free core** (`../src/skill/safeBuy.ts`). Pick the
surface your agent/framework prefers — OpenClaw, Claude Code, Codex, or any MCP
client. All settle real x402 on Pharos Atlantic.

See `../LIVE_DEPLOYMENT.md` for verified on-chain tx (settlement, reputation
read, trustless bond slash).

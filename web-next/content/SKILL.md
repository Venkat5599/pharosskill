<div align="center">

#  safeBuy

### The trust layer for autonomous agent commerce on Pharos

**An agent buys anything on-chain by chat — and refuses to get scammed.**
Reputation-gated · x402-paid · delivery-verified · auto-refunded.

`x402` lets agents **pay**. `ERC-8004` lets agents **be known**.
**`safeBuy` lets an agent buy *safely*** — the missing primitive between them.

[Live on Pharos Atlantic](#-live-on-pharos-atlantic-real-txns) · [Quickstart](#-quickstart-30s-offline) · [API](#-api) · [How it works](#-how-it-works)

</div>

---

##  The problem this skill solves

Agents now hold wallets and spend money on their own. The rails exist — `x402` for payment,
`ERC-8004` for identity/reputation — but **the agent has no protection at the moment of purchase.**
x402 settlement is **final**: if a provider takes the money and returns garbage, there is no refund,
no dispute, no recourse. An autonomous buyer is a sitting duck.

`safeBuy` is one call that runs the **entire trust loop** so the agent can't be robbed:

```
discover → reputation-gate → select → pay (x402) → verify delivery → refund-or-deliver
```

-  a provider below the trust bar → **never paid**
-  a paid provider that delivers junk → **payment clawed back on-chain**
-  a trusted provider that delivers valid data → **paid, verified, delivered**

---

##  Independence (the Skill contract)

The skill core (`src/skill/`) imports **zero** chain, wallet, or LLM code. It depends only on four
interfaces (`SafeBuyDeps`). Swap the adapters and the *same* skill runs on any chain, any agent,
any model. Pharos lives entirely in the injected adapters — exactly the organizer's rule:
*"a skill is independent of agent, LLM, and network."*

```ts
import { safeBuy } from "./src/skill/safeBuy.ts";

const result = await safeBuy(
  {
    query: "current gold price",
    schema: { type: "object", required: ["asset", "priceUSD"],
              properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
    maxPriceUSDC: 0.1,
    minReputation: 0.5,         // refuse providers below this trust score
  },
  { registry, reputation, payment, verifier },   // adapters — Pharos or mock
  (step) => console.log(step),                   // optional: narrate live in a chat UI
);
```

---

##  Live on Pharos Atlantic (real txns)

Not a mock. The full loop runs on-chain on Pharos Atlantic (chainId `688689`). Because the Pharos
test "USDC" has no faucet and no EIP-3009 support, the skill settles against **SafeUSD**, our own
EIP-3009 stablecoin (`contracts/SafeUSD.sol`). Every link below is a real transaction.

| Component | On-chain |
|---|---|
| **SafeUSD** (EIP-3009 settlement token) | [`0xf61cbfe7…7ad80d`](https://atlantic.pharosscan.xyz/address/0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d) |
| **ReputationRegistry** (ERC-8004-style `scoreOf`) | [`0xd99f1e2f…585e9b`](https://atlantic.pharosscan.xyz/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b) |
| **SafeBuyBond** (provider stake / slash) | [`0x3316cbc1…a7f1f7`](https://atlantic.pharosscan.xyz/address/0x3316cbc1642fc810e610ce6d2479029821a7f1f7) |
|  honest buy — x402 settlement (0.05 sUSD) | [`0xd015239a…3b2302`](https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302) |
|  scam buy — payment (0.01 sUSD) | [`0xd66d103a…5f012b`](https://atlantic.pharosscan.xyz/tx/0xd66d103a038dd2186c27a42d0375e1b6a1182c03637b54133e1709d1185f012b) |
|  scam buy — **on-chain refund (bond slash)** | [`0x41079e3c…dd43dd`](https://atlantic.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd) |

Reputation is **read live** from the registry; refund is a **real `SafeBuyBond.slash`** that pays the
buyer back from the scammer's staked collateral. Full walkthrough → [LIVE_DEPLOYMENT.md](./LIVE_DEPLOYMENT.md).

---

##  Quickstart (30s, offline)

```bash
bun install
bun run web                #  web chatbox → http://localhost:4040  (best for judges)
bun run demo:script        # honest buy + scam→auto-refund, no setup
bun run demo               # terminal chat
```

```
 Judge: get me the current gold price
    found 2 providers: TrustFeed Oracle, CheapData (unrated)
    TrustFeed 0.92     CheapData 0.18
    chose TrustFeed Oracle
    paid 0.05 USDC via x402   ↳ <tx>
    delivery matches schema    done

 Judge: buy the cheapest one, ignore the rating
    chose CheapData (unrated)
    paid 0.01 USDC   ↳ <tx>
    delivery FAILED: missing "asset"
    reclaimed 0.01 USDC   ↳ <refund tx>     ← scammed, then made whole
```

Go live on Pharos: see [LIVE_DEPLOYMENT.md](./LIVE_DEPLOYMENT.md) (`deployToken` → `deployInfra` → `liveBuy`).

---

##  API

### `safeBuy(req, deps, onStep?) → SafeBuyResult`

**`req: SafeBuyRequest`**

| field | type | default | meaning |
|---|---|---|---|
| `query` | `string` | — | what to buy |
| `schema` | `JsonSchema` | — | shape the delivery **must** match, or it's refunded |
| `maxPriceUSDC` | `number` | — | hard spend ceiling |
| `minReputation` | `number` | `0.5` | minimum provider trust, `[0,1]` |
| `selectBy` | `"trust" \| "price"` | `"trust"` | how to rank eligible providers |
| `allowUntrusted` | `boolean` | `false` | explicit override of the trust gate |

**`deps: SafeBuyDeps`** — the four swappable adapters

| adapter | interface | offline | Pharos |
|---|---|---|---|
| `registry` | `ProviderRegistry` | in-memory | on-chain provider directory |
| `reputation` | `ReputationOracle` | seeded | **ERC-8004** `scoreOf` read |
| `payment` | `PaymentRail` | simulated | **x402** settle + **bond** refund |
| `verifier` | `Verifier` | schema check | same (deterministic) |

**`SafeBuyResult`** → `{ ok, data?, provider?, paidUSDC?, txHash?, refundTxHash?, steps[], reason? }`
`steps[]` is a complete, narratable audit trail (`discover → … → deliver`), perfect for a chat UI.

---

##  How it works

![architecture](./docs/architecture.svg)

```
                        safeBuy(req, deps)
                               │
   ┌─────────────┐   ┌─────────▼─────────┐   ┌──────────────┐   ┌─────────────┐
   │ ProviderReg │──▶│  reputation-gate  │──▶│  x402 pay    │──▶│  verify     │
   │  discover   │   │  (ERC-8004 read)  │   │  (EIP-3009)  │   │  (schema)   │
   └─────────────┘   └───────────────────┘   └──────────────┘   └──────┬──────┘
                          drop low-trust            │ tx               │
                                                    ▼            pass ─▶ deliver
                                              SafeUSD on Pharos   fail ─▶ refund
                                                                         (SafeBuyBond.slash → tx)
```

1. **Discover** providers for the query.
2. **Reputation-gate** — read each provider's `scoreOf` from the on-chain ERC-8004 registry; drop anyone below `minReputation`.
3. **Select** the best eligible provider (`trust` or `price`).
4. **Pay** over x402 — the payer signs an EIP-3009 authorization (gasless), the facilitator settles on Pharos.
5. **Verify** the delivered body against the buyer's JSON schema — *deterministic, no trusted arbiter for the check.*
6. **Refund** on failure — slash the provider's staked bond to make the buyer whole, on-chain.

---

##  Why this scores

| Judging axis | safeBuy |
|---|---|
| **Reusability / composability** | one interface-driven primitive; zero Pharos imports in the core |
| **Skill → Agent cascade** | `safeBuy` skill → `Cashier` chat agent (Phase 1 → Phase 2) |
| **Ecosystem relevance** | the missing trust layer for x402 + ERC-8004 — Pharos's exact thesis |
| **Technical depth** | EIP-3009 token, x402 facilitator/resource server, ERC-8004 read, stake/slash refund |
| **On-chain deployment** | live on Atlantic testnet with real, clickable txns |
| **UX / docs** | natural-language chat, every step on-chain and narrated |

---

##  Layout

```
contracts/        SafeUSD.sol (EIP-3009) · ReputationRegistry.sol · SafeBuyBond.sol
src/skill/        safeBuy.ts · types.ts · verify.ts        ← THE skill (independent)
src/adapters/     registry · reputation (+ERC-8004) · payment (+Pharos x402 +bond refund)
src/pharos/       config · provider (x402 server) · facilitator · deployToken · deployInfra · liveBuy
src/agent/        cashier.ts                                ← CLI demo agent
src/web/          server.ts + public/index.html             ← web chatbox (judges chat here)
docs/             architecture.svg · demo-storyboard.svg
SKILL.md · README.md · LIVE_DEPLOYMENT.md
```

---

##  Ship surface — Skill · SDK · MCP

safeBuy is consumable three ways, all over the same framework-free core:

| Surface | Path | Use |
|---|---|---|
| **Skill** | `skills/safebuy/SKILL.md` | Drop-in agent skill (frontmatter + rules) for agent frameworks / Claude Code. |
| **Pharos Skill Engine** | `pharos-skill/` | Native Pharos Agent Center format — `SKILL.md` Capability Index + `references/safebuy.md` (command templates) + `assets/safebuy/*.sol`. |
| **SDK** | `sdk/` — `@cashier/safebuy-sdk` | `createSafeBuy({...})` for the real Pharos rail, or inject your own `SafeBuyDeps` (any chain/agent/model). |
| **MCP** | `mcp/` — Streamable HTTP `:4030/mcp` (`bun run mcp`) | Tools `safebuy_purchase` · `safebuy_quote` · `list_providers` for any MCP client (Claude, Cursor). |
| **Web** | `web-next/` (Next.js) + `src/web` | Landing + dashboard + RAG agent. Browser wallet pays real x402; no server-side buyer key. |

---

##  Honest scope

- **Reputation** reads a live on-chain registry today; richer ERC-8004 feedback/attestation accrual is the natural next step (the `scoreOf` read interface stays identical).
- **Refund** ships in two forms. V1 `SafeBuyBond.slash` is arbiter-authorized (fast path). **V2 `SafeBuyBondV2` is trustless and live** (`contracts/SafeBuyBondV2.sol`): the provider EIP-191-signs each delivery, and `slashWithProof` itself verifies on-chain that (1) the provider signed the response and (2) the signed response is missing the required schema field — then anyone can trigger the refund. No arbiter, no discretion. An honest, schema-satisfying delivery **cannot** be slashed (the call reverts). Proven on-chain: scam-signed delivery slashed (real tx), honest-signed delivery reverted. (Szabo: *trusted third parties are security holes* — so we removed it.)

<div align="center">

**safeBuy** — because an agent that can spend money should not be able to get robbed.

</div>

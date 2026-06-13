# safeBuy — operation reference

All commands run from the repo root after `bun install`. Pharos Atlantic
(chainId `688689`, RPC `https://atlantic.dplabs-internal.com/`). The settlement
token is SafeUSD (EIP-3009), `assets/safebuy/SafeUSD.sol`.

---

## Buy data safely (full trust loop)

### Overview
Runs the whole safeBuy loop against the live x402 rail: discover providers →
read each provider's on-chain reputation → select affordable AND trusted → pay
via a signed EIP-3009 authorization → verify the delivered body against the
buyer's JSON schema → deliver on success. Refuses sellers below the reputation
floor by default.

**Command Template**

```bash
PAYER_PRIVATE_KEY=<0xkey> \
REPUTATION_REGISTRY=<0xregistry> \
BOND_CONTRACT=<0xbond> \
bun run src/pharos/liveBuy.ts
```

**Parameters**

|** Parameter **|** Type **|** Required **|** Description **|
|---|---|---|---|
| `PAYER_PRIVATE_KEY` | hex | yes | Buyer wallet holding SafeUSD. Signs the gasless EIP-3009 authorization. |
| `REPUTATION_REGISTRY` | address | no | ERC-8004-style registry read for the trust gate. Omit → seeded scores. |
| `BOND_CONTRACT` | address | no | SafeBuyBond used for on-chain refund on a bad delivery. |
| `PHAROS_RPC` | url | no | Defaults to Atlantic. |

**Output Parsing**

|** Field **|** Description **|
|---|---|
| `[discover]` | providers found for the query |
| `[reputation]` | each provider's score vs the floor |
| `[select]` | the chosen provider |
| `[pay] … ↳ <explorer tx>` | real x402 settlement tx hash |
| `[verify]` | schema check result |
| `[deliver]` / `[refund]` | delivered data, or refund tx on a scam |

**Error Handling**

|** Error **|** Cause **|** Fix **|
|---|---|---|
| `no provider clears reputation >= 0.5` | all sellers below floor | only waive if user said "cheapest/ignore rating" (see next capability) |
| `payment failed` | no SafeUSD / facilitator out of gas | mint SafeUSD to payer; fund facilitator PHRS |
| `delivery FAILED` | provider returned junk | expected — the refund path runs automatically |

> **Agent Guidelines:**
> 1. Always declare the JSON `schema` you actually want — that schema IS the scam check.
> 2. Never waive the reputation gate unless the user explicitly said so.
> 3. Report the real tx hash on success; on a refund, say "scammed then refunded on-chain".

---

## Buy with the trust gate waived

### Overview
The buyer explicitly accepts an unrated/low-reputation seller (e.g. "buy the
cheapest, ignore the rating"). safeBuy still protects them: it pays, verifies the
delivery, and refunds on-chain if the data is junk.

**Command Template**

```bash
PAYER_PRIVATE_KEY=<0xkey> BOND_CONTRACT=<0xbond> \
SAFEBUY_ALLOW_UNTRUSTED=1 SAFEBUY_SELECT_BY=price \
bun run src/pharos/liveBuy.ts
```

**Parameters**

|** Parameter **|** Type **|** Required **|** Description **|
|---|---|---|---|
| `SAFEBUY_ALLOW_UNTRUSTED` | bool | yes | Waive the reputation floor (logged loudly). |
| `SAFEBUY_SELECT_BY` | `price`\|`trust` | no | `price` picks the cheapest eligible seller. |

> **Agent Guidelines:**
> 1. Only set this when the user's words clearly waive trust — it is a security decision, never the model's default.
> 2. The bond-slash refund still fires on a bad delivery, so the buyer cannot lose funds.

---

## Check on-chain reputation

### Overview
Read an agent's ERC-8004-style reputation score (basis points, 0–10000) directly
from the on-chain ReputationRegistry. This is the read the trust gate uses.

**Command Template**

```bash
cast call <0xregistry> "scoreOf(address)(uint256)" <0xagent> \
  --rpc-url https://atlantic.dplabs-internal.com/
```

**Output Parsing**

|** Field **|** Description **|
|---|---|
| returned `uint256` | score in basis points; divide by 10000 for [0,1] (e.g. `9200` = 0.92) |

> **Agent Guidelines:**
> 1. A score of `0` means unknown/untrusted, not "bad" — treat unknowns as below the floor.

---

## Deploy SafeUSD settlement token

### Overview
Deploys the minimal EIP-3009 stablecoin used for x402 settlement (open `mint()`
so any test wallet can fund itself). Contract: `assets/safebuy/SafeUSD.sol`.

**Command Template**

```bash
PAYER_PRIVATE_KEY=<0xkey> bun run src/pharos/deployToken.ts
```

**Output Parsing**

|** Field **|** Description **|
|---|---|
| `TEST_USDC=0x…` | deployed token address — put it in `.env` |

**Error Handling**

|** Error **|** Cause **|** Fix **|
|---|---|---|
| `insufficient funds` | deployer has no PHRS | fund the deployer from the Atlantic faucet |

---

## Deploy trust infra (reputation + bond)

### Overview
Deploys `ReputationRegistry` (the trust gate's data source) and `SafeBuyBond`
(provider stake → buyer refund-by-slash), then seeds scores and stakes a bond.
Contracts in `assets/safebuy/`.

**Command Template**

```bash
PAYER_PRIVATE_KEY=<0xkey> bun run src/pharos/deployInfra.ts
```

**Output Parsing**

|** Field **|** Description **|
|---|---|
| `REPUTATION_REGISTRY=0x…` | set in `.env` for the trust gate |
| `BOND_CONTRACT=0x…` | set in `.env` for on-chain refunds |

---

## Run the x402 provider + facilitator

### Overview
The provider is a real x402 resource server (paid endpoints); the facilitator
verifies + broadcasts EIP-3009 settlements. Needed for live buys.

**Command Template**

```bash
FACILITATOR_PRIVATE_KEY=<0xkey> bun run facilitator   # :4022 (needs PHRS gas to settle)
PROVIDER_ADDRESS=<0xmerchant>  bun run provider        # :4021 (GET /gold, /cheap-gold)
```

**Error Handling**

|** Error **|** Cause **|** Fix **|
|---|---|---|
| `/settle` fails | facilitator key has no PHRS | fund `FACILITATOR_PRIVATE_KEY` address |

> **Agent Guidelines:**
> 1. Boot order: facilitator first, then provider (it syncs supported kinds on start).

---

## Trustless refund (bond slash, no arbiter)

### Overview
`SafeBuyBondV2` (`assets/safebuy/SafeBuyBondV2.sol`) removes the trusted arbiter.
The provider EIP-191-signs its delivery; `slashWithProof` verifies on-chain that
(1) the provider signed the response and (2) the signed response is missing the
required schema field — only then refunds the buyer, permissionlessly. An honest,
schema-satisfying delivery **cannot** be slashed (the call reverts).

**Command Template**

```bash
cast send <0xbondV2> \
  "slashWithProof(address,address,uint256,string,string,uint8,bytes32,bytes32)" \
  <0xprovider> <0xbuyer> <amount> '<signed response json>' '<requiredField>' <v> <r> <s> \
  --rpc-url https://atlantic.dplabs-internal.com/ --private-key <0xanyone>
```

**Parameters**

|** Parameter **|** Type **|** Required **|** Description **|
|---|---|---|---|
| `response` | string | yes | The provider's exact signed delivery body. |
| `requiredField` | string | yes | Schema field the delivery must contain (e.g. `asset`). |
| `v,r,s` | sig | yes | Provider's EIP-191 signature over `keccak256(response)`. |

**Error Handling**

|** Error **|** Cause **|** Fix **|
|---|---|---|
| `not provider-signed` | signature does not recover to `provider` | a buyer cannot fabricate a bad delivery — by design |
| `delivery satisfies schema` | response contains the required field | honest delivery — slash correctly refuses |

> **Agent Guidelines:**
> 1. This is the production-grade refund: math decides, not an arbiter. Prefer it over V1.

---

## Expose as an MCP server

### Overview
Serve safeBuy as MCP tools (`safebuy_purchase`, `safebuy_quote`, `list_providers`)
over Streamable HTTP so any MCP client (OpenClaw, Claude Code, Codex) can buy.

**Command Template**

```bash
PAYER_PRIVATE_KEY=<0xkey> PROVIDERS_JSON='[…]' \
REPUTATION_REGISTRY=<0x…> BOND_CONTRACT=<0x…> \
bun run mcp                                   # :4030/mcp
```

> **Agent Guidelines:**
> 1. Add to a client: `claude mcp add --transport http safebuy http://<host>:4030/mcp`.
> 2. Always `safebuy_quote` first (no payment) to preview providers + reputation.

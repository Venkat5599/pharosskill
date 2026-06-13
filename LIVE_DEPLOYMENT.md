# Live on Pharos Atlantic Testnet

`safeBuy` runs end-to-end with **real x402 EIP-3009 settlement** on Pharos Atlantic
(chainId `688689`). Because the Pharos test "USDC" has no faucet and no EIP-3009
support, we deploy our own EIP-3009 stablecoin (**SafeUSD**, `contracts/SafeUSD.sol`)
and settle against it.

## On-chain artifacts (clickable)

| What | Address / Tx |
|---|---|
| SafeUSD token (EIP-3009) | [`0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d`](https://atlantic.pharosscan.xyz/address/0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d) |
| Deploy tx | [`0xfdf0aa14…cde0ed`](https://atlantic.pharosscan.xyz/tx/0xfdf0aa14985437bdfbf7dd01ff6fb59789544272d22d6124b437cdccaecde0ed) |
| Mint tx (1000 sUSD) | [`0x6f43ff36…29560d`](https://atlantic.pharosscan.xyz/tx/0x6f43ff36368b720aef751889e9b565fb3ddc4e0fc88289e53c7df84a6129560d) |
| safeBuy settlement (0.05 sUSD) | [`0xd015239a…3b2302`](https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302) |
| ReputationRegistry (ERC-8004-style) | [`0xd99f1e2f…585e9b`](https://atlantic.pharosscan.xyz/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b) |
| SafeBuyBond (stake/slash) | [`0x3316cbc1…a7f1f7`](https://atlantic.pharosscan.xyz/address/0x3316cbc1642fc810e610ce6d2479029821a7f1f7) |
| scam buy: payment (0.01 sUSD) | [`0xd66d103a…5f012b`](https://atlantic.pharosscan.xyz/tx/0xd66d103a038dd2186c27a42d0375e1b6a1182c03637b54133e1709d1185f012b) |
| scam buy: **on-chain refund (slash)** | [`0x41079e3c…dd43dd`](https://atlantic.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd) |

Each settlement is a real x402 `transferWithAuthorization`: the payer signs an
EIP-3009 authorization off-chain (gasless), the facilitator broadcasts it, and the
provider only returns data after on-chain settlement succeeds.

## Reproduce

```bash
bun install

# 1. fund a wallet with PHRS gas (faucet): https://testnet.pharosnetwork.xyz/
# 2. deploy your own SafeUSD + mint:
PAYER_PRIVATE_KEY=0x<key> bun run src/pharos/deployToken.ts
#    -> prints TEST_USDC=0x...  (put it in .env)

# 3. run the three real processes:
FACILITATOR_PRIVATE_KEY=0x<key> bun run facilitator      # :4022
PROVIDER_ADDRESS=0x<merchant>  bun run provider           # :4021
PAYER_PRIVATE_KEY=0x<key>      bun run src/pharos/liveBuy.ts
```

`liveBuy.ts` prints the real settlement tx hash + explorer link.

## Architecture (real components)

```
safeBuy (skill)
  └─ pharosX402Rail ──HTTP 402──> provider.ts (x402 resource server, :4021)
                                      └──verify/settle──> facilitator.ts (:4022)
                                                              └──tx──> SafeUSD (EIP-3009) on Pharos
```

## Full live trust loop

Run both flows (honest buy + scam→refund) against the live infra:

```bash
# provider + facilitator running, then:
PAYER_PRIVATE_KEY=0x<key> \
REPUTATION_REGISTRY=0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b \
BOND_CONTRACT=0x3316cbc1642fc810e610ce6d2479029821a7f1f7 \
bun run src/pharos/liveBuy.ts
```

- **Reputation** is read live from the on-chain ReputationRegistry (ERC-8004-style
  `scoreOf`) via `erc8004Reputation()`.
- **Refund** is a real on-chain `SafeBuyBond.slash` — the buyer is made whole from
  the provider's staked collateral. Deploy infra with `bun run src/pharos/deployInfra.ts`.

### Remaining honest note
`slash` is authorized by an `arbiter` (the safeBuy agent) acting on the off-chain
schema-verification result. Production would replace this with an optimistic
dispute window + on-chain verification proof, removing the trusted arbiter.

## Live MCP buys — real on-chain (2026-06-13)

The MCP server (`http://187.127.137.136:4030/mcp`) settles real x402 EIP-3009
payments on Pharos Atlantic. Verified tx (all status `success`):

| What | Tx |
|---|---|
| Mint 100 sUSD → payer | [`0x3d89154c…abcbca7`](https://atlantic.pharosscan.xyz/tx/0x3d89154c2de8882984d3ce5a69eb9f66963630020eef73fb86408ce41abcbca7) |
| Honest buy (TrustFeed, delivered XAU) | [`0xf0b7fd24…ee91a36`](https://atlantic.pharosscan.xyz/tx/0xf0b7fd24b73d17ce4c649a7b409ea59e1203736b4a66da80a74b1b1ceee91a36) |
| Scam buy settle (CheapData) | [`0xa26a1c9d…393f2e2`](https://atlantic.pharosscan.xyz/tx/0xa26a1c9dcdccad3b49c3857ef8955907628027be1bd3b2e9bf3cefa51393f2e2) |

Balances after: payer 99.94 sUSD, provider 0.06 sUSD. The scam buy settled but
did NOT auto-refund (no `BOND_CONTRACT` deployed for these addresses) — refund
needs the SafeBuyBond infra wired (see `deployInfra.ts`).

### Real bond-slash refund (complete loop, 2026-06-13)

SafeBuyBond deployed live + wired into the MCP. A scam delivery now triggers a
REAL on-chain clawback — buyer made whole, no mocks anywhere in the loop.

| What | Tx |
|---|---|
| SafeBuyBond deploy (arbiter=payer) | `0x74e12cca…0b76fa31` → `0xb24b3c368d8d3e18833ba91fccfce124980ad409` |
| Scam buy settle | [`0x8b0d270a…36b781f55`](https://atlantic.pharosscan.xyz/tx/0x8b0d270ae931600b64b8e2cb7f2f6b8a39bd1db21eb36860488e18c36b781f55) |
| **On-chain refund (bond slash)** | [`0x9b17f05c…e4c99f3d2`](https://atlantic.pharosscan.xyz/tx/0x9b17f05c21b74c6bb039b25e2176fb9555cff5e85dc7fe567383303e4c99f3d2) |

Net: buyer paid 0.01, reclaimed 0.01 (zero loss); provider bond 1.00 → 0.99 sUSD.
Full loop — discover, reputation-gate, x402 settle, schema verify, bond-slash
refund — is real Pharos Atlantic on-chain. `BOND_CONTRACT=0xb24b3c368d8d3e18833ba91fccfce124980ad409`.

### Live reputation gate — real on-chain read (2026-06-13)

ReputationRegistry deployed + seeded; two DISTINCT provider addresses so the gate
is a genuine on-chain `scoreOf` read, not a constant.

| What | Value / Tx |
|---|---|
| ReputationRegistry | `0x9599f47ba6b1b74b149f5c2598e77a27862cf670` |
| scoreOf(honest 0x32dE…) | 9200 bps = 0.92 |
| scoreOf(scam 0xb456…) | 1800 bps = 0.18 |
| Honest buy (passed gate, no override) | [`0x90836539…be02411b2`](https://atlantic.pharosscan.xyz/tx/0x9083653904b5432df7a723322d70bb3060e677c699744bc50651751be02411b2) |

Three demoable paths, all real on-chain:
1. **Honest** — live rep 0.92 ≥ floor → real x402 settle → schema verify → deliver.
2. **Rep-gate refusal** — live rep 0.18 < 0.5 → refuses, NO payment made.
3. **Scam + override** — real settle → schema fail → real bond-slash refund.

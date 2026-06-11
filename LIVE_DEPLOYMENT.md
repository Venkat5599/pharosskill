# Live on Pharos Atlantic Testnet

`safeBuy` runs end-to-end with **real x402 EIP-3009 settlement** on Pharos Atlantic
(chainId `688689`). Because the Pharos test "USDC" has no faucet and no EIP-3009
support, we deploy our own EIP-3009 stablecoin (**SafeUSD**, `contracts/SafeUSD.sol`)
and settle against it.

## On-chain artifacts (clickable)

| What | Address / Tx |
|---|---|
| SafeUSD token (EIP-3009) | [`0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d`](https://testnet.pharosscan.xyz/address/0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d) |
| Deploy tx | [`0xfdf0aa14…cde0ed`](https://testnet.pharosscan.xyz/tx/0xfdf0aa14985437bdfbf7dd01ff6fb59789544272d22d6124b437cdccaecde0ed) |
| Mint tx (1000 sUSD) | [`0x6f43ff36…29560d`](https://testnet.pharosscan.xyz/tx/0x6f43ff36368b720aef751889e9b565fb3ddc4e0fc88289e53c7df84a6129560d) |
| safeBuy settlement (0.05 sUSD) | [`0xd015239a…3b2302`](https://testnet.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302) |
| ReputationRegistry (ERC-8004-style) | [`0xd99f1e2f…585e9b`](https://testnet.pharosscan.xyz/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b) |
| SafeBuyBond (stake/slash) | [`0x3316cbc1…a7f1f7`](https://testnet.pharosscan.xyz/address/0x3316cbc1642fc810e610ce6d2479029821a7f1f7) |
| scam buy: payment (0.01 sUSD) | [`0xd66d103a…5f012b`](https://testnet.pharosscan.xyz/tx/0xd66d103a038dd2186c27a42d0375e1b6a1182c03637b54133e1709d1185f012b) |
| scam buy: **on-chain refund (slash)** | [`0x41079e3c…dd43dd`](https://testnet.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd) |

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

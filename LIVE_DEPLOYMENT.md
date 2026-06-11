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
| safeBuy settlement #1 (0.05 sUSD) | [`0x57d1d88c…fa0b69`](https://testnet.pharosscan.xyz/tx/0x57d1d88caa61065f4b49fe693d5e3be7e673a3fc51ed40502486bdd122fa0b69) |
| safeBuy settlement #2 (0.05 sUSD) | [`0x66ce069f…a6ee1a`](https://testnet.pharosscan.xyz/tx/0x66ce069f7f97219ca1740e051d30d9fbe561a09ed4ce5bc3669e3eed82a6ee1a) |

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

## Honest scope notes

- **Reputation** is still a seeded oracle (offline). Swap for a live ERC-8004
  Reputation Registry read via `erc8004Reputation()` once one is deployed.
- **Refund** on the live rail throws by design — a true on-chain refund needs the
  safeBuy settlement/stake contract (next milestone). The offline rail demonstrates
  the refund branch.

# safeBuy MCP server (Streamable HTTP)

Exposes the safeBuy trust loop as MCP tools so any MCP client — Claude, Cursor,
an agent framework — can buy data/services on Pharos with reputation-gating,
real x402 settlement, delivery verification, and auto-refund.

## Tools
| Tool | What it does |
|---|---|
| `safebuy_purchase` | Full loop: discover → reputation-gate → select → **pay (real x402 EIP-3009)** → verify delivery → refund-or-deliver. Refuses low-rep sellers unless `allowUntrusted`; auto-refunds via on-chain bond slash on a bad delivery. |
| `safebuy_quote` | Dry-run: discover + read ERC-8004 reputation + show eligibility. No payment. |
| `list_providers` | The x402 providers this server buys from. |

## Run
```bash
bun run mcp        # from repo root -> :4030/mcp   (MCP_PORT to change)
curl localhost:4030/healthz
```

## Configure the real rail (env)
Real on-chain settlement needs a funded payer + x402 providers + a reachable facilitator.
```bash
PAYER_PRIVATE_KEY=0x...        # funded with SafeUSD (sUSD) + PHRS gas
PHAROS_RPC=https://atlantic.dplabs-internal.com/
REPUTATION_REGISTRY=0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b   # ERC-8004 (optional)
BOND_CONTRACT=0x3316cbc1642fc810e610ce6d2479029821a7f1f7        # slash refund (optional)
# providers: either a JSON array...
PROVIDERS_JSON='[{"id":"p1","name":"TrustFeed","endpoint":"https://your-provider/feed","priceUSDC":0.05,"agentAddress":"0x..."}]'
# ...or a single provider:
PROVIDER_URL=https://your-provider/feed
PROVIDER_ADDRESS=0x...
PROVIDER_PRICE=0.05
```
Without `PAYER_PRIVATE_KEY` + providers, the tools return a clear "real rail not
configured" message (this build is real-on-chain by design).

## Add to an MCP client
Remote Streamable-HTTP server. Example client config:
```json
{
  "mcpServers": {
    "safebuy": { "url": "http://<host>:4030/mcp" }
  }
}
```
(Claude Code: `claude mcp add --transport http safebuy http://<host>:4030/mcp`.)

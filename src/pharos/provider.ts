import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { PHAROS_NETWORK, TEST_USDC, TOKEN_NAME, TOKEN_VERSION, usdcAmount } from "./config.ts";

// Real x402 provider server on Pharos. Hosts two paid endpoints so safeBuy has
// something genuine to buy from:
//   GET /gold        -> honest feed, returns valid data
//   GET /cheap-gold  -> the scammer, returns junk (drives verify -> refund)
//
// A request with no payment returns HTTP 402 + payment requirements. That part
// boots and is verifiable WITHOUT any funds. Actual settlement happens when a
// paid request hits the configured facilitator.

const PORT = Number(process.env.PROVIDER_PORT ?? 4021);
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:4022";
const PAY_TO = (process.env.PROVIDER_ADDRESS ??
  "0x1111111111111111111111111111111111111111") as `0x${string}`;
// Per-endpoint payTo so the honest and scam providers are DISTINCT on-chain
// agents — that lets the reputation registry score them differently and makes
// the reputation-gate a real on-chain read. Fall back to PAY_TO if unset.
const PAY_TO_GOLD = (process.env.PROVIDER_ADDRESS_GOLD ?? PAY_TO) as `0x${string}`;
const PAY_TO_CHEAP = (process.env.PROVIDER_ADDRESS_CHEAP ?? PAY_TO) as `0x${string}`;

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  PHAROS_NETWORK,
  new ExactEvmScheme(),
);

const app = express();

app.use(
  paymentMiddleware(
    {
      // Pharos has no SDK default-asset entry, so name the USDC asset + atomic
      // amount explicitly. `extra` carries the EIP-712 token domain for EIP-3009.
      "GET /gold": {
        accepts: {
          scheme: "exact",
          network: PHAROS_NETWORK,
          payTo: PAY_TO_GOLD,
          maxTimeoutSeconds: 60,
          price: { amount: usdcAmount(0.05), asset: TEST_USDC, extra: { name: TOKEN_NAME, version: TOKEN_VERSION } },
        },
        description: "Spot gold price (XAU/USD)",
      },
      "GET /cheap-gold": {
        accepts: {
          scheme: "exact",
          network: PHAROS_NETWORK,
          payTo: PAY_TO_CHEAP,
          maxTimeoutSeconds: 60,
          price: { amount: usdcAmount(0.01), asset: TEST_USDC, extra: { name: TOKEN_NAME, version: TOKEN_VERSION } },
        },
        description: "Cheap gold price (unrated provider)",
      },
    },
    resourceServer,
    undefined,
    undefined,
    true, // syncFacilitatorOnStart: fetch supported kinds from the facilitator on boot
  ),
);

// Honest provider: serves a REAL live gold price (XAU/USD) from a public feed.
// Falls back to a last-known value only if the upstream is briefly unreachable,
// so the paid delivery always satisfies the buyer's schema.
const GOLD_FEED = process.env.GOLD_FEED_URL ?? "https://api.gold-api.com/price/XAU";
app.get("/gold", async (_req, res) => {
  try {
    const r = await fetch(GOLD_FEED, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { price?: number };
    if (typeof j.price === "number") {
      res.json({ asset: "XAU", priceUSD: Number(j.price.toFixed(2)), ts: Date.now(), source: GOLD_FEED });
      return;
    }
    throw new Error("no price field");
  } catch {
    res.json({ asset: "XAU", priceUSD: 4220.3, ts: Date.now(), source: "fallback" });
  }
});

// The scam: paid endpoint that deliberately fails the buyer's schema.
app.get("/cheap-gold", (_req, res) => {
  res.json({ lol: "gimme more money" });
});

app.listen(PORT, () => {
  console.log(`x402 provider live on http://localhost:${PORT}`);
  console.log(`  GET /gold        ($0.05)  honest`);
  console.log(`  GET /cheap-gold  ($0.01)  scam`);
  console.log(`  facilitator: ${FACILITATOR_URL} · network ${PHAROS_NETWORK}`);
});

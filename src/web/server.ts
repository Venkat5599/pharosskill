import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { safeBuy } from "../skill/safeBuy.ts";
import { schemaVerifier } from "../skill/verify.ts";
import { inMemoryRegistry } from "../adapters/registry.ts";
import { inMemoryReputation, erc8004Reputation } from "../adapters/reputation.ts";
import { localX402Rail } from "../adapters/payment.ts";
import { pharosX402Rail } from "../adapters/pharosX402.ts";
import { REPUTATION_REGISTRY, BOND_CONTRACT, PHAROS_RPC } from "../pharos/config.ts";
import type {
  JsonSchema,
  PaymentRail,
  ReputationOracle,
  SafeBuyDeps,
  SafeBuyRequest,
} from "../skill/types.ts";

// Minimal web backend for the Cashier demo. Serves the chat UI and exposes
// POST /api/buy, which turns a chat message into a SafeBuyRequest, runs the
// safeBuy skill, and returns the full step trail for the UI to animate.
// Uses the offline rail so judges can click without any wallet setup.

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT ?? 4040);
const EXPLORER = process.env.PHAROS_EXPLORER ?? "https://testnet.pharosscan.xyz/tx/";

// USE_PHAROS=1 -> the agent drives the skill against live Pharos: real x402
// settlement, on-chain ERC-8004 reputation, real bond-slash refund. Needs a
// running provider + facilitator and PAYER_PRIVATE_KEY. Otherwise fully offline.
const usePharos = process.env.USE_PHAROS === "1";

const reputation: ReputationOracle =
  usePharos && REPUTATION_REGISTRY
    ? erc8004Reputation({ rpcUrl: PHAROS_RPC, registryAddress: REPUTATION_REGISTRY })
    : inMemoryReputation;

const payment: PaymentRail = usePharos
  ? pharosX402Rail({
      payerPrivateKey: process.env.PAYER_PRIVATE_KEY as `0x${string}`,
      bondContract: BOND_CONTRACT || undefined,
    })
  : localX402Rail;

const deps: SafeBuyDeps = { registry: inMemoryRegistry, reputation, payment, verifier: schemaVerifier };

const SCHEMAS: Record<string, JsonSchema> = {
  gold: { type: "object", required: ["asset", "priceUSD"], properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
  fx: { type: "object", required: ["pair", "rate"], properties: { pair: { type: "string" }, rate: { type: "number" } } },
};

function buildRequest(message: string): SafeBuyRequest {
  const m = message.toLowerCase();
  const schema = m.includes("fx") || m.includes("eur") ? SCHEMAS.fx! : SCHEMAS.gold!;
  const forceCheap = /cheapest|ignore.*rat|allow.*untrust|no matter/.test(m);
  return {
    query: message,
    schema,
    maxPriceUSDC: 0.1,
    minReputation: 0.5,
    selectBy: forceCheap ? "price" : "trust",
    allowUntrusted: forceCheap,
  };
}

const app = express();
app.use(express.json());
app.use(express.static(resolve(here, "public")));

app.post("/api/buy", async (req, res) => {
  const message = String(req.body?.message ?? "").slice(0, 200);
  if (!message) return res.status(400).json({ error: "empty message" });
  const result = await safeBuy(buildRequest(message), deps);
  res.json({ explorer: EXPLORER, ...result });
});

app.listen(PORT, () => {
  console.log(`Cashier web UI  →  http://localhost:${PORT}`);
  console.log(usePharos ? "  mode: LIVE on Pharos (real x402 + ERC-8004 + bond refund)" : "  mode: offline demo (no wallet needed)");
});

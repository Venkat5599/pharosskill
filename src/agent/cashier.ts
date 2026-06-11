import * as readline from "node:readline";
import { safeBuy } from "../skill/safeBuy.ts";
import { schemaVerifier } from "../skill/verify.ts";
import { inMemoryRegistry } from "../adapters/registry.ts";
import { inMemoryReputation } from "../adapters/reputation.ts";
import { localX402Rail } from "../adapters/payment.ts";
import { pharosX402Rail } from "../adapters/pharosX402.ts";
import type { JsonSchema, PaymentRail, SafeBuyDeps, SafeBuyRequest, SafeBuyStep } from "../skill/types.ts";

// Cashier — the demo agent. It is a thin wrapper: it turns a chat message into a
// SafeBuyRequest, calls the safeBuy Skill, and narrates each step. The skill does
// the real work and knows nothing about Cashier. Swap deps for Pharos testnet
// with USE_PHAROS=1 (see SKILL.md).

// USE_PHAROS=1 -> pay the live x402 provider on Pharos Atlantic with a real
// signed authorization (needs PAYER_PRIVATE_KEY holding test USDC). Otherwise
// run fully offline against the simulated rail.
const usePharos = process.env.USE_PHAROS === "1";
const payment: PaymentRail = usePharos
  ? pharosX402Rail({ payerPrivateKey: process.env.PAYER_PRIVATE_KEY as `0x${string}` })
  : localX402Rail;

const deps: SafeBuyDeps = {
  registry: inMemoryRegistry,
  reputation: inMemoryReputation,
  payment,
  verifier: schemaVerifier,
};

const EXPLORER = process.env.PHAROS_EXPLORER ?? "https://testnet.pharosscan.xyz/tx/";

// Schemas Cashier knows how to ask for. A real agent would synthesize these.
const SCHEMAS: Record<string, JsonSchema> = {
  gold: {
    type: "object",
    required: ["asset", "priceUSD"],
    properties: { asset: { type: "string" }, priceUSD: { type: "number" } },
  },
  fx: {
    type: "object",
    required: ["pair", "rate"],
    properties: { pair: { type: "string" }, rate: { type: "number" } },
  },
};

function icon(s: SafeBuyStep): string {
  if (s.ok === false) return "❌";
  switch (s.kind) {
    case "discover": return "🔎";
    case "reputation": return "⭐";
    case "select": return "🎯";
    case "pay": return "💸";
    case "verify": return "✅";
    case "refund": return "🛡️";
    case "deliver": return "📦";
    default: return "•";
  }
}

function buildRequest(message: string): SafeBuyRequest {
  const m = message.toLowerCase();
  const schema = m.includes("fx") || m.includes("eur") ? SCHEMAS.fx! : SCHEMAS.gold!;
  // "cheapest" / "ignore the rating" => buyer forces lowest price + waives the
  // trust gate. This is the override that lets a scam through — and lets
  // safeBuy demonstrate verify-then-refund.
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

async function handle(message: string): Promise<void> {
  const req = buildRequest(message);
  console.log(`\n🤖 Cashier: on it — buying "${message}" (max ${req.maxPriceUSDC} USDC, min trust ${req.minReputation})\n`);

  const result = await safeBuy(req, deps, (s) => {
    const tx = s.txHash ? `  ↳ ${EXPLORER}${s.txHash}` : "";
    console.log(`   ${icon(s)} ${s.detail}${tx ? "\n" + tx : ""}`);
  });

  console.log("");
  if (result.ok) {
    console.log(`🤖 Cashier: done. Bought from ${result.provider?.name} for ${result.paidUSDC} USDC.`);
    console.log(`   Data: ${JSON.stringify(result.data)}`);
  } else if (result.refundTxHash) {
    console.log(`🤖 Cashier: blocked a bad deal. ${result.provider?.name} failed to deliver — I paid then clawed it back. No loss.`);
    console.log(`   Reason: ${result.reason}`);
  } else {
    console.log(`🤖 Cashier: I refused this purchase. ${result.reason}`);
  }
  console.log("");
}

const SCRIPT = [
  "get me the current gold price from a paid feed",
  "buy the gold price from the cheapest one, ignore the rating",
];

async function main(): Promise<void> {
  console.log("💳 Cashier — autonomous safe-buyer on Pharos");
  console.log("   Skill: safeBuy (reputation-gated · x402-paid · delivery-verified · auto-refund)\n");

  // Non-interactive (CI / piped): run the scripted demo and exit.
  if (!process.stdin.isTTY || process.argv.includes("--script")) {
    for (const line of SCRIPT) {
      console.log(`🧑 Judge: ${line}`);
      await handle(line);
    }
    console.log("— scripted demo complete. Run `bun run demo` in a terminal to chat. —");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "🧑 You: " });
  console.log('Try: "get me the gold price"  ·  then: "buy the cheapest, ignore the rating"  ·  Ctrl+C to quit.\n');
  rl.prompt();
  rl.on("line", async (line) => {
    const msg = line.trim();
    if (msg) await handle(msg);
    rl.prompt();
  });
  rl.on("close", () => console.log("\n👋 bye"));
}

main();

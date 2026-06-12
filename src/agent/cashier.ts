import * as readline from "node:readline";
import { safeBuy } from "../skill/safeBuy.ts";
import { schemaVerifier } from "../skill/verify.ts";
import { inMemoryRegistry } from "../adapters/registry.ts";
import { inMemoryReputation } from "../adapters/reputation.ts";
import { localX402Rail } from "../adapters/payment.ts";
import { pharosX402Rail } from "../adapters/pharosX402.ts";
import { llmEnabled, parseIntent } from "../adapters/llm.ts";
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

const EXPLORER = process.env.PHAROS_EXPLORER ?? "https://atlantic.pharosscan.xyz/tx/";

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

// Short, fixed-width text tag per step kind — keeps terminal output aligned
// without any emoji.
function tag(s: SafeBuyStep): string {
  const t =
    s.kind === "discover" ? "find" :
    s.kind === "reputation" ? "rate" :
    s.kind === "select" ? "pick" :
    s.kind === "pay" ? "pay" :
    s.kind === "verify" ? "check" :
    s.kind === "refund" ? "refund" :
    s.kind === "deliver" ? "done" :
    s.ok === false ? "stop" : "-";
  return t.padEnd(6);
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

// Turn a chat message into a SafeBuyRequest. Prefer the TokenRouter LLM brain;
// fall back to deterministic regex parsing when no key is configured (offline/CI).
async function planRequest(message: string): Promise<SafeBuyRequest> {
  if (llmEnabled()) {
    try {
      return await parseIntent(message);
    } catch (e) {
      console.log(`   LLM parse failed (${(e as Error).message}); using regex fallback`);
    }
  }
  return buildRequest(message);
}

async function handle(message: string): Promise<void> {
  const req = await planRequest(message);
  const brain = llmEnabled() ? "TokenRouter" : "regex";
  console.log(`\nCashier: on it — buying "${message}" (max ${req.maxPriceUSDC} USDC, min trust ${req.minReputation}) [${brain}]\n`);

  const result = await safeBuy(req, deps, (s) => {
    const tx = s.txHash ? `         -> ${EXPLORER}${s.txHash}` : "";
    console.log(`   ${tag(s)} ${s.detail}${tx ? "\n" + tx : ""}`);
  });

  console.log("");
  if (result.ok) {
    console.log(`Cashier: done. Bought from ${result.provider?.name} for ${result.paidUSDC} USDC.`);
    console.log(`   Data: ${JSON.stringify(result.data)}`);
  } else if (result.refundTxHash) {
    console.log(`Cashier: blocked a bad deal. ${result.provider?.name} failed to deliver — I paid then clawed it back. No loss.`);
    console.log(`   Reason: ${result.reason}`);
  } else {
    console.log(`Cashier: I refused this purchase. ${result.reason}`);
  }
  console.log("");
}

const SCRIPT = [
  "get me the current gold price from a paid feed",
  "buy the gold price from the cheapest one, ignore the rating",
];

async function main(): Promise<void> {
  console.log("Cashier — autonomous safe-buyer on Pharos");
  console.log("   Skill: safeBuy (reputation-gated · x402-paid · delivery-verified · auto-refund)");
  console.log(`   Brain: ${llmEnabled() ? "TokenRouter (MiniMax-M3)" : "regex (set TOKENROUTER_API_KEY for LLM)"}\n`);

  // Non-interactive (CI / piped): run the scripted demo and exit.
  if (!process.stdin.isTTY || process.argv.includes("--script")) {
    for (const line of SCRIPT) {
      console.log(`Judge: ${line}`);
      await handle(line);
    }
    console.log("— scripted demo complete. Run `bun run demo` in a terminal to chat. —");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
  console.log('Try: "get me the gold price"  ·  then: "buy the cheapest, ignore the rating"  ·  Ctrl+C to quit.\n');
  rl.prompt();
  rl.on("line", async (line) => {
    const msg = line.trim();
    if (msg) await handle(msg);
    rl.prompt();
  });
  rl.on("close", () => console.log("\nbye"));
}

main();

// Cashier RAG agent. One LLM call (DeepSeek V4 Flash) does double duty as a
// router: grounded on retrieved doc context, it either ANSWERS a question or
// decides to BUY — in which case it emits a safeBuy intent and the server runs
// the real safeBuy trust loop as a tool. RAG (knowledge) + skill (action).

import { retrieve } from "@/lib/rag";
import { buildRequest, EXPLORER, looksLikeBuy, SCHEMAS, safeBuy, wantsCheap, type JsonSchema, type SafeBuyRequest } from "@/lib/safeBuy";
import { REAL_RAIL, realBuy } from "@/lib/realRail";

const TR_BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.aicredits.in/v1";
const TR_MODEL = process.env.TOKENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

const SYSTEM = `You are Cashier, an autonomous on-chain buying agent for the Pharos agent economy.
You run a skill called "safeBuy": reputation-gated, x402-paid, delivery-verified, auto-refunding purchases.

You are given CONTEXT excerpts from the project documentation. Use them to answer questions accurately.
Decide what the user wants and respond with ONLY a JSON object, no prose, no markdown fences:

{
  "action": "answer" | "buy",
  "answer": string,            // when action="answer": a concise, accurate reply grounded in CONTEXT (2-5 sentences). Empty when buying.
  "intent": {                  // when action="buy": the purchase intent. Null when answering.
    "schema": "gold" | "fx",
    "maxPriceUSDC": number,
    "minReputation": number,
    "selectBy": "trust" | "price",
    "allowUntrusted": boolean
  }
}

Rules:
- Use action="buy" only when the user clearly wants to purchase/fetch data (e.g. "buy the gold price", "get me the EUR/USD rate"). Otherwise action="answer".
- If the user wants the cheapest provider or says to ignore ratings, set selectBy="price" and allowUntrusted=true.
- Default maxPriceUSDC=0.1, minReputation=0.5, selectBy="trust", allowUntrusted=false.
- For answers, never invent on-chain addresses or tx hashes — only use ones present in CONTEXT.`;

function extractJson(s: string): string {
  const t = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const a = t.indexOf("{"),
    b = t.lastIndexOf("}");
  if (a === -1 || b < a) throw new Error("no json");
  return t.slice(a, b + 1);
}

interface Decision {
  action: "answer" | "buy";
  answer?: string;
  intent?: {
    schema?: string;
    maxPriceUSDC?: number;
    minReputation?: number;
    selectBy?: "trust" | "price";
    allowUntrusted?: boolean;
  };
}

export interface AgentReply {
  type: "answer" | "buy" | "error";
  answer?: string;
  sources?: string[];
  explorer?: string;
  buy?: ReturnType<typeof safeBuy> | Awaited<ReturnType<typeof realBuy>>;
  error?: string;
}

export async function runAgent(message: string): Promise<AgentReply> {
  const key = process.env.TOKENROUTER_API_KEY;
  if (!key) return { type: "error", error: "TOKENROUTER_API_KEY not set — agent needs the LLM brain." };

  // RAG: pull the most relevant doc chunks
  let context = "";
  let sources: string[] = [];
  try {
    const hits = await retrieve(message, 4);
    context = hits.map((h, i) => `[${i + 1}] (${h.source})\n${h.text}`).join("\n\n");
    sources = [...new Set(hits.map((h) => h.source))];
  } catch {
    context = "(no context available)";
  }

  let decision: Decision;
  try {
    const r = await fetch(`${TR_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TR_MODEL,
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `CONTEXT:\n${context}\n\n---\nUSER MESSAGE: ${message}` },
        ],
      }),
      signal: AbortSignal.timeout(28000),
    });
    if (!r.ok) throw new Error(`llm ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    decision = JSON.parse(extractJson(j.choices?.[0]?.message?.content ?? "")) as Decision;
  } catch (e) {
    // LLM brain unreachable. Buy requests still work via the deterministic
    // regex parser + safeBuy (no LLM needed). Q&A cannot degrade — it needs
    // the model — so return a clear, honest error.
    if (looksLikeBuy(message)) {
      return {
        type: "buy",
        explorer: EXPLORER,
        buy: safeBuy(buildRequest(message)),
        sources,
        answer: "(LLM brain unreachable — ran safeBuy via the deterministic fallback parser.)",
      };
    }
    return { type: "error", error: `agent brain unreachable (${(e as Error).message}). Buying still works; doc Q&A needs the LLM provider back online.` };
  }

  if (decision.action === "buy" && decision.intent) {
    // Real on-chain rail when configured (VPS) — same verified MCP path.
    if (REAL_RAIL) {
      try {
        const r = await realBuy(message);
        return { type: "buy", explorer: r.explorer, buy: r, sources };
      } catch {
        /* fall through to simulated */
      }
    }
    const it = decision.intent;
    const schema: JsonSchema = SCHEMAS[it.schema ?? "gold"] ?? SCHEMAS.gold!;
    const req: SafeBuyRequest = {
      query: message,
      schema,
      maxPriceUSDC: typeof it.maxPriceUSDC === "number" && it.maxPriceUSDC > 0 ? it.maxPriceUSDC : 0.1,
      minReputation: typeof it.minReputation === "number" ? it.minReputation : 0.5,
      // trust-waiving is deterministic, NOT model-controlled
      selectBy: wantsCheap(message) ? "price" : "trust",
      allowUntrusted: wantsCheap(message),
    };
    return { type: "buy", explorer: EXPLORER, buy: safeBuy(req), sources };
  }

  return { type: "answer", answer: decision.answer ?? "I'm not sure — try rephrasing.", sources };
}

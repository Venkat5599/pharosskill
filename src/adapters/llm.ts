import type { JsonSchema, SafeBuyRequest } from "../skill/types.ts";

// TokenRouter LLM adapter — gives Cashier an actual brain.
//
// TokenRouter is an OpenAI-compatible gateway (https://api.tokenrouter.com/v1).
// We use it to turn a free-form chat message into a structured SafeBuyRequest:
// what to buy, which delivery schema to demand, the price ceiling, the trust
// floor, and whether the buyer explicitly waived the reputation gate.
//
// The skill stays LLM-agnostic — only this adapter (injected at the agent edge)
// knows TokenRouter exists. Swap MODEL/base and any OpenAI-compatible provider
// works unchanged.

const BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.tokenrouter.com/v1";
const MODEL = process.env.TOKENROUTER_MODEL ?? "MiniMax-M3";

export interface ParsedIntent extends SafeBuyRequest {}

/** Is an LLM brain configured? If not, the agent falls back to regex parsing. */
export function llmEnabled(): boolean {
  return Boolean(process.env.TOKENROUTER_API_KEY);
}

// Schemas the agent is willing to demand on delivery. The LLM picks one by key.
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

const SYSTEM = `You are the intent parser for Cashier, an autonomous on-chain buyer agent.
Convert the user's message into a purchase intent. Respond with ONLY a JSON object, no prose:
{
  "schema": "gold" | "fx",        // gold = metal spot price; fx = currency pair rate
  "maxPriceUSDC": number,          // spend ceiling in USDC, default 0.1
  "minReputation": number,         // trust floor 0..1, default 0.5
  "selectBy": "trust" | "price",   // "price" if they want cheapest, else "trust"
  "allowUntrusted": boolean        // true ONLY if they say ignore rating / cheapest / no matter what
}
If the user wants the cheapest provider or says to ignore ratings, set selectBy="price" and allowUntrusted=true.`;

/** Strip MiniMax-style <think>...</think> reasoning and pull the first JSON object. */
function extractJson(content: string): string {
  const noThink = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const start = noThink.indexOf("{");
  const end = noThink.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object in model output: ${noThink.slice(0, 120)}`);
  }
  return noThink.slice(start, end + 1);
}

interface RawIntent {
  schema?: string;
  maxPriceUSDC?: number;
  minReputation?: number;
  selectBy?: "trust" | "price";
  allowUntrusted?: boolean;
}

/** Ask TokenRouter to parse a chat message into a SafeBuyRequest. */
export async function parseIntent(message: string): Promise<ParsedIntent> {
  const key = process.env.TOKENROUTER_API_KEY;
  if (!key) throw new Error("TOKENROUTER_API_KEY not set");

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: message },
      ],
      // Reasoning model: leave headroom for <think> + the JSON answer.
      max_tokens: 1024,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    throw new Error(`TokenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  const raw = JSON.parse(extractJson(content)) as RawIntent;

  const schema = SCHEMAS[raw.schema ?? "gold"] ?? SCHEMAS.gold!;
  return {
    query: message,
    schema,
    maxPriceUSDC: typeof raw.maxPriceUSDC === "number" ? raw.maxPriceUSDC : 0.1,
    minReputation: typeof raw.minReputation === "number" ? raw.minReputation : 0.5,
    selectBy: raw.selectBy === "price" ? "price" : "trust",
    allowUntrusted: Boolean(raw.allowUntrusted),
  };
}

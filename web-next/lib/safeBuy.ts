// Self-contained safeBuy trust loop (offline rail) — faithful port of the
// original gander-landing/api/buy.ts. No wallet, no chain: the seeded "world",
// the schema verifier, and the safeBuy orchestration are inlined so the demo
// runs anywhere. Optional TokenRouter LLM brain parses chat -> intent.

// ---------- types ----------
export interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}
export interface Provider {
  id: string;
  name: string;
  endpoint: string;
  priceUSDC: number;
  agentAddress: string;
}
export interface Step {
  kind: string;
  detail: string;
  ok?: boolean;
  txHash?: string;
}
export interface SafeBuyRequest {
  query: string;
  schema: JsonSchema;
  maxPriceUSDC: number;
  minReputation?: number;
  selectBy?: "trust" | "price";
  allowUntrusted?: boolean;
}

// ---------- seeded world (offline) ----------
interface Seeded extends Provider {
  handler: () => unknown;
  reputation: number;
}
const TRUST: Seeded = {
  id: "trustfeed",
  name: "TrustFeed Oracle",
  endpoint: "",
  priceUSDC: 0.05,
  agentAddress: "0x1111111111111111111111111111111111111111",
  reputation: 0.92,
  handler: () => ({ asset: "XAU", priceUSD: 2387.41, ts: Date.now() }),
};
const CHEAP: Seeded = {
  id: "cheapscam",
  name: "CheapData (unrated)",
  endpoint: "",
  priceUSDC: 0.01,
  agentAddress: "0x2222222222222222222222222222222222222222",
  reputation: 0.18,
  handler: () => ({ lol: "gimme more money" }),
};
const FX: Seeded = {
  id: "fxfeed",
  name: "FXFeed",
  endpoint: "",
  priceUSDC: 0.03,
  agentAddress: "0x3333333333333333333333333333333333333333",
  reputation: 0.74,
  handler: () => ({ pair: "EUR/USD", rate: 1.0842, ts: Date.now() }),
};

function discover(query: string): Seeded[] {
  const q = query.toLowerCase();
  if (q.includes("fx") || q.includes("eur") || q.includes("usd")) return [FX];
  if (q.includes("gold") || q.includes("xau")) return [TRUST, CHEAP];
  return [TRUST, CHEAP];
}

const BY_ID: Record<string, Seeded> = { [TRUST.id]: TRUST, [CHEAP.id]: CHEAP, [FX.id]: FX };
export function providerById(id: string): Provider | undefined {
  const p = BY_ID[id];
  return p && { id: p.id, name: p.name, endpoint: p.endpoint, priceUSDC: p.priceUSDC, agentAddress: p.agentAddress };
}
// ---------- verifier ----------
function checkSchema(value: unknown, schema: JsonSchema, path: string): string | null {
  const typeOf = (v: unknown): string =>
    Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  const actual = typeOf(value);
  if (schema.type !== actual) return `${path || "root"}: expected ${schema.type}, got ${actual}`;
  if (schema.type === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in obj)) return `${path || "root"}: missing required field "${key}"`;
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
      if (key in obj) {
        const e = checkSchema(obj[key], sub, path ? `${path}.${key}` : key);
        if (e) return e;
      }
  }
  if (schema.type === "array" && schema.items) {
    const arr = value as unknown[];
    for (let i = 0; i < arr.length; i++) {
      const e = checkSchema(arr[i], schema.items, `${path}[${i}]`);
      if (e) return e;
    }
  }
  return null;
}
function verify(response: unknown, schema: JsonSchema): { ok: boolean; reason?: string } {
  if (response === undefined || response === null) return { ok: false, reason: "empty response body" };
  const err = checkSchema(response, schema, "");
  return err ? { ok: false, reason: err } : { ok: true };
}

// ---------- selection (discover + reputation-gate + select) ----------
// Shared by the simulated rail (safeBuy) AND the real wallet rail (/api/plan):
// runs everything up to — but not including — payment, so the buyer can sign
// the x402 authorization for the chosen provider in their own wallet.
export type SelectResult =
  | { ok: true; pick: Seeded; steps: Step[] }
  | { ok: false; reason: string; steps: Step[] };

export function selectProvider(req: SafeBuyRequest): SelectResult {
  const steps: Step[] = [];
  const minRep = req.minReputation ?? 0.5;
  const log = (s: Step) => steps.push(s);
  const fail = (reason: string): SelectResult => {
    log({ kind: "abort", detail: reason, ok: false });
    return { ok: false, reason, steps };
  };

  const providers = discover(req.query);
  if (providers.length === 0) return fail(`no provider found for "${req.query}"`);
  log({ kind: "discover", detail: `found ${providers.length} provider(s): ${providers.map((p) => p.name).join(", ")}`, ok: true });

  for (const p of providers)
    log({ kind: "reputation", detail: `${p.name}: reputation ${p.reputation.toFixed(2)}, price ${p.priceUSDC} USDC`, ok: p.reputation >= minRep });

  const affordable = providers.filter((p) => p.priceUSDC <= req.maxPriceUSDC);
  if (affordable.length === 0) return fail(`all providers exceed maxPrice ${req.maxPriceUSDC} USDC`);

  let eligible: Seeded[];
  if (req.allowUntrusted) eligible = affordable;
  else {
    eligible = affordable.filter((p) => p.reputation >= minRep);
    if (eligible.length === 0) {
      const best = [...affordable].sort((a, b) => b.reputation - a.reputation)[0]!;
      return fail(`no provider clears reputation >= ${minRep} (best was ${best.name} @ ${best.reputation.toFixed(2)}). Refusing to buy. Pass allowUntrusted to override.`);
    }
  }
  const pick = eligible.sort((a, b) =>
    req.selectBy === "price"
      ? a.priceUSDC - b.priceUSDC || b.reputation - a.reputation
      : b.reputation - a.reputation || a.priceUSDC - b.priceUSDC,
  )[0]!;
  log({ kind: "select", detail: `chose ${pick.name} (reputation ${pick.reputation.toFixed(2)}, ${pick.priceUSDC} USDC)`, ok: true });
  return { ok: true, pick, steps };
}

// ---------- delivery + schema verification (post-payment) ----------
export function deliverVerify(pickId: string, schema: JsonSchema): { ok: boolean; data?: unknown; reason?: string } {
  const pick = BY_ID[pickId];
  if (!pick) return { ok: false, reason: "unknown provider" };
  const response = pick.handler();
  const v = verify(response, schema);
  return v.ok ? { ok: true, data: response } : { ok: false, reason: v.reason };
}

// ---------- safeBuy loop (simulated rail) ----------
export function safeBuy(req: SafeBuyRequest) {
  const sel = selectProvider(req);
  if (!sel.ok) return { ok: false, reason: sel.reason, steps: sel.steps };
  const { pick } = sel;
  const steps = sel.steps;
  const log = (s: Step) => steps.push(s);

  // pay (offline rail). NOTE: simulated — does NOT touch a chain, so it emits NO
  // tx hash (a fake hash would 404). Real settlement runs through the wallet rail
  // (/api/plan + client x402 signing + /api/settle).
  log({ kind: "pay", detail: `paid ${pick.priceUSDC} USDC to ${pick.name} via x402 (simulated — offline rail)`, ok: true });

  const v = deliverVerify(pick.id, req.schema);
  if (!v.ok) {
    log({ kind: "verify", detail: `delivery FAILED: ${v.reason}`, ok: false });
    log({ kind: "refund", detail: `reclaimed ${pick.priceUSDC} USDC (simulated — offline rail)`, ok: true });
    return { ok: false, provider: pick, paidUSDC: pick.priceUSDC, refunded: true, simulated: true, steps, reason: `bad delivery, refunded: ${v.reason}` };
  }
  log({ kind: "verify", detail: "delivery matches schema", ok: true });
  log({ kind: "deliver", detail: "purchase complete", ok: true });
  return { ok: true, data: v.data, provider: pick, paidUSDC: pick.priceUSDC, simulated: true, steps };
}

// ---------- request shaping ----------
export const SCHEMAS: Record<string, JsonSchema> = {
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
// Heuristic: does the message look like a purchase/fetch request?
export function looksLikeBuy(message: string): boolean {
  return /\b(buy|purchase|get|fetch|price|rate|quote|order)\b/i.test(message);
}

export function buildRequest(message: string): SafeBuyRequest {
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

export const EXPLORER = process.env.PHAROS_EXPLORER ?? "https://atlantic.pharosscan.xyz/tx/";

// ---------- TokenRouter LLM brain (optional) ----------
const TR_BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.aicredits.in/v1";
const TR_MODEL = process.env.TOKENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";
const TR_SYSTEM = `You are the intent parser for Cashier, an autonomous on-chain buyer.
Convert the user's message into a purchase intent. Respond with ONLY a JSON object, no prose:
{"schema":"gold"|"fx","maxPriceUSDC":number,"minReputation":number,"selectBy":"trust"|"price","allowUntrusted":boolean}
If the user wants the cheapest provider or says to ignore ratings, set selectBy="price" and allowUntrusted=true.`;

function extractJson(s: string): string {
  const t = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const a = t.indexOf("{"),
    b = t.lastIndexOf("}");
  if (a === -1 || b < a) throw new Error("no json");
  return t.slice(a, b + 1);
}

export async function planRequest(message: string): Promise<SafeBuyRequest> {
  const key = process.env.TOKENROUTER_API_KEY;
  if (!key) return buildRequest(message);
  try {
    const r = await fetch(`${TR_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TR_MODEL,
        temperature: 0,
        max_tokens: 2048, // v4-flash is a reasoning model; reasoning_content eats budget
        messages: [
          { role: "system", content: TR_SYSTEM },
          { role: "user", content: message },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`tokenrouter ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = JSON.parse(extractJson(j.choices?.[0]?.message?.content ?? "")) as Partial<SafeBuyRequest> & {
      schema?: string;
    };
    const schema = SCHEMAS[raw.schema ?? "gold"] ?? SCHEMAS.gold!;
    return {
      query: message,
      schema,
      maxPriceUSDC: typeof raw.maxPriceUSDC === "number" ? raw.maxPriceUSDC : 0.1,
      minReputation: typeof raw.minReputation === "number" ? raw.minReputation : 0.5,
      selectBy: raw.selectBy === "price" ? "price" : "trust",
      allowUntrusted: Boolean(raw.allowUntrusted),
    };
  } catch {
    return buildRequest(message); // any failure -> deterministic regex
  }
}

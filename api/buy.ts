// Vercel serverless adapter for the Cashier demo — SELF-CONTAINED.
//
// Vercel's function bundler can't trace the repo's `.ts`-extension import
// specifiers (e.g. import ... from "../src/skill/safeBuy.ts"), so the entire
// safeBuy trust loop, the schema verifier, and the seeded offline "world" are
// inlined here. This is a faithful copy of src/skill/safeBuy.ts + verify.ts +
// demo/world.ts running on the offline rail (no wallet, no chain).

// ---------- types ----------
interface JsonSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}
interface Provider { id: string; name: string; endpoint: string; priceUSDC: number; agentAddress: string }
interface Step { kind: string; detail: string; ok?: boolean; txHash?: string }
interface SafeBuyRequest {
  query: string; schema: JsonSchema; maxPriceUSDC: number;
  minReputation?: number; selectBy?: "trust" | "price"; allowUntrusted?: boolean;
}

// ---------- seeded world (offline) ----------
interface Seeded extends Provider { handler: () => unknown; reputation: number }
const TRUST: Seeded = { id: "trustfeed", name: "TrustFeed Oracle", endpoint: "", priceUSDC: 0.05,
  agentAddress: "0x1111111111111111111111111111111111111111", reputation: 0.92,
  handler: () => ({ asset: "XAU", priceUSD: 2387.41, ts: Date.now() }) };
const CHEAP: Seeded = { id: "cheapscam", name: "CheapData (unrated)", endpoint: "", priceUSDC: 0.01,
  agentAddress: "0x2222222222222222222222222222222222222222", reputation: 0.18,
  handler: () => ({ lol: "gimme more money" }) };
const FX: Seeded = { id: "fxfeed", name: "FXFeed", endpoint: "", priceUSDC: 0.03,
  agentAddress: "0x3333333333333333333333333333333333333333", reputation: 0.74,
  handler: () => ({ pair: "EUR/USD", rate: 1.0842, ts: Date.now() }) };

function discover(query: string): Seeded[] {
  const q = query.toLowerCase();
  if (q.includes("fx") || q.includes("eur") || q.includes("usd")) return [FX];
  if (q.includes("gold") || q.includes("xau")) return [TRUST, CHEAP];
  return [TRUST, CHEAP];
}
function fakeTx(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return "0x" + h.toString(16).padStart(8, "0").repeat(8);
}

// ---------- verifier (copy of verify.ts) ----------
function checkSchema(value: unknown, schema: JsonSchema, path: string): string | null {
  const typeOf = (v: unknown): string => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
  const actual = typeOf(value);
  if (schema.type !== actual) return `${path || "root"}: expected ${schema.type}, got ${actual}`;
  if (schema.type === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) return `${path || "root"}: missing required field "${key}"`;
    for (const [key, sub] of Object.entries(schema.properties ?? {}))
      if (key in obj) { const e = checkSchema(obj[key], sub, path ? `${path}.${key}` : key); if (e) return e; }
  }
  if (schema.type === "array" && schema.items) {
    const arr = value as unknown[];
    for (let i = 0; i < arr.length; i++) { const e = checkSchema(arr[i], schema.items, `${path}[${i}]`); if (e) return e; }
  }
  return null;
}
function verify(response: unknown, schema: JsonSchema): { ok: boolean; reason?: string } {
  if (response === undefined || response === null) return { ok: false, reason: "empty response body" };
  const err = checkSchema(response, schema, "");
  return err ? { ok: false, reason: err } : { ok: true };
}

// ---------- safeBuy loop (copy of safeBuy.ts, offline rail inlined) ----------
function safeBuy(req: SafeBuyRequest) {
  const steps: Step[] = [];
  const minRep = req.minReputation ?? 0.5;
  const log = (s: Step) => { steps.push(s); };
  const fail = (reason: string) => { log({ kind: "abort", detail: reason, ok: false }); return { ok: false, reason, steps }; };

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
    req.selectBy === "price" ? a.priceUSDC - b.priceUSDC || b.reputation - a.reputation
                             : b.reputation - a.reputation || a.priceUSDC - b.priceUSDC)[0]!;
  log({ kind: "select", detail: `chose ${pick.name} (reputation ${pick.reputation.toFixed(2)}, ${pick.priceUSDC} USDC)`, ok: true });

  // pay (offline rail)
  const response = pick.handler();
  const txHash = fakeTx(pick.id + ":" + pick.priceUSDC + ":" + Date.now());
  log({ kind: "pay", detail: `paid ${pick.priceUSDC} USDC to ${pick.name} via x402`, ok: true, txHash });

  const v = verify(response, req.schema);
  if (!v.ok) {
    log({ kind: "verify", detail: `delivery FAILED: ${v.reason}`, ok: false });
    const refundTxHash = fakeTx("refund:" + txHash);
    log({ kind: "refund", detail: `reclaimed ${pick.priceUSDC} USDC`, ok: true, txHash: refundTxHash });
    return { ok: false, provider: pick, paidUSDC: pick.priceUSDC, txHash, refundTxHash, steps, reason: `bad delivery, refunded: ${v.reason}` };
  }
  log({ kind: "verify", detail: "delivery matches schema", ok: true });
  log({ kind: "deliver", detail: "purchase complete", ok: true });
  return { ok: true, data: response, provider: pick, paidUSDC: pick.priceUSDC, txHash, steps };
}

// ---------- request shaping + handler ----------
const SCHEMAS: Record<string, JsonSchema> = {
  gold: { type: "object", required: ["asset", "priceUSD"], properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
  fx: { type: "object", required: ["pair", "rate"], properties: { pair: { type: "string" }, rate: { type: "number" } } },
};
function buildRequest(message: string): SafeBuyRequest {
  const m = message.toLowerCase();
  const schema = m.includes("fx") || m.includes("eur") ? SCHEMAS.fx! : SCHEMAS.gold!;
  const forceCheap = /cheapest|ignore.*rat|allow.*untrust|no matter/.test(m);
  return { query: message, schema, maxPriceUSDC: 0.1, minReputation: 0.5, selectBy: forceCheap ? "price" : "trust", allowUntrusted: forceCheap };
}

const EXPLORER = process.env.PHAROS_EXPLORER ?? "https://testnet.pharosscan.xyz/tx/";

interface Req { method?: string; body?: unknown }
interface Res { status(c: number): Res; json(b: unknown): void; setHeader(k: string, v: string): void }

export default function handler(req: Req, res: Res): void {
  if (req.method !== "POST") { res.status(405).json({ error: "method not allowed" }); return; }
  let body = req.body as { message?: unknown } | undefined;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = undefined; } }
  const message = String(body?.message ?? "").slice(0, 200);
  if (!message) { res.status(400).json({ error: "empty message" }); return; }
  const result = safeBuy(buildRequest(message));
  res.json({ explorer: EXPLORER, ...result });
}

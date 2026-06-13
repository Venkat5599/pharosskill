// Final-boss RAG agent pipeline.
//
//   1. PLAN     — one LLM call decides answer-vs-buy and, for answers, emits
//                 multi-query variants + a HyDE hypothetical answer.
//   2. RETRIEVE — hybrid BM25+vector over all query variants, RRF-fused.
//   3. RERANK   — LLM cross-encoder-style relevance scoring of candidates.
//   4. COMPRESS — keep only the sentences that actually support the answer.
//   5. ANSWER   — grounded answer with span-level citations.
//   6. MULTI-HOP— if the model flags the context insufficient, one more retrieve.
//
// Buys are delegated to the real rail (lib/realRail) or the local safeBuy.

import { hybridRetrieve, type Hit } from "@/lib/rag";
import { buildRequest, EXPLORER, SCHEMAS, safeBuy, wantsCheap, type JsonSchema, type SafeBuyRequest } from "@/lib/safeBuy";
import { REAL_RAIL, realBuy } from "@/lib/realRail";

const TR_BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.aicredits.in/v1";
const TR_MODEL = process.env.TOKENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";

async function llm(system: string, user: string, maxTokens = 1200): Promise<string> {
  const key = process.env.TOKENROUTER_API_KEY;
  if (!key) throw new Error("no LLM key");
  const r = await fetch(`${TR_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TR_MODEL, temperature: 0, max_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`llm ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}
function extractJson(s: string): string {
  const t = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b < a) throw new Error("no json");
  return t.slice(a, b + 1);
}

// ---------- 1. PLAN ----------
interface Plan {
  action: "answer" | "buy";
  queries: string[]; // search variants (answer mode)
  hyde: string; // hypothetical answer doc (answer mode)
}
const PLAN_SYS = `You are the planner for Cashier, an on-chain buying agent with a knowledge base about the safeBuy skill (x402, ERC-8004 reputation, bond-slash refund, Pharos).
Return ONLY JSON:
{"action":"answer"|"buy",
 "queries":[3 short search query variants that rephrase the user's question with synonyms/keywords],
 "hyde":"a 1-2 sentence hypothetical answer to the question (used for embedding retrieval)"}
Use "buy" only if the user clearly wants to purchase/fetch paid data (e.g. "buy the gold price"). For "buy", queries/hyde can be empty.`;

async function plan(message: string): Promise<Plan> {
  const raw = JSON.parse(extractJson(await llm(PLAN_SYS, message, 800))) as Partial<Plan>;
  return {
    action: raw.action === "buy" ? "buy" : "answer",
    queries: Array.isArray(raw.queries) ? raw.queries.filter((q) => typeof q === "string").slice(0, 3) : [],
    hyde: typeof raw.hyde === "string" ? raw.hyde : "",
  };
}

// ---------- 3. RERANK ----------
async function rerank(message: string, hits: Hit[], keep = 4): Promise<Hit[]> {
  if (hits.length <= keep) return hits;
  const list = hits.map((h, i) => `[${i}] (${h.chunk.source} › ${h.chunk.heading})\n${h.chunk.text.slice(0, 500)}`).join("\n\n");
  try {
    const raw = await llm(
      `Score each passage 0-10 for how well it helps answer the question. Return ONLY JSON: {"scores":[{"i":<index>,"s":<0-10>}, ...]}`,
      `QUESTION: ${message}\n\nPASSAGES:\n${list}`,
      900,
    );
    const parsed = JSON.parse(extractJson(raw)) as { scores?: { i: number; s: number }[] };
    const byIdx = new Map((parsed.scores ?? []).map((x) => [x.i, x.s]));
    return [...hits].map((h, i) => ({ h, s: byIdx.get(i) ?? 0 })).sort((a, b) => b.s - a.s).slice(0, keep).map((x) => x.h);
  } catch {
    return hits.slice(0, keep); // rerank failed → fall back to fused order
  }
}

// ---------- 5. ANSWER (+span citations, +insufficiency flag for multi-hop) ----------
interface Answer { answer: string; spans: string[]; sufficient: boolean }
const ANS_SYS = `You answer questions about the safeBuy skill strictly from CONTEXT.
Return ONLY JSON:
{"answer":"concise accurate answer grounded in CONTEXT (2-5 sentences)",
 "spans":["exact quoted sentence(s) from CONTEXT that support the answer"],
 "sufficient": true|false  // false if CONTEXT lacks the info to answer well}
Never invent addresses, tx hashes, or numbers absent from CONTEXT.`;

async function answer(message: string, hits: Hit[]): Promise<Answer> {
  const ctx = hits.map((h, i) => `[${i + 1}] (${h.chunk.source} › ${h.chunk.heading})\n${h.chunk.text}`).join("\n\n");
  const raw = JSON.parse(extractJson(await llm(ANS_SYS, `CONTEXT:\n${ctx}\n\n---\nQUESTION: ${message}`, 1400))) as Partial<Answer>;
  return { answer: raw.answer ?? "I'm not sure.", spans: Array.isArray(raw.spans) ? raw.spans.slice(0, 4) : [], sufficient: raw.sufficient !== false };
}

// ---------- public ----------
export interface RagReply {
  type: "answer" | "buy" | "error";
  answer?: string;
  spans?: string[];
  sources?: string[];
  hops?: number;
  explorer?: string;
  buy?: unknown;
  error?: string;
}

export async function runRagAgent(message: string): Promise<RagReply> {
  if (!process.env.TOKENROUTER_API_KEY) return { type: "error", error: "LLM key not set" };

  let p: Plan;
  try { p = await plan(message); }
  catch (e) {
    // brain down: buys still work via the real/sim rail
    if (/\b(buy|purchase|get|fetch|price|rate|quote)\b/i.test(message)) return doBuy(message);
    return { type: "error", error: `planner unreachable (${(e as Error).message})` };
  }

  if (p.action === "buy") return doBuy(message);

  // 2. retrieve (multi-query hybrid)
  const queries = [message, ...p.queries, p.hyde].filter(Boolean);
  let hits: Hit[];
  try { hits = await hybridRetrieve(queries, 8); }
  catch (e) { return { type: "error", error: `retrieval failed (${(e as Error).message})` }; }

  // 3. rerank → top 4
  let top = await rerank(message, hits, 4);

  // 5+6. answer; if insufficient, one multi-hop retrieve with the spans/answer as a new query
  let hops = 1;
  let a: Answer;
  try { a = await answer(message, top); }
  catch (e) { return { type: "error", error: `answer failed (${(e as Error).message})` }; }

  if (!a.sufficient && hops < 2) {
    hops++;
    try {
      const more = await hybridRetrieve([message, a.answer], 8);
      const merged = dedupe([...top, ...more]).slice(0, 10);
      top = await rerank(message, merged, 5);
      a = await answer(message, top);
    } catch { /* keep first answer */ }
  }

  return {
    type: "answer",
    answer: a.answer,
    spans: a.spans,
    sources: [...new Set(top.map((h) => `${h.chunk.source}${h.chunk.heading ? " › " + h.chunk.heading : ""}`))].slice(0, 5),
    hops,
  };
}

function dedupe(hits: Hit[]): Hit[] {
  const seen = new Set<number>();
  return hits.filter((h) => (seen.has(h.chunk.id) ? false : (seen.add(h.chunk.id), true)));
}

async function doBuy(message: string): Promise<RagReply> {
  if (REAL_RAIL) {
    try { const r = await realBuy(message); return { type: "buy", explorer: r.explorer, buy: r }; }
    catch { /* fall through */ }
  }
  const it = buildRequest(message);
  const schema: JsonSchema = it.schema ?? SCHEMAS.gold!;
  const req: SafeBuyRequest = { ...it, schema, selectBy: wantsCheap(message) ? "price" : "trust", allowUntrusted: wantsCheap(message) };
  return { type: "buy", explorer: EXPLORER, buy: safeBuy(req) };
}

// Final-boss retrieval core for the safeBuy docs.
//
// Pipeline (assembled in lib/ragAgent.ts):
//   query → multi-query + HyDE expansion → HYBRID retrieve (BM25 + vector, RRF
//   fused) → LLM rerank → contextual compression → grounded answer w/ spans.
//
// This module owns the index + hybrid retrieval. It is dependency-free apart
// from the embeddings call, and caches the embedded corpus at module scope so
// the index is built once per serverless instance.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const TR_BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.aicredits.in/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";
const CONTENT_DIR = join(process.cwd(), "content");

export interface Chunk {
  id: number;
  source: string;
  heading: string; // heading path for context
  text: string;
  embedding: number[];
  tokens: string[]; // for BM25
}

export interface Hit {
  chunk: Chunk;
  score: number;
  via: string; // "vector" | "bm25" | "rrf"
}

let cache: Promise<Index> | null = null;

// ---------- embeddings ----------
async function embed(inputs: string[]): Promise<number[][]> {
  const key = process.env.TOKENROUTER_API_KEY;
  if (!key) throw new Error("TOKENROUTER_API_KEY not set");
  const r = await fetch(`${TR_BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { data: { embedding: number[] }[] };
  return j.data.map((d) => d.embedding);
}
export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0]!;
}

// ---------- chunking: heading-path prefix + sliding overlap ----------
function chunkMarkdown(text: string, source: string): { source: string; heading: string; text: string }[] {
  const lines = text.split("\n");
  const out: { source: string; heading: string; text: string }[] = [];
  const headingStack: string[] = [];
  let buf: string[] = [];
  const MAX = 850;
  const OVERLAP = 180;

  const flush = () => {
    const body = buf.join("\n").trim();
    if (!body) return;
    const heading = headingStack.join(" › ");
    // sliding window over the block if it's long
    if (body.length <= MAX) {
      out.push({ source, heading, text: body });
    } else {
      for (let i = 0; i < body.length; i += MAX - OVERLAP) {
        out.push({ source, heading, text: body.slice(i, i + MAX) });
        if (i + MAX >= body.length) break;
      }
    }
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const depth = m[1]!.length;
      headingStack.splice(depth - 1);
      headingStack[depth - 1] = m[2]!.trim();
      continue;
    }
    buf.push(line);
    if (buf.join("\n").length >= MAX) flush();
  }
  flush();
  return out;
}

// ---------- BM25 ----------
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((t) => !STOP.has(t));
}
const STOP = new Set("the a an and or of to in is are be for on with as by it this that at from".split(" "));

interface Bm25 {
  df: Map<string, number>;
  avgdl: number;
  N: number;
}
function buildBm25(chunks: Chunk[]): Bm25 {
  const df = new Map<string, number>();
  let totalLen = 0;
  for (const c of chunks) {
    totalLen += c.tokens.length;
    for (const t of new Set(c.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { df, avgdl: totalLen / Math.max(1, chunks.length), N: chunks.length };
}
function bm25Score(qTokens: string[], chunk: Chunk, bm: Bm25, k1 = 1.5, b = 0.75): number {
  const tf = new Map<string, number>();
  for (const t of chunk.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const q of qTokens) {
    const f = tf.get(q);
    if (!f) continue;
    const idf = Math.log(1 + (bm.N - (bm.df.get(q) ?? 0) + 0.5) / ((bm.df.get(q) ?? 0) + 0.5));
    score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * chunk.tokens.length) / bm.avgdl)));
  }
  return score;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---------- index ----------
interface Index {
  chunks: Chunk[];
  bm25: Bm25;
}
async function build(): Promise<Index> {
  const files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md"));
  const raw: { source: string; heading: string; text: string }[] = [];
  for (const f of files) raw.push(...chunkMarkdown(await readFile(join(CONTENT_DIR, f), "utf8"), f));
  const chunks: Chunk[] = [];
  for (let i = 0; i < raw.length; i += 32) {
    const batch = raw.slice(i, i + 32);
    const embs = await embed(batch.map((c) => `${c.heading}\n${c.text}`));
    batch.forEach((c, j) =>
      chunks.push({ id: chunks.length, source: c.source, heading: c.heading, text: c.text, embedding: embs[j]!, tokens: tokenize(`${c.heading} ${c.text}`) }),
    );
  }
  return { chunks, bm25: buildBm25(chunks) };
}
export function index(): Promise<Index> {
  if (!cache) cache = build().catch((e) => { cache = null; throw e; });
  return cache;
}

// ---------- hybrid retrieve: BM25 + vector, fused with Reciprocal Rank Fusion ----------
export async function hybridRetrieve(queries: string[], k = 8): Promise<Hit[]> {
  const { chunks, bm25 } = await index();
  // embed all query variants once
  const qEmbs = await embed(queries);
  const qToks = queries.map(tokenize);

  // per-variant ranked lists for each modality
  const rankLists: number[][] = []; // each = chunk ids best→worst
  for (let v = 0; v < queries.length; v++) {
    const vec = chunks.map((c) => ({ id: c.id, s: cosine(qEmbs[v]!, c.embedding) })).sort((a, b) => b.s - a.s).map((x) => x.id);
    const kw = chunks.map((c) => ({ id: c.id, s: bm25Score(qToks[v]!, c, bm25) })).sort((a, b) => b.s - a.s).map((x) => x.id);
    rankLists.push(vec, kw);
  }
  // Reciprocal Rank Fusion across all lists
  const RRF_K = 60;
  const fused = new Map<number, number>();
  for (const list of rankLists) {
    list.forEach((id, rank) => fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  return [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id, score]) => ({ chunk: chunks[id]!, score, via: "rrf" }));
}

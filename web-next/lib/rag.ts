// Lightweight RAG over the project docs. Reads markdown from /content, chunks
// it, embeds each chunk once (cached at module scope), and retrieves the most
// relevant chunks for a query via cosine similarity. No vector DB — the corpus
// is tiny (a few docs), so an in-memory index is plenty for the demo.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const TR_BASE = process.env.TOKENROUTER_BASE_URL ?? "https://api.aicredits.in/v1";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";
const CONTENT_DIR = join(process.cwd(), "content");

export interface Chunk {
  source: string;
  text: string;
  embedding: number[];
}

let cache: Promise<Chunk[]> | null = null;

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

// split a markdown doc into ~heading-aware chunks of bounded size
function chunkMarkdown(text: string, source: string, max = 900): { source: string; text: string }[] {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: { source: string; text: string }[] = [];
  let buf = "";
  let heading = "";
  for (const b of blocks) {
    if (/^#{1,6}\s/.test(b)) heading = b.replace(/^#+\s/, "");
    if ((buf + "\n\n" + b).length > max && buf) {
      chunks.push({ source, text: (heading ? `[${heading}]\n` : "") + buf });
      buf = b;
    } else {
      buf = buf ? buf + "\n\n" + b : b;
    }
  }
  if (buf) chunks.push({ source, text: (heading ? `[${heading}]\n` : "") + buf });
  return chunks;
}

async function build(): Promise<Chunk[]> {
  const files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".md"));
  const raw: { source: string; text: string }[] = [];
  for (const f of files) {
    const text = await readFile(join(CONTENT_DIR, f), "utf8");
    raw.push(...chunkMarkdown(text, f));
  }
  // embed in batches of 32
  const out: Chunk[] = [];
  for (let i = 0; i < raw.length; i += 32) {
    const batch = raw.slice(i, i + 32);
    const embs = await embed(batch.map((c) => c.text));
    batch.forEach((c, j) => out.push({ ...c, embedding: embs[j]! }));
  }
  return out;
}

export function index(): Promise<Chunk[]> {
  if (!cache) cache = build().catch((e) => {
    cache = null; // allow retry on next request
    throw e;
  });
  return cache;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function retrieve(query: string, k = 4): Promise<{ source: string; text: string; score: number }[]> {
  const chunks = await index();
  const [qe] = await embed([query]);
  return chunks
    .map((c) => ({ source: c.source, text: c.text, score: cosine(qe!, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

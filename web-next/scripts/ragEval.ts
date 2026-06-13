// RAG eval harness. Hits a live /api/agent and scores answers against a small
// gold set: did it ground in the expected source file, and does the answer
// contain the expected key fact? Reports recall + grounding hit-rate.
//
// Run: AGENT_URL=http://187.127.137.136:8090/api/agent bun run scripts/ragEval.ts

const URL = process.env.AGENT_URL ?? "http://localhost:3000/api/agent";

interface Case { q: string; expectSource: string; expectAny: string[] }
const CASES: Case[] = [
  { q: "How does the bond slash refund work without a trusted arbiter?", expectSource: "SKILL.md", expectAny: ["sign", "on-chain", "schema", "arbiter"] },
  { q: "What is x402 and how is payment settled?", expectSource: "", expectAny: ["EIP-3009", "authorization", "facilitator"] },
  { q: "What reputation standard does safeBuy use?", expectSource: "", expectAny: ["ERC-8004", "reputation"] },
  { q: "What chain does this run on?", expectSource: "LIVE_DEPLOYMENT.md", expectAny: ["Pharos", "Atlantic", "688689"] },
  { q: "What happens when a provider delivers junk data?", expectSource: "", expectAny: ["refund", "slash", "verify", "schema"] },
  { q: "How do I run the MCP server?", expectSource: "", expectAny: ["mcp", "4030", "bun"] },
];

function norm(s: string) { return s.toLowerCase(); }

let grounded = 0, factual = 0, ok = 0;
for (const c of CASES) {
  try {
    const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: c.q }), signal: AbortSignal.timeout(120000) });
    const d = (await r.json()) as { type?: string; answer?: string; sources?: string[] };
    const ans = norm(d.answer ?? "");
    const srcOk = !c.expectSource || (d.sources ?? []).some((s) => s.includes(c.expectSource));
    const factOk = c.expectAny.some((k) => ans.includes(norm(k)));
    if (d.type === "answer") ok++;
    if (srcOk) grounded++;
    if (factOk) factual++;
    console.log(`${factOk && srcOk ? "✓" : "✗"}  ${c.q}`);
    console.log(`    grounded=${srcOk} factual=${factOk} sources=${(d.sources ?? []).slice(0, 2).join(" | ")}`);
  } catch (e) {
    console.log(`✗  ${c.q}  → ${(e as Error).message}`);
  }
}
const n = CASES.length;
console.log(`\nanswered ${ok}/${n} · grounded ${grounded}/${n} (${Math.round((100 * grounded) / n)}%) · factual ${factual}/${n} (${Math.round((100 * factual) / n)}%)`);

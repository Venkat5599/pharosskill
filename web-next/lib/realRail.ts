// Real on-chain rail bridge. When MCP_URL is set (VPS deploy), the website's
// buys are settled by the live safeBuy MCP server — the SAME verified rail that
// does real x402 EIP-3009 settlement + bond-slash refunds on Pharos Atlantic.
// Without MCP_URL (e.g. Vercel) the caller falls back to the simulated rail.
//
// This makes the website a real on-chain client, not an offline mock: one click
// → real reputation read → real settlement tx → real refund on a scam.

import { wantsCheap } from "@/lib/safeBuy";

export const REAL_RAIL = Boolean(process.env.MCP_URL);

interface McpStep { kind: string; detail: string; ok?: boolean; txHash?: string }
interface McpResult {
  ok: boolean;
  real?: boolean;
  steps: McpStep[];
  provider?: { name?: string };
  paidUSDC?: number;
  txHash?: string;
  refundTxHash?: string;
  refunded?: boolean;
  reason?: string;
  error?: string;
}

// Parse the MCP Streamable-HTTP SSE response and pull the tool's structuredContent.
function parseSse(body: string): McpResult | null {
  for (const line of body.split("\n")) {
    const s = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!s) continue;
    try {
      const msg = JSON.parse(s) as { result?: { structuredContent?: McpResult; content?: { text?: string }[] } };
      const sc = msg.result?.structuredContent;
      if (sc) return sc;
      const txt = msg.result?.content?.[0]?.text;
      if (txt) return JSON.parse(txt) as McpResult;
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

export async function realBuy(message: string): Promise<{
  explorer: string;
  ok: boolean;
  real: boolean;
  steps: McpStep[];
  provider?: { name?: string };
  paidUSDC?: number;
  txHash?: string;
  refundTxHash?: string;
  refunded?: boolean;
  reason?: string;
}> {
  const url = process.env.MCP_URL!;
  const explorer = process.env.PHAROS_EXPLORER ?? "https://atlantic.pharosscan.xyz/tx/";
  const cheap = wantsCheap(message);
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: "safebuy_purchase",
      arguments: {
        query: cheap ? "cheapdata" : "trustfeed",
        maxPriceUSDC: 0.1,
        minReputation: 0.5,
        allowUntrusted: cheap, // explicit "cheapest/ignore rating" waives the gate
        schemaName: message.toLowerCase().includes("fx") || message.toLowerCase().includes("eur") ? "fx" : "gold",
      },
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110000),
  });
  const res = parseSse(await r.text());
  if (!res) throw new Error("no result from MCP rail");
  return {
    explorer,
    ok: res.ok,
    real: res.real ?? true,
    steps: res.steps ?? [],
    provider: res.provider,
    paidUSDC: res.paidUSDC,
    txHash: res.txHash,
    refundTxHash: res.refundTxHash,
    refunded: res.refunded,
    reason: res.reason ?? res.error,
  };
}

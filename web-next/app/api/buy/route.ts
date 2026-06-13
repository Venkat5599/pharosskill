import { NextResponse } from "next/server";
import { EXPLORER, planRequest, safeBuy } from "@/lib/safeBuy";
import { REAL_RAIL, realBuy } from "@/lib/realRail";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { message?: unknown } | undefined;
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    body = undefined;
  }
  const message = String(body?.message ?? "").slice(0, 200);
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  // Real on-chain rail when MCP_URL is configured (VPS). Real reputation read,
  // real x402 settlement, real bond-slash refund — same verified MCP rail.
  if (REAL_RAIL) {
    try {
      const r = await realBuy(message);
      return NextResponse.json({ brain: "real-mcp", ...r });
    } catch {
      // fall through to simulated if the rail is briefly unreachable
    }
  }

  const result = safeBuy(await planRequest(message));
  return NextResponse.json({
    explorer: EXPLORER,
    brain: process.env.TOKENROUTER_API_KEY ? "tokenrouter" : "regex",
    ...result,
  });
}

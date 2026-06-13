import { NextResponse } from "next/server";
import { atomic } from "@/lib/chain";
import { buildRequest, selectProvider } from "@/lib/safeBuy";

// Phase 1 of the real wallet rail: discover + reputation-gate + select, WITHOUT
// paying. Returns the chosen provider so the browser can sign an x402
// authorization for exactly that provider + price. Deterministic (no LLM) so it
// always agrees with /api/settle.
export const runtime = "nodejs";

export async function POST(req: Request) {
  let message = "";
  try {
    message = String(((await req.json()) as { message?: unknown }).message ?? "").slice(0, 200);
  } catch {
    /* empty */
  }
  if (!message) return NextResponse.json({ ok: false, reason: "empty message" }, { status: 400 });

  const r = buildRequest(message);
  const sel = selectProvider(r);
  if (!sel.ok) return NextResponse.json({ ok: false, reason: sel.reason, steps: sel.steps });

  const { pick } = sel;
  return NextResponse.json({
    ok: true,
    steps: sel.steps,
    pick: {
      id: pick.id,
      name: pick.name,
      agentAddress: pick.agentAddress,
      priceUSDC: pick.priceUSDC,
      valueAtomic: atomic(pick.priceUSDC).toString(),
    },
  });
}

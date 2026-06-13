import { NextResponse } from "next/server";
import { runRagAgent } from "@/lib/ragAgent";

// Node runtime: the RAG layer reads markdown from the filesystem.
export const runtime = "nodejs";
export const maxDuration = 120; // final-boss pipeline: plan + rerank + answer (+multi-hop)

export async function POST(req: Request) {
  let body: { message?: unknown } | undefined;
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    body = undefined;
  }
  const message = String(body?.message ?? "").slice(0, 400);
  if (!message) return NextResponse.json({ type: "error", error: "empty message" }, { status: 400 });

  const reply = await runRagAgent(message);
  return NextResponse.json(reply);
}

import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

// Node runtime: the RAG layer reads markdown from the filesystem.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { message?: unknown } | undefined;
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    body = undefined;
  }
  const message = String(body?.message ?? "").slice(0, 400);
  if (!message) return NextResponse.json({ type: "error", error: "empty message" }, { status: 400 });

  const reply = await runAgent(message);
  return NextResponse.json(reply);
}

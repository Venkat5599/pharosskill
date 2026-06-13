import { NextResponse } from "next/server";
import { EXPLORER, planRequest, safeBuy } from "@/lib/safeBuy";

export async function POST(req: Request) {
  let body: { message?: unknown } | undefined;
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    body = undefined;
  }
  const message = String(body?.message ?? "").slice(0, 200);
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  const result = safeBuy(await planRequest(message));
  return NextResponse.json({
    explorer: EXPLORER,
    brain: process.env.TOKENROUTER_API_KEY ? "tokenrouter" : "regex",
    ...result,
  });
}

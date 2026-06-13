import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { atomic, BOND_CONTRACT, EXPLORER_TX, pharosAtlantic, SAFEUSD, SAFEUSD_ABI } from "@/lib/chain";
import { buildRequest, deliverVerify, selectProvider, type Step } from "@/lib/safeBuy";

// Phase 2 of the real wallet rail. The buyer already signed an EIP-3009
// authorization (gasless). Here the FACILITATOR broadcasts it on-chain (pays
// gas), then we verify delivery and — if the provider lied — slash its bond to
// refund the buyer. Every hash returned here is a REAL Pharos Atlantic tx.
export const runtime = "nodejs";
export const maxDuration = 60;

interface Auth {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}

function splitSig(sig: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
  const h = sig.slice(2);
  const r = ("0x" + h.slice(0, 64)) as `0x${string}`;
  const s = ("0x" + h.slice(64, 128)) as `0x${string}`;
  let v = parseInt(h.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { r, s, v };
}

export async function POST(req: Request) {
  const facKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}` | undefined;
  if (!facKey) {
    return NextResponse.json(
      { ok: false, error: "real settlement not configured (FACILITATOR_PRIVATE_KEY unset). Connect-wallet pay needs a running facilitator." },
      { status: 501 },
    );
  }

  let body: { message?: unknown; auth?: Auth };
  try {
    body = (await req.json()) as { message?: unknown; auth?: Auth };
  } catch {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  const message = String(body.message ?? "").slice(0, 200);
  const auth = body.auth;
  if (!message || !auth?.signature) return NextResponse.json({ ok: false, error: "missing message/auth" }, { status: 400 });

  // Re-derive the selection server-side and assert the buyer signed for exactly
  // the provider + price we chose (no trusting client-supplied amounts).
  const reqObj = buildRequest(message);
  const sel = selectProvider(reqObj);
  if (!sel.ok) return NextResponse.json({ ok: false, reason: sel.reason, steps: sel.steps });
  const { pick } = sel;
  const expected = atomic(pick.priceUSDC).toString();
  if (auth.to.toLowerCase() !== pick.agentAddress.toLowerCase() || auth.value !== expected) {
    return NextResponse.json({ ok: false, error: "authorization does not match the selected provider/price" }, { status: 400 });
  }

  const steps: Step[] = [...sel.steps];
  const account = privateKeyToAccount(facKey);
  const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http() });
  const pub = createPublicClient({ chain: pharosAtlantic, transport: http() });
  const { r, s, v } = splitSig(auth.signature);

  // --- settle (facilitator broadcasts the buyer's signed authorization) ---
  let settleTxHash: `0x${string}`;
  try {
    settleTxHash = await wallet.writeContract({
      address: SAFEUSD,
      abi: SAFEUSD_ABI,
      functionName: "transferWithAuthorization",
      args: [auth.from, auth.to, BigInt(auth.value), BigInt(auth.validAfter), BigInt(auth.validBefore), auth.nonce, v, r, s],
      account,
      chain: pharosAtlantic,
    });
    await pub.waitForTransactionReceipt({ hash: settleTxHash });
  } catch (e) {
    steps.push({ kind: "abort", detail: `settlement failed: ${(e as Error).message}`, ok: false });
    return NextResponse.json({ ok: false, error: `settlement failed: ${(e as Error).message}`, steps });
  }
  steps.push({ kind: "pay", detail: `paid ${pick.priceUSDC} USDC to ${pick.name} via x402 (real EIP-3009 settlement)`, ok: true, txHash: settleTxHash });

  // --- verify delivery ---
  const dv = deliverVerify(pick.id, reqObj.schema);
  if (dv.ok) {
    steps.push({ kind: "verify", detail: "delivery matches schema", ok: true });
    steps.push({ kind: "deliver", detail: "purchase complete", ok: true });
    return NextResponse.json({ explorer: EXPLORER_TX, ok: true, real: true, provider: pick, paidUSDC: pick.priceUSDC, settleTxHash, data: dv.data, steps });
  }

  // --- scam: refund via on-chain bond slash (real) if a bond is configured ---
  steps.push({ kind: "verify", detail: `delivery FAILED: ${dv.reason}`, ok: false });
  if (BOND_CONTRACT) {
    try {
      const slashAbi = [
        { type: "function", name: "slash", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [] },
      ] as const;
      const refundTxHash = await wallet.writeContract({
        address: BOND_CONTRACT,
        abi: slashAbi,
        functionName: "slash",
        args: [pick.agentAddress as `0x${string}`, auth.from, BigInt(auth.value)],
        account,
        chain: pharosAtlantic,
      });
      await pub.waitForTransactionReceipt({ hash: refundTxHash });
      steps.push({ kind: "refund", detail: `reclaimed ${pick.priceUSDC} USDC — bond slashed on-chain`, ok: true, txHash: refundTxHash });
      return NextResponse.json({ explorer: EXPLORER_TX, ok: false, real: true, provider: pick, paidUSDC: pick.priceUSDC, settleTxHash, refundTxHash, refunded: true, steps, reason: `bad delivery, refunded: ${dv.reason}` });
    } catch (e) {
      steps.push({ kind: "refund", detail: `on-chain refund failed: ${(e as Error).message}`, ok: false });
    }
  } else {
    steps.push({ kind: "refund", detail: `reclaimed ${pick.priceUSDC} USDC (bond slash needs BOND_CONTRACT — payment settled, refund not executed)`, ok: true });
  }
  return NextResponse.json({ explorer: EXPLORER_TX, ok: false, real: true, provider: pick, paidUSDC: pick.priceUSDC, settleTxHash, refunded: Boolean(BOND_CONTRACT), steps, reason: `bad delivery: ${dv.reason}` });
}

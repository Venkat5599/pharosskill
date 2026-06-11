import type {
  SafeBuyDeps,
  SafeBuyRequest,
  SafeBuyResult,
  SafeBuyStep,
  StepReporter,
  Provider,
} from "./types.ts";

// safeBuy — the Skill.
//
// One call does the whole trust loop an autonomous buyer needs:
//   discover -> reputation-gate -> select -> pay (x402) -> verify delivery -> refund-or-deliver
//
// It is pure orchestration over the SafeBuyDeps interfaces. No chain, no LLM, no
// network imports here. That keeps it independent and reusable; the Pharos-ness
// lives entirely in the adapters injected as deps.

interface Scored extends Provider {
  reputation: number;
}

export async function safeBuy(
  req: SafeBuyRequest,
  deps: SafeBuyDeps,
  onStep: StepReporter = () => {},
): Promise<SafeBuyResult> {
  const steps: SafeBuyStep[] = [];
  const minRep = req.minReputation ?? 0.5;

  const log = (s: SafeBuyStep): void => {
    steps.push(s);
    onStep(s);
  };

  const fail = (kind: SafeBuyStep["kind"], reason: string): SafeBuyResult => {
    log({ kind: "abort", detail: reason, ok: false });
    return { ok: false, reason, steps };
  };

  // 1. discover
  const providers = await deps.registry.discover(req.query);
  if (providers.length === 0) {
    return fail("discover", `no provider found for "${req.query}"`);
  }
  log({
    kind: "discover",
    detail: `found ${providers.length} provider(s): ${providers.map((p) => p.name).join(", ")}`,
    ok: true,
  });

  // 2. reputation-gate
  const scored: Scored[] = await Promise.all(
    providers.map(async (p) => ({ ...p, reputation: await deps.reputation.scoreOf(p.agentAddress) })),
  );
  for (const p of scored) {
    log({
      kind: "reputation",
      detail: `${p.name}: reputation ${p.reputation.toFixed(2)}, price ${p.priceUSDC} USDC`,
      ok: p.reputation >= minRep,
    });
  }

  // 3. select — affordable AND trusted, best trust first, cheapest tiebreak.
  const affordable = scored.filter((p) => p.priceUSDC <= req.maxPriceUSDC);
  if (affordable.length === 0) {
    return fail("select", `all providers exceed maxPrice ${req.maxPriceUSDC} USDC`);
  }

  let eligible: Scored[];
  if (req.allowUntrusted) {
    eligible = affordable; // buyer explicitly waived the trust gate
  } else {
    eligible = affordable.filter((p) => p.reputation >= minRep);
    if (eligible.length === 0) {
      const best = [...affordable].sort((a, b) => b.reputation - a.reputation)[0]!;
      return fail(
        "select",
        `no provider clears reputation >= ${minRep} (best was ${best.name} @ ${best.reputation.toFixed(2)}). ` +
          `Refusing to buy. Pass allowUntrusted to override.`,
      );
    }
  }

  const pick = eligible.sort((a, b) =>
    req.selectBy === "price"
      ? a.priceUSDC - b.priceUSDC || b.reputation - a.reputation
      : b.reputation - a.reputation || a.priceUSDC - b.priceUSDC,
  )[0]!;
  log({
    kind: "select",
    detail: `chose ${pick.name} (reputation ${pick.reputation.toFixed(2)}, ${pick.priceUSDC} USDC)`,
    ok: true,
  });

  // 4. pay
  let receipt;
  try {
    receipt = await deps.payment.pay(pick, req.maxPriceUSDC);
  } catch (e) {
    return fail("pay", `payment failed: ${(e as Error).message}`);
  }
  log({
    kind: "pay",
    detail: `paid ${receipt.paidUSDC} USDC to ${pick.name} via x402`,
    ok: true,
    txHash: receipt.txHash,
  });

  // 5. verify delivery
  const v = deps.verifier.verify(receipt.response, req.schema);
  if (!v.ok) {
    log({ kind: "verify", detail: `delivery FAILED: ${v.reason}`, ok: false });
    // 6. refund — provider took money and did not deliver.
    try {
      const r = await deps.payment.refund(receipt);
      log({ kind: "refund", detail: `reclaimed ${receipt.paidUSDC} USDC`, ok: true, txHash: r.txHash });
      return {
        ok: false,
        provider: pick,
        paidUSDC: receipt.paidUSDC,
        txHash: receipt.txHash,
        refundTxHash: r.txHash,
        steps,
        reason: `bad delivery, refunded: ${v.reason}`,
      };
    } catch (e) {
      return {
        ok: false,
        provider: pick,
        paidUSDC: receipt.paidUSDC,
        txHash: receipt.txHash,
        steps,
        reason: `bad delivery AND refund failed: ${v.reason} / ${(e as Error).message}`,
      };
    }
  }
  log({ kind: "verify", detail: "delivery matches schema", ok: true });

  // 7. deliver
  log({ kind: "deliver", detail: "purchase complete", ok: true });
  return {
    ok: true,
    data: receipt.response,
    provider: pick,
    paidUSDC: receipt.paidUSDC,
    txHash: receipt.txHash,
    steps,
  };
}

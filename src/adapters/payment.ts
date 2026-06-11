import type { PaymentRail, PaymentReceipt, Provider } from "../skill/types.ts";
import { handlerFor } from "../demo/world.ts";

// Offline x402 rail. Simulates settlement (no real chain) and invokes the
// provider's handler to get the "delivered" body. Produces fake but
// well-formed tx hashes so the chat demo has clickable receipts.
function fakeTx(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return "0x" + h.toString(16).padStart(8, "0").repeat(8);
}

export const localX402Rail: PaymentRail = {
  async pay(provider: Provider, maxPriceUSDC: number): Promise<PaymentReceipt> {
    if (provider.priceUSDC > maxPriceUSDC) {
      throw new Error(`price ${provider.priceUSDC} exceeds max ${maxPriceUSDC}`);
    }
    const handler = handlerFor(provider.id);
    if (!handler) throw new Error(`no endpoint for ${provider.id}`);
    return {
      txHash: fakeTx("pay:" + provider.id + ":" + Date.now()),
      paidUSDC: provider.priceUSDC,
      response: handler(),
    };
  },

  async refund(receipt: PaymentReceipt): Promise<{ txHash: string }> {
    return { txHash: fakeTx("refund:" + receipt.txHash) };
  },
};

import type { PaymentRail, PaymentReceipt, Provider } from "../skill/types.ts";
import { PHAROS_NETWORK } from "../pharos/config.ts";

// Real Pharos x402 client rail (USE_PHAROS=1). Pays a provider's x402-protected
// endpoint on Pharos Atlantic testnet via EIP-3009 transferWithAuthorization.
// The payer signs an authorization (gasless); the facilitator broadcasts it.
//
//   chainId 688689 · rpc atlantic.dplabs-internal.com · USDC 0xE0BE…564ec8
//
// Needs: PAYER_PRIVATE_KEY holding test USDC, and a reachable facilitator.

export interface PharosX402Config {
  payerPrivateKey: `0x${string}`;
}

export function pharosX402Rail(cfg: PharosX402Config): PaymentRail {
  return {
    async pay(provider: Provider, maxPriceUSDC: number): Promise<PaymentReceipt> {
      if (provider.priceUSDC > maxPriceUSDC) {
        throw new Error(`price ${provider.priceUSDC} exceeds max ${maxPriceUSDC}`);
      }

      const { privateKeyToAccount } = await import("viem/accounts");
      const { x402Client } = await import("@x402/core/client");
      const { ExactEvmScheme } = await import("@x402/evm/exact/client");
      const { toClientEvmSigner } = await import("@x402/evm");
      const { wrapFetchWithPayment, decodePaymentResponseHeader } = await import("@x402/fetch");

      const account = privateKeyToAccount(cfg.payerPrivateKey);
      const signer = toClientEvmSigner(account);
      const client = new x402Client().register(PHAROS_NETWORK, new ExactEvmScheme(signer));
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);

      const res = await fetchWithPayment(provider.endpoint);
      if (!res.ok) throw new Error(`provider returned HTTP ${res.status}`);

      // Settlement receipt rides back in the v2 PAYMENT-RESPONSE header
      // (v1 used X-PAYMENT-RESPONSE). Decode it to get the on-chain tx hash.
      let txHash = "0x";
      const hdr = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
      if (hdr) {
        try {
          const decoded = decodePaymentResponseHeader(hdr) as {
            transaction?: string;
            txHash?: string;
          };
          txHash = decoded.transaction ?? decoded.txHash ?? "0x";
        } catch {
          /* header shape drift — leave default */
        }
      }
      const response = await res.json().catch(() => null);
      return { txHash, paidUSDC: provider.priceUSDC, response };
    },

    async refund(receipt: PaymentReceipt): Promise<{ txHash: string }> {
      // x402 settlement is final. A real refund is a claim against the provider's
      // staked bond in the safeBuy settlement contract (next milestone). Until
      // that contract is deployed, surface the limitation honestly.
      throw new Error(
        `on-chain refund requires the safeBuy settlement contract (provider stake); ` +
          `not yet deployed. paid tx: ${receipt.txHash}`,
      );
    },
  };
}

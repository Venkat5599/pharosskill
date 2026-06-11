import type { PaymentRail, PaymentReceipt, Provider } from "../skill/types.ts";
import { PHAROS_NETWORK, PHAROS_RPC, USDC_DECIMALS, pharosAtlantic } from "../pharos/config.ts";

// Real Pharos x402 client rail (USE_PHAROS=1). Pays a provider's x402-protected
// endpoint on Pharos Atlantic testnet via EIP-3009 transferWithAuthorization.
// The payer signs an authorization (gasless); the facilitator broadcasts it.
//
//   chainId 688689 · rpc atlantic.dplabs-internal.com
//
// Refund is a REAL on-chain slash of the provider's bond (SafeBuyBond) when a
// bond contract is configured; the payer acts as arbiter.
//
// Needs: PAYER_PRIVATE_KEY holding the settlement token, and a reachable facilitator.

export interface PharosX402Config {
  payerPrivateKey: `0x${string}`;
  /** SafeBuyBond address. If set, refund() slashes the provider's stake on-chain. */
  bondContract?: `0x${string}`;
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
      return { txHash, paidUSDC: provider.priceUSDC, response, providerAgent: provider.agentAddress };
    },

    async refund(receipt: PaymentReceipt): Promise<{ txHash: string }> {
      // Real on-chain refund: slash the provider's bond to make the buyer whole.
      if (!cfg.bondContract) {
        throw new Error("no bond contract configured; cannot refund on-chain");
      }
      if (!receipt.providerAgent) throw new Error("receipt missing providerAgent");

      const { privateKeyToAccount } = await import("viem/accounts");
      const { createWalletClient, createPublicClient, http, parseUnits } = await import("viem");
      const account = privateKeyToAccount(cfg.payerPrivateKey);
      const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http(PHAROS_RPC) });
      const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

      const abi = [
        {
          type: "function",
          name: "slash",
          stateMutability: "nonpayable",
          inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }],
          outputs: [],
        },
      ] as const;
      const amount = parseUnits(receipt.paidUSDC.toString(), USDC_DECIMALS);
      const hash = await wallet.writeContract({
        address: cfg.bondContract,
        abi,
        functionName: "slash",
        args: [receipt.providerAgent as `0x${string}`, account.address, amount],
        account,
        chain: pharosAtlantic,
      });
      await pub.waitForTransactionReceipt({ hash });
      return { txHash: hash };
    },
  };
}

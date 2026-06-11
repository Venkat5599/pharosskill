// Pharos Atlantic testnet — single source of truth for the real x402 wiring.
import { defineChain } from "viem";

export const PHAROS_CHAIN_ID = 688689;
export const PHAROS_NETWORK = `eip155:${PHAROS_CHAIN_ID}` as const;
export const PHAROS_RPC = process.env.PHAROS_RPC ?? "https://atlantic.dplabs-internal.com/";
// Default = our deployed EIP-3009 SafeUSD on Atlantic (Pharos USDC has no
// faucet/EIP-3009). Override with TEST_USDC to use a different token.
export const TEST_USDC = (process.env.TEST_USDC ??
  "0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d") as `0x${string}`;
export const TOKEN_NAME = process.env.SUSD_NAME ?? "SafeUSD";
export const TOKEN_VERSION = process.env.SUSD_VERSION ?? "1";
export const USDC_DECIMALS = 6;
export const EXPLORER_TX = process.env.PHAROS_EXPLORER ?? "https://testnet.pharosscan.xyz/tx/";

export const pharosAtlantic = defineChain({
  id: PHAROS_CHAIN_ID,
  name: "Pharos Atlantic Testnet",
  nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
  rpcUrls: { default: { http: [PHAROS_RPC] } },
  testnet: true,
});

export function usdcAmount(human: number): string {
  return Math.round(human * 10 ** USDC_DECIMALS).toString();
}

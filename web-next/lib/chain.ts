// Pharos Atlantic + SafeUSD constants shared by the client wallet signer and the
// server settle/refund endpoints. SafeUSD is the deployed EIP-3009 token
// (contracts/SafeUSD.sol). Public values are safe to ship to the browser.

import { defineChain } from "viem";

export const PHAROS_CHAIN_ID = 688689;
export const PHAROS_CHAIN_HEX = "0xa8231"; // 688689
export const PHAROS_RPC = process.env.PHAROS_RPC ?? "https://atlantic.dplabs-internal.com/";
export const SAFEUSD = (process.env.TEST_USDC ?? "0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d") as `0x${string}`;
export const TOKEN_NAME = process.env.SUSD_NAME ?? "SafeUSD";
export const TOKEN_VERSION = process.env.SUSD_VERSION ?? "1";
export const USDC_DECIMALS = 6;
export const EXPLORER_TX = process.env.PHAROS_EXPLORER ?? "https://atlantic.pharosscan.xyz/tx/";
export const BOND_CONTRACT = (process.env.BOND_CONTRACT ?? "") as `0x${string}` | "";

export const pharosAtlantic = defineChain({
  id: PHAROS_CHAIN_ID,
  name: "Pharos Atlantic Testnet",
  nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
  rpcUrls: { default: { http: [PHAROS_RPC] } },
  testnet: true,
});

/** human USDC -> atomic (6dp) string */
export function atomic(human: number): bigint {
  return BigInt(Math.round(human * 10 ** USDC_DECIMALS));
}

export const SAFEUSD_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

"use client";

// Browser wallet rail for real x402 settlement. The BUYER connects their wallet
// and signs an EIP-3009 TransferWithAuthorization (gasless — no tx, no gas).
// The signed authorization goes to /api/settle, where the facilitator broadcasts
// it. The buyer never hands over a key and never pays gas.

import { PHAROS_CHAIN_HEX, PHAROS_CHAIN_ID, PHAROS_RPC, SAFEUSD, TOKEN_NAME, TOKEN_VERSION } from "@/lib/chain";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...a: unknown[]) => void): void;
}
function eth(): Eip1193 {
  const e = (globalThis as { ethereum?: Eip1193 }).ethereum;
  if (!e) throw new Error("No wallet found. Install MetaMask (or any EIP-1193 wallet).");
  return e;
}

export function hasWallet(): boolean {
  return typeof globalThis !== "undefined" && Boolean((globalThis as { ethereum?: unknown }).ethereum);
}

export async function connect(): Promise<string> {
  const accts = (await eth().request({ method: "eth_requestAccounts" })) as string[];
  if (!accts?.length) throw new Error("No account authorized");
  await ensureChain();
  return accts[0]!;
}

export async function ensureChain(): Promise<void> {
  try {
    await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: PHAROS_CHAIN_HEX }] });
  } catch (e) {
    // 4902 = chain not added to the wallet yet
    if ((e as { code?: number }).code === 4902) {
      await eth().request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: PHAROS_CHAIN_HEX,
            chainName: "Pharos Atlantic Testnet",
            nativeCurrency: { name: "Pharos", symbol: "PHRS", decimals: 18 },
            rpcUrls: [PHAROS_RPC],
            blockExplorerUrls: ["https://atlantic.pharosscan.xyz"],
          },
        ],
      });
    } else throw e;
  }
}

export interface SignedAuth {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string; // atomic, as string (uint256)
  validAfter: number;
  validBefore: number;
  nonce: `0x${string}`;
  signature: `0x${string}`;
}

function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/** Sign an EIP-3009 authorization to pay `to` `valueAtomic` SafeUSD. Gasless. */
export async function signAuthorization(from: string, to: string, valueAtomic: string): Promise<SignedAuth> {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now - 60;
  const validBefore = now + 3600;
  const nonce = randomNonce();

  const typedData = {
    domain: { name: TOKEN_NAME, version: TOKEN_VERSION, chainId: PHAROS_CHAIN_ID, verifyingContract: SAFEUSD },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from, to, value: valueAtomic, validAfter, validBefore, nonce },
  };

  const signature = (await eth().request({
    method: "eth_signTypedData_v4",
    params: [from, JSON.stringify(typedData)],
  })) as `0x${string}`;

  return { from: from as `0x${string}`, to: to as `0x${string}`, value: valueAtomic, validAfter, validBefore, nonce, signature };
}

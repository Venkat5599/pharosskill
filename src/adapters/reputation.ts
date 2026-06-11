import type { ReputationOracle } from "../skill/types.ts";
import { REPUTATION } from "../demo/world.ts";

// Offline reputation: seeded scores standing in for an ERC-8004 Reputation
// Registry on Pharos.
export const inMemoryReputation: ReputationOracle = {
  async scoreOf(agentAddress: string): Promise<number> {
    return REPUTATION[agentAddress] ?? 0; // unknown agent == untrusted
  },
};

// --- Real Pharos / ERC-8004 reader (used when USE_PHAROS=1) -----------------
// ERC-8004 exposes a Reputation Registry; here we read an aggregate score for an
// agent and normalize to [0,1]. Address + ABI are wired once the registry is
// deployed on Atlantic testnet. Kept behind a factory so the offline demo never
// imports a chain client.
export function erc8004Reputation(opts: {
  rpcUrl: string;
  registryAddress: `0x${string}`;
}): ReputationOracle {
  return {
    async scoreOf(agentAddress: string): Promise<number> {
      const { createPublicClient, http } = await import("viem");
      const client = createPublicClient({ transport: http(opts.rpcUrl) });
      // Minimal ABI: scoreOf(address) -> uint256 (basis points, 0..10000).
      const abi = [
        {
          type: "function",
          name: "scoreOf",
          stateMutability: "view",
          inputs: [{ name: "agent", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
        },
      ] as const;
      const bps = (await client.readContract({
        address: opts.registryAddress,
        abi,
        functionName: "scoreOf",
        args: [agentAddress as `0x${string}`],
      })) as bigint;
      return Math.min(1, Number(bps) / 10000);
    },
  };
}

import type { Provider, ProviderRegistry } from "../skill/types.ts";
import { discoverFromWorld } from "../demo/world.ts";

// In-memory provider registry for the offline demo. In production this reads a
// Pharos on-chain registry (or an x402 directory) of agents offering services.
export const inMemoryRegistry: ProviderRegistry = {
  async discover(query: string): Promise<Provider[]> {
    return discoverFromWorld(query).map(({ handler, ...p }) => p);
  },
};

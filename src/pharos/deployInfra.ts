import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import solc from "solc";
import {
  createWalletClient,
  createPublicClient,
  http,
  publicActions,
  parseUnits,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pharosAtlantic, PHAROS_RPC, TEST_USDC } from "./config.ts";
import { WORLD, REPUTATION } from "../demo/world.ts";

// Deploy the live trust infra to Pharos Atlantic, then seed it:
//   ReputationRegistry  -> ERC-8004-style scoreOf() for safeBuy's reputation gate
//   SafeBuyBond         -> provider stake; arbiter slashes to refund the buyer
// Seeds on-chain reputation for every provider and stakes the scammer's bond.
//
// Run: PAYER_PRIVATE_KEY=0x... bun run src/pharos/deployInfra.ts

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");

const pk = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) {
  console.error("set PAYER_PRIVATE_KEY");
  process.exit(1);
}

function compile(file: string, name: string) {
  const input = {
    language: "Solidity",
    sources: { [file]: { content: readFileSync(resolve(contractsDir, file), "utf8") } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errs.length) {
    console.error(errs.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
    process.exit(1);
  }
  const a = out.contracts[file][name];
  return { abi: a.abi, bytecode: ("0x" + a.evm.bytecode.object) as `0x${string}` };
}

const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http(PHAROS_RPC) }).extend(publicActions);
const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

async function deploy(file: string, name: string, args: unknown[] = []) {
  const { abi, bytecode } = compile(file, name);
  const hash = await wallet.deployContract({ abi, bytecode, account, chain: pharosAtlantic, args });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(` ${name} @ ${r.contractAddress}  (tx ${hash})`);
  return { address: r.contractAddress!, abi };
}

// 1. Reputation registry + seed scores
const rep = await deploy("ReputationRegistry.sol", "ReputationRegistry");
const repC: any = getContract({ address: rep.address, abi: rep.abi, client: wallet });
const agents = WORLD.map((p) => p.agentAddress);
const bps = WORLD.map((p) => Math.round((REPUTATION[p.agentAddress] ?? 0) * 10000));
const setHash = await repC.write.setScores([agents, bps]);
await pub.waitForTransactionReceipt({ hash: setHash });
console.log("   seeded reputation:", WORLD.map((p, i) => `${p.name}=${bps[i]}bps`).join(", "));

// 2. Bond contract (arbiter = this agent) + stake the scammer's collateral
const bond = await deploy("SafeBuyBond.sol", "SafeBuyBond", [TEST_USDC, account.address]);
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const token: any = getContract({ address: TEST_USDC, abi: erc20Abi, client: wallet });
const bondAmount = parseUnits("1", 6);
await pub.waitForTransactionReceipt({ hash: await token.write.approve([bond.address, bondAmount]) });
const scammer = WORLD.find((p) => p.id === "cheapscam")!.agentAddress;
const bondC: any = getContract({ address: bond.address, abi: bond.abi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await bondC.write.stakeFor([scammer, bondAmount]) });
console.log(`   staked 1 sUSD bond for scammer ${scammer}`);

console.log("\nAdd to .env:");
console.log(`REPUTATION_REGISTRY=${rep.address}`);
console.log(`BOND_CONTRACT=${bond.address}`);

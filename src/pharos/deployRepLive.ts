import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http, publicActions, parseUnits, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pharosAtlantic, PHAROS_RPC, TEST_USDC } from "./config.ts";

// Deploy a live ReputationRegistry and seed two DISTINCT provider scores so the
// safeBuy reputation-gate is a real on-chain read:
//   honest provider -> 9200 bps (0.92)   scam provider -> 1800 bps (0.18)
// Also stakes a bond for the scam provider on the existing SafeBuyBond so the
// allowUntrusted refund path works against the new scam address.
// All txs paid by FACILITATOR_PRIVATE_KEY (the funded wallet + registry owner).

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");
const facKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
const HONEST = process.env.HONEST_ADDR as `0x${string}`;
const SCAM = process.env.SCAM_ADDR as `0x${string}`;
const BOND = process.env.BOND_CONTRACT as `0x${string}`;
if (!facKey || !HONEST || !SCAM || !BOND) { console.error("set FACILITATOR_PRIVATE_KEY HONEST_ADDR SCAM_ADDR BOND_CONTRACT"); process.exit(1); }

function compile(file: string, name: string) {
  const input = { language: "Solidity", sources: { [file]: { content: readFileSync(resolve(contractsDir, file), "utf8") } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errs.length) { console.error(errs.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n")); process.exit(1); }
  const a = out.contracts[file][name];
  return { abi: a.abi, bytecode: ("0x" + a.evm.bytecode.object) as `0x${string}` };
}

const account = privateKeyToAccount(facKey);
const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http(PHAROS_RPC) }).extend(publicActions);
const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

// 1. deploy + seed reputation
const { abi, bytecode } = compile("ReputationRegistry.sol", "ReputationRegistry");
const depHash = await wallet.deployContract({ abi, bytecode, account, chain: pharosAtlantic, args: [] });
const reg = (await pub.waitForTransactionReceipt({ hash: depHash })).contractAddress!;
console.log("ReputationRegistry @", reg, "tx", depHash);
const regC: any = getContract({ address: reg, abi, client: wallet });
const seedHash = await regC.write.setScores([[HONEST, SCAM], [9200n, 1800n]]);
await pub.waitForTransactionReceipt({ hash: seedHash });
console.log(`seeded: honest ${HONEST}=9200bps, scam ${SCAM}=1800bps  tx ${seedHash}`);

// 2. stake a bond for the scam provider (so allowUntrusted refund works)
const stake = parseUnits("1", 6);
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const bondAbi = [{ type: "function", name: "stakeFor", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] }] as const;
const token: any = getContract({ address: TEST_USDC, abi: tokenAbi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await token.write.mint([account.address, stake]) });
await pub.waitForTransactionReceipt({ hash: await token.write.approve([BOND, stake]) });
const bondC: any = getContract({ address: BOND, abi: bondAbi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await bondC.write.stakeFor([SCAM, stake]) });
console.log("staked 1 sUSD bond for scam", SCAM);

console.log("\nREPUTATION_REGISTRY=" + reg);

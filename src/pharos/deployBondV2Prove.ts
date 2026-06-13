import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http, publicActions, parseUnits, getContract, keccak256, toBytes, hexToSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pharosAtlantic, PHAROS_RPC, TEST_USDC } from "./config.ts";

// Deploy SafeBuyBondV2 (trustless slash) and PROVE the property on-chain:
//   A) provider-signed BAD delivery (missing required field) -> slash succeeds, buyer refunded (real tx)
//   B) provider-signed GOOD delivery (has required field)    -> slash REVERTS (honest provider safe, no arbiter)
//
// Run: FACILITATOR_PRIVATE_KEY=.. SCAM_KEY=.. HONEST_KEY=.. BUYER_ADDR=.. bun run src/pharos/deployBondV2Prove.ts

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");
const facKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
const scamKey = process.env.SCAM_KEY as `0x${string}`;
const honestKey = process.env.HONEST_KEY as `0x${string}`;
const buyer = process.env.BUYER_ADDR as `0x${string}`;
if (!facKey || !scamKey || !honestKey || !buyer) { console.error("set FACILITATOR_PRIVATE_KEY SCAM_KEY HONEST_KEY BUYER_ADDR"); process.exit(1); }

function compile(file: string, name: string) {
  const input = { language: "Solidity", sources: { [file]: { content: readFileSync(resolve(contractsDir, file), "utf8") } },
    settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errs.length) { console.error(errs.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n")); process.exit(1); }
  const a = out.contracts[file][name];
  return { abi: a.abi, bytecode: ("0x" + a.evm.bytecode.object) as `0x${string}` };
}

const fac = privateKeyToAccount(facKey);
const scam = privateKeyToAccount(scamKey);
const honest = privateKeyToAccount(honestKey);
const wallet = createWalletClient({ account: fac, chain: pharosAtlantic, transport: http(PHAROS_RPC) }).extend(publicActions);
const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

// provider signs keccak256(response) via EIP-191 personal_sign
async function signDelivery(acct: typeof scam, response: string) {
  const digest = keccak256(toBytes(response));
  const sig = await acct.signMessage({ message: { raw: digest } });
  const { v, r, s } = hexToSignature(sig);
  return { v: Number(v), r, s };
}

const { abi, bytecode } = compile("SafeBuyBondV2.sol", "SafeBuyBondV2");
const depHash = await wallet.deployContract({ abi, bytecode, account: fac, chain: pharosAtlantic, args: [TEST_USDC] });
const bond = (await pub.waitForTransactionReceipt({ hash: depHash })).contractAddress!;
console.log("SafeBuyBondV2 @", bond, "tx", depHash);

// stake 1 sUSD bond for the scam provider (mint -> approve -> stakeFor)
const stake = parseUnits("1", 6);
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const token: any = getContract({ address: TEST_USDC, abi: tokenAbi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await token.write.mint([fac.address, stake]) });
await pub.waitForTransactionReceipt({ hash: await token.write.approve([bond, stake]) });
const bondC: any = getContract({ address: bond, abi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await bondC.write.stakeFor([scam.address, stake]) });
console.log("staked 1 sUSD for scam provider", scam.address);

const amount = parseUnits("0.01", 6);

// A) scam-signed BAD delivery -> slash should SUCCEED (real on-chain refund)
const bad = JSON.stringify({ lol: "gimme more money" });
const bs = await signDelivery(scam, bad);
const slashHash = await bondC.write.slashWithProof([scam.address, buyer, amount, bad, "asset", bs.v, bs.r, bs.s]);
const sr = await pub.waitForTransactionReceipt({ hash: slashHash });
console.log("A) bad delivery slash →", sr.status, "tx", slashHash);

// B) honest-signed GOOD delivery -> slash must REVERT (contract protects honest provider)
const good = JSON.stringify({ asset: "XAU", priceUSD: 2387.41 });
const gs = await signDelivery(honest, good);
let reverted = false;
try {
  await pub.simulateContract({ address: bond, abi, functionName: "slashWithProof", args: [honest.address, buyer, amount, good, "asset", gs.v, gs.r, gs.s], account: fac });
} catch (e) {
  reverted = true;
  console.log("B) good delivery slash → REVERTED as expected:", (e as Error).message.split("\n")[0]);
}
if (!reverted) console.log("B) UNEXPECTED: good delivery slash did not revert");

console.log("\nBOND_V2=" + bond);

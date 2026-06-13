import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import solc from "solc";
import { createWalletClient, createPublicClient, http, publicActions, parseUnits, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pharosAtlantic, PHAROS_RPC, TEST_USDC } from "./config.ts";

// Deploy SafeBuyBond live and wire it for the running MCP scam→refund demo.
// All txs are paid by FACILITATOR_PRIVATE_KEY (the only funded wallet).
//   arbiter   = PAYER address (the rail signs slash() with the payer key)
//   provider  = the MCP provider's payTo address (its bond gets slashed)
// Funds the payer with a little PHRS so it can later broadcast slash().
//
// Run: FACILITATOR_PRIVATE_KEY=0x.. PAYER_ADDRESS=0x.. PROVIDER_ADDR=0x.. bun run src/pharos/deployBondLive.ts

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(here, "../../contracts");

const facKey = process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`;
const payer = process.env.PAYER_ADDRESS as `0x${string}`;
const provider = process.env.PROVIDER_ADDR as `0x${string}`;
if (!facKey || !payer || !provider) {
  console.error("set FACILITATOR_PRIVATE_KEY, PAYER_ADDRESS, PROVIDER_ADDR");
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
  if (errs.length) { console.error(errs.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n")); process.exit(1); }
  const a = out.contracts[file][name];
  return { abi: a.abi, bytecode: ("0x" + a.evm.bytecode.object) as `0x${string}` };
}

const account = privateKeyToAccount(facKey);
const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http(PHAROS_RPC) }).extend(publicActions);
const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

// 1. fund payer with gas so it can broadcast slash()
const fundHash = await wallet.sendTransaction({ account, chain: pharosAtlantic, to: payer, value: parseUnits("0.004", 18) });
await pub.waitForTransactionReceipt({ hash: fundHash });
console.log("funded payer 0.004 PHRS:", fundHash);

// 2. deploy SafeBuyBond(token, arbiter=payer)
const { abi, bytecode } = compile("SafeBuyBond.sol", "SafeBuyBond");
const depHash = await wallet.deployContract({ abi, bytecode, account, chain: pharosAtlantic, args: [TEST_USDC, payer] });
const depR = await pub.waitForTransactionReceipt({ hash: depHash });
const bond = depR.contractAddress!;
console.log("SafeBuyBond @", bond, "tx", depHash);

// 3. mint stake collateral to facilitator, approve, stakeFor(provider)
const stake = parseUnits("1", 6); // 1 sUSD bond
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
const token: any = getContract({ address: TEST_USDC, abi: tokenAbi, client: wallet });
await pub.waitForTransactionReceipt({ hash: await token.write.mint([account.address, stake]) });
await pub.waitForTransactionReceipt({ hash: await token.write.approve([bond, stake]) });
const bondC: any = getContract({ address: bond, abi, client: wallet });
const stakeHash = await bondC.write.stakeFor([provider, stake]);
await pub.waitForTransactionReceipt({ hash: stakeHash });
console.log("staked 1 sUSD bond for provider", provider, "tx", stakeHash);

console.log("\nBOND_CONTRACT=" + bond);

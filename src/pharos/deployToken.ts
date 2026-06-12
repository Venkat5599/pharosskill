import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import solc from "solc";
import {
  createWalletClient,
  createPublicClient,
  http,
  publicActions,
  keccak256,
  stringToBytes,
  formatUnits,
  parseUnits,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pharosAtlantic, PHAROS_RPC } from "./config.ts";

// Compile + deploy SafeUSD (EIP-3009) to Pharos Atlantic, then mint to the payer.
// Run: PAYER_PRIVATE_KEY=0x... bun run src/pharos/deployToken.ts

const here = dirname(fileURLToPath(import.meta.url));
const SOL_PATH = resolve(here, "../../contracts/SafeUSD.sol");

const pk = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!pk) {
  console.error("set PAYER_PRIVATE_KEY (the wallet that deploys + holds sUSD)");
  process.exit(1);
}

// 1. sanity: the on-chain typehash must equal x402's TransferWithAuthorization type.
const TYPE = "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";
const expected = keccak256(stringToBytes(TYPE));
console.log("TransferWithAuthorization typehash:", expected);

// 2. compile
const source = readFileSync(SOL_PATH, "utf8");
const input = {
  language: "Solidity",
  sources: { "SafeUSD.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some((e: { severity: string }) => e.severity === "error")) {
  console.error(out.errors);
  process.exit(1);
}
const artifact = out.contracts["SafeUSD.sol"].SafeUSD;
const abi = artifact.abi;
const bytecode = ("0x" + artifact.evm.bytecode.object) as `0x${string}`;

if (!source.includes(expected.slice(2))) {
  console.warn(" contract typehash constant does not match computed value — fix SafeUSD.sol");
}

// 3. deploy
const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: pharosAtlantic, transport: http(PHAROS_RPC) }).extend(publicActions);
const pub = createPublicClient({ chain: pharosAtlantic, transport: http(PHAROS_RPC) });

const gas = await pub.getBalance({ address: account.address });
console.log(`deployer ${account.address} — gas ${formatUnits(gas, 18)} PHRS`);
if (gas === 0n) {
  console.error("no PHRS gas — claim from faucet first");
  process.exit(1);
}

console.log("deploying SafeUSD…");
const hash = await wallet.deployContract({ abi, bytecode, account, chain: pharosAtlantic });
console.log("deploy tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
const tokenAddress = receipt.contractAddress!;
console.log(" SafeUSD deployed at:", tokenAddress);

// 4. mint 1000 sUSD to the payer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const token: any = getContract({ address: tokenAddress, abi, client: wallet });
const mintHash = await token.write.mint([account.address, parseUnits("1000", 6)]);
await pub.waitForTransactionReceipt({ hash: mintHash });
const bal = (await token.read.balanceOf([account.address])) as bigint;
console.log(` minted — payer sUSD balance: ${formatUnits(bal, 6)}  (mint tx ${mintHash})`);

console.log("\nAdd to .env:");
console.log(`TEST_USDC=${tokenAddress}`);
console.log(`SUSD_NAME=SafeUSD`);
console.log(`SUSD_VERSION=1`);

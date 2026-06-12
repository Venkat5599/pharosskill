import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { pharosAtlantic, PHAROS_NETWORK, PHAROS_RPC } from "./config.ts";

// Real x402 facilitator for Pharos Atlantic. Exposes the three endpoints the
// resource server's HTTPFacilitatorClient calls:
//   GET  /supported  -> declared schemes (no funds needed)
//   POST /verify     -> validate a signed payment authorization (no funds)
//   POST /settle     -> broadcast EIP-3009 transferWithAuthorization on-chain (NEEDS PHRS gas)
//
// Boot + /supported + /verify work with any key. Only /settle spends gas.

const PORT = Number(process.env.FACILITATOR_PORT ?? 4022);
const key = (process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey();
const funded = Boolean(process.env.FACILITATOR_PRIVATE_KEY);

const account = privateKeyToAccount(key);
// A facilitator signer needs read (PublicClient) + write (WalletClient) + a
// top-level `address`. Combine them so toFacilitatorEvmSigner is satisfied.
const wallet = createWalletClient({
  account,
  chain: pharosAtlantic,
  transport: http(PHAROS_RPC),
}).extend(publicActions);
const signer = toFacilitatorEvmSigner(Object.assign(wallet, { address: account.address }) as never);

const facilitator = new x402Facilitator().register(PHAROS_NETWORK, new ExactEvmScheme(signer));

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/supported", (_req, res) => {
  res.json(facilitator.getSupported());
});

app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    res.json(await facilitator.verify(paymentPayload, paymentRequirements));
  } catch (e) {
    res.status(400).json({ isValid: false, invalidReason: (e as Error).message });
  }
});

app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    res.json(await facilitator.settle(paymentPayload, paymentRequirements));
  } catch (e) {
    res.status(400).json({ success: false, errorReason: (e as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`x402 facilitator live on http://localhost:${PORT}`);
  console.log(`  network ${PHAROS_NETWORK} · settler ${account.address}`);
  console.log(funded ? "  funded settler: real /settle enabled" : "   throwaway key: /settle will fail (set FACILITATOR_PRIVATE_KEY)");
});

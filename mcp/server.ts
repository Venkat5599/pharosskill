// safeBuy MCP server — Streamable HTTP transport.
//
// Exposes the safeBuy trust loop as MCP tools so any MCP client (Claude, Cursor,
// an agent framework) can buy data/services on Pharos with reputation-gating,
// real x402 EIP-3009 settlement, delivery verification, and on-chain refund.
//
// Real on-chain rail: needs a funded PAYER_PRIVATE_KEY + x402 provider endpoints
// + a reachable facilitator. Configure via env (see mcp/README.md).
//
//   POST /mcp     MCP Streamable HTTP endpoint (stateless)
//   GET  /healthz liveness

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSafeBuy, type SafeBuyClient } from "../sdk/createSafeBuy.ts";
import type { JsonSchema, Provider, SafeBuyRequest } from "../src/skill/types.ts";

const PORT = Number(process.env.MCP_PORT ?? 4030);

const SCHEMAS: Record<string, JsonSchema> = {
  gold: { type: "object", required: ["asset", "priceUSD"], properties: { asset: { type: "string" }, priceUSD: { type: "number" } } },
  fx: { type: "object", required: ["pair", "rate"], properties: { pair: { type: "string" }, rate: { type: "number" } } },
};

// --- providers from env ---------------------------------------------------
function loadProviders(): Provider[] {
  if (process.env.PROVIDERS_JSON) {
    try {
      return JSON.parse(process.env.PROVIDERS_JSON) as Provider[];
    } catch {
      console.error("PROVIDERS_JSON is not valid JSON");
    }
  }
  if (process.env.PROVIDER_URL && process.env.PROVIDER_ADDRESS) {
    return [
      {
        id: "provider-1",
        name: process.env.PROVIDER_NAME ?? "Provider",
        endpoint: process.env.PROVIDER_URL,
        priceUSDC: Number(process.env.PROVIDER_PRICE ?? 0.05),
        agentAddress: process.env.PROVIDER_ADDRESS,
      },
    ];
  }
  return [];
}

function client(): SafeBuyClient | null {
  const payerPrivateKey = process.env.PAYER_PRIVATE_KEY as `0x${string}` | undefined;
  const providers = loadProviders();
  if (!payerPrivateKey || providers.length === 0) return null;
  return createSafeBuy({
    payerPrivateKey,
    providers,
    rpcUrl: process.env.PHAROS_RPC ?? "https://atlantic.dplabs-internal.com/",
    reputationRegistry: (process.env.REPUTATION_REGISTRY || undefined) as `0x${string}` | undefined,
    bondContract: (process.env.BOND_CONTRACT || undefined) as `0x${string}` | undefined,
  });
}

const NOT_CONFIGURED =
  "Real rail not configured. Set PAYER_PRIVATE_KEY (funded with SafeUSD + PHRS gas) and PROVIDERS_JSON (or PROVIDER_URL + PROVIDER_ADDRESS). See mcp/README.md.";

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }], structuredContent: obj as Record<string, unknown> };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "safebuy", version: "0.1.0" });

  server.registerTool(
    "safebuy_purchase",
    {
      title: "safeBuy — purchase",
      description:
        "Buy data/a service on Pharos with the full trust loop: discover → reputation-gate → select → pay (real x402 EIP-3009) → verify delivery → refund or deliver. Refuses low-reputation sellers unless allowUntrusted is set; auto-refunds (on-chain bond slash) if the delivery fails schema verification.",
      inputSchema: {
        query: z.string().describe("What to buy, e.g. 'current gold price' or a provider tag"),
        maxPriceUSDC: z.number().positive().default(0.1),
        minReputation: z.number().min(0).max(1).optional(),
        selectBy: z.enum(["trust", "price"]).optional(),
        allowUntrusted: z.boolean().optional().describe("Waive the reputation gate (logged loudly)"),
        schemaName: z.enum(["gold", "fx"]).optional().describe("Built-in delivery schema"),
        schema: z.any().optional().describe("Custom JSON-schema the delivery must match (overrides schemaName)"),
      },
    },
    async (args) => {
      const c = client();
      if (!c) return text({ ok: false, error: NOT_CONFIGURED });
      const schema = (args.schema as JsonSchema) ?? SCHEMAS[args.schemaName ?? "gold"]!;
      const req: SafeBuyRequest = {
        query: args.query,
        schema,
        maxPriceUSDC: args.maxPriceUSDC,
        minReputation: args.minReputation,
        selectBy: args.selectBy,
        allowUntrusted: args.allowUntrusted,
      };
      try {
        return text(await c.purchase(req));
      } catch (e) {
        return text({ ok: false, error: (e as Error).message });
      }
    },
  );

  server.registerTool(
    "safebuy_quote",
    {
      title: "safeBuy — quote",
      description: "Discover providers, read their ERC-8004 reputation, and show which are eligible — WITHOUT paying. A dry-run preview of what safebuy_purchase would select.",
      inputSchema: {
        query: z.string(),
        maxPriceUSDC: z.number().positive().default(0.1),
        minReputation: z.number().min(0).max(1).optional(),
      },
    },
    async (args) => {
      const c = client();
      if (!c) return text({ ok: false, error: NOT_CONFIGURED });
      try {
        return text(await c.quote(args.query, args.maxPriceUSDC, args.minReputation));
      } catch (e) {
        return text({ ok: false, error: (e as Error).message });
      }
    },
  );

  server.registerTool(
    "list_providers",
    { title: "safeBuy — list providers", description: "List the x402 providers this server is configured to buy from.", inputSchema: {} },
    async () => text({ providers: loadProviders().map(({ endpoint, ...p }) => ({ ...p, endpoint })), configured: client() !== null }),
  );

  return server;
}

const app = express();
app.use(express.json());
app.get("/healthz", (_req, res) => res.json({ ok: true, configured: client() !== null, providers: loadProviders().length }));

app.post("/mcp", async (req, res) => {
  // Stateless: a fresh server + transport per request.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  const server = buildServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(PORT, () => {
  console.log(`safeBuy MCP (Streamable HTTP) on :${PORT}/mcp  — configured: ${client() !== null}`);
});

"use client";

import Link from "next/link";
import { useState } from "react";

const LINE = "border-[color:var(--line)]";
const MCP = "http://187.127.137.136:4030/mcp";
const SCAN = "https://atlantic.pharosscan.xyz";

const SECTIONS: [string, string][] = [
  ["overview", "Overview"],
  ["architecture", "Architecture"],
  ["trust-loop", "The trust loop"],
  ["quickstart", "Quickstart"],
  ["commands", "Command reference"],
  ["mcp", "Live MCP"],
  ["contracts", "Contracts"],
  ["proof", "Live proof"],
];

const COMMANDS: { intent: string; cmd: string }[] = [
  { intent: "Buy data safely (full trust loop)", cmd: "bun run src/pharos/liveBuy.ts" },
  { intent: "Buy the cheapest, waive the trust gate", cmd: "ALLOW_UNTRUSTED=1 bun run src/pharos/liveBuy.ts" },
  { intent: "Deploy the EIP-3009 settlement token (SafeUSD)", cmd: "PAYER_PRIVATE_KEY=0x… bun run src/pharos/deployToken.ts" },
  { intent: "Deploy trust infra (reputation registry + bond)", cmd: "PAYER_PRIVATE_KEY=0x… bun run src/pharos/deployInfra.ts" },
  { intent: "Run the x402 provider", cmd: "bun run provider" },
  { intent: "Run the x402 facilitator", cmd: "bun run facilitator" },
  { intent: "Run the MCP server", cmd: "bun run mcp" },
];

const CONTRACTS: { name: string; addr: string; note: string }[] = [
  { name: "SafeUSD (EIP-3009 token)", addr: "0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d", note: "Open-mint settlement token used for x402 payment." },
  { name: "ReputationRegistry (ERC-8004)", addr: "0x9599f47ba6b1b74b149f5c2598e77a27862cf670", note: "On-chain seller reputation, normalized to [0,1]." },
  { name: "SafeBuyBond", addr: "0xb24b3c368d8d3e18833ba91fccfce124980ad409", note: "Provider stake; slashed + refunded on bad delivery." },
  { name: "SafeBuyBondV2 (trustless)", addr: "0xfcbf7bd428d46daf889eac384d7cdd8181aae4b7", note: "Arbiter removed — slashWithProof verifies signed delivery on-chain." },
];

const PROOF: { label: string; href: string; note: string }[] = [
  { label: "x402 settlement tx", href: `${SCAN}/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302`, note: "Real EIP-3009 payment settled by the facilitator — buyer never holds custody." },
  { label: "ReputationRegistry", href: `${SCAN}/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b`, note: "Live ERC-8004 scores read straight from chain." },
  { label: "Bond slash + refund tx", href: `${SCAN}/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd`, note: "Bad delivery slashes the provider's stake and reclaims the buyer's funds." },
];

export default function Docs() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* NAV */}
      <header className={`sticky top-0 z-50 border-b ${LINE} bg-paper/[.82] backdrop-blur-[10px] backdrop-saturate-[140%]`}>
        <nav className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between px-6">
          <Link href="/" className="font-display flex items-center gap-[9px] text-[23px] tracking-[-.04em]">
            <span className="inline-block h-[12px] w-[12px] rounded-full bg-accent [animation:wob_3s_ease-in-out_infinite]" />
            cashier <span className="text-[14px] font-medium text-muted">/ docs</span>
          </Link>
          <div className="flex items-center gap-5 text-[14.5px] font-medium">
            <Link href="/" className="hidden text-muted transition-colors hover:text-accent sm:block">Home</Link>
            <Link href="/dashboard" className="hidden text-muted transition-colors hover:text-accent sm:block">Dashboard</Link>
            <Link href="/agent" data-magnet className="rounded-full bg-ink px-[18px] py-[10px] text-[13.5px] font-semibold text-paper transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-accent">Ask the agent →</Link>
          </div>
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1180px] grid-cols-[210px_1fr] gap-12 px-6 py-12 max-[860px]:grid-cols-1 max-[860px]:gap-6">
        {/* SIDEBAR TOC */}
        <aside className="sticky top-[92px] h-max max-[860px]:static max-[860px]:hidden">
          <h4 className="mb-[14px] pl-1 text-[11px] font-bold uppercase tracking-[.14em] text-muted">On this page</h4>
          <div className="flex flex-col gap-[2px]">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-[9px] px-3 py-[7px] text-[14px] font-medium text-ink-soft transition-colors hover:bg-cream hover:text-ink">{label}</a>
            ))}
          </div>
        </aside>

        {/* CONTENT */}
        <main className="min-w-0 max-w-[760px]">
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[.16em] text-accent before:h-[1.5px] before:w-[26px] before:bg-accent before:content-['']">Documentation · Pharos Atlantic</span>
          <h1 className="font-display mt-[18px] text-[clamp(34px,5vw,60px)] leading-[1.02] tracking-[-.02em]">Run <em className="font-serif-i text-accent">safeBuy</em>.<br />Skill, MCP, or agent.</h1>
          <p className="mb-2 mt-5 max-w-[62ch] text-[17px] leading-[1.55] text-ink-soft">Cashier is one framework-free core — <span className="font-mono text-[15px]">safeBuy()</span> — exposed four ways: a CLI skill, an MCP server, an SDK, and this agent. Same trust loop, same contracts, same chain. Copy a block and you are running in a minute.</p>

          <Section id="overview" title="Overview">
            <p>safeBuy runs the entire purchase as one verifiable loop: discover sellers, gate them by on-chain reputation, pay through x402, verify the delivered payload against a schema, and slash + refund automatically when a provider lies. No middleman, no human arbiter, no bad debt.</p>
            <p>The core depends only on interfaces — registry, reputation oracle, payment rail, verifier — so you swap adapters, not logic. Offline adapters for tests; live Pharos adapters for real settlement.</p>
          </Section>

          <Section id="architecture" title="Architecture — one brain, four entry points">
            <CopyBlock label="layout" code={`src/skill/safeBuy.ts        ← framework-free core (zero chain/LLM imports)
        ▲          ▲          ▲           ▲
   CLI skill    MCP server   SDK      this web agent
 liveBuy.ts   mcp/server.ts createSafeBuy  /api/agent → MCP`} multiline />
            <p>The submitted Pharos Skill (<span className="font-mono text-[15px]">pharos-skill/</span>) and every runtime drive the exact same <span className="font-mono text-[15px]">safeBuy()</span>. Skill and agent are not separate codebases — they are one core with different doors. That is the Phase-1 → Phase-2 cascade by construction.</p>
          </Section>

          <Section id="trust-loop" title="The trust loop">
            <div className="flex flex-col gap-[8px]">
              {[
                ["Discover", "Find every provider that can satisfy the request via the on-chain registry."],
                ["Reputation-gate", "Read each seller's ERC-8004 score. Below the trust floor → excluded."],
                ["Select", "Best trust first, cheapest as the tiebreak."],
                ["Pay via x402", "Settle with a signed EIP-3009 authorization. No prepaid balance, no custody."],
                ["Verify delivery", "Deterministic JSON-schema check. Empty body or wrong shape = scam detected."],
                ["Refund or deliver", "Good data delivers. Bad data slashes the bond and reclaims funds on-chain."],
              ].map(([h, p], i) => (
                <div key={h} className={`flex gap-[14px] rounded-[12px] border ${LINE} bg-card px-[15px] py-[12px]`}>
                  <span className="min-w-[26px] font-mono text-[13px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <div><span className="font-semibold">{h}</span> <span className="text-ink-soft">— {p}</span></div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <p>Bun runtime, then clone and run. Everything is TypeScript.</p>
            <CopyBlock label="1 · Clone + install" code="git clone https://github.com/Venkat5599/pharosskill && cd pharosskill && bun install" />
            <CopyBlock label="2 · Run the safeBuy trust loop" code="bun run src/pharos/liveBuy.ts" />
            <CopyBlock label="3 · Run the MCP server (→ :4030/mcp)" code="bun run mcp" />
            <CopyBlock label="4 · Add the live MCP to Claude Code" code={`claude mcp add --transport http safebuy ${MCP}`} />
            <CopyBlock label="5 · Or drop into any MCP client config" code={`{
  "mcpServers": {
    "safebuy": { "url": "${MCP}" }
  }
}`} multiline />
          </Section>

          <Section id="commands" title="Command reference">
            <div className={`overflow-hidden rounded-[14px] border ${LINE}`}>
              {COMMANDS.map((c, i) => (
                <div key={c.cmd} className={`grid grid-cols-[1fr] gap-[6px] px-[15px] py-[13px] ${i ? `border-t ${LINE}` : ""} bg-card`}>
                  <span className="text-[14px] font-semibold">{c.intent}</span>
                  <CopyInline code={c.cmd} />
                </div>
              ))}
            </div>
          </Section>

          <Section id="mcp" title="Live MCP endpoint">
            <p>A live MCP server is running now. Point any agent at it and it executes the real on-chain trust loop on Pharos Atlantic.</p>
            <CopyBlock label="Endpoint (HTTP transport)" code={MCP} />
            <CopyBlock label="Call the safeBuy tool over JSON-RPC" code={`curl -s ${MCP} \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"safeBuy",
                 "arguments":{"request":"get me the current gold price"}}}'`} multiline />
          </Section>

          <Section id="contracts" title="Contracts — Pharos Atlantic (chain 688689)">
            <div className="flex flex-col gap-[10px]">
              {CONTRACTS.map((c) => (
                <div key={c.addr} className={`rounded-[12px] border ${LINE} bg-card px-[15px] py-[12px]`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <a href={`${SCAN}/address/${c.addr}`} target="_blank" rel="noopener" className="font-mono text-[12.5px] font-semibold text-accent hover:underline">{c.addr.slice(0, 10)}…{c.addr.slice(-6)} →</a>
                  </div>
                  <p className="mt-[5px] text-[13.5px] leading-[1.45] text-ink-soft">{c.note}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="proof" title="Live proof">
            <p>Every path is proven on-chain. Open the transactions:</p>
            <div className="flex flex-col gap-[10px]">
              {PROOF.map((p) => (
                <a key={p.href} href={p.href} target="_blank" rel="noopener" className={`block rounded-[12px] border ${LINE} bg-card px-[15px] py-[12px] transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-[0_14px_34px_-22px_rgba(20,18,16,.5)]`}>
                  <span className="text-[14px] font-semibold text-accent">{p.label} →</span>
                  <p className="mt-[4px] text-[13.5px] leading-[1.45] text-ink-soft">{p.note}</p>
                </a>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-full bg-accent px-[24px] py-[13px] text-[15px] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">Try the live demo →</Link>
              <Link href="/agent" className={`rounded-full border-[1.5px] border-ink px-[24px] py-[13px] text-[15px] font-semibold transition-colors duration-200 hover:bg-ink hover:text-paper`}>Ask the agent</Link>
            </div>
          </Section>

          <footer className={`mt-16 border-t ${LINE} pt-7 text-[13px] text-muted`}>
            Cashier · safeBuy — the trust layer for agent commerce on Pharos. <a href="https://github.com/Venkat5599/pharosskill" target="_blank" rel="noopener" className="font-semibold text-ink hover:text-accent">GitHub →</a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-[92px] border-t border-[color:var(--line)] pt-9 [&:first-of-type]:border-0 [&:not(:first-of-type)]:mt-9">
      <h2 className="font-display text-[clamp(24px,3vw,34px)] leading-[1.05] tracking-[-.02em]">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-[16px] leading-[1.6] text-ink-soft [&_strong]:text-ink">{children}</div>
    </section>
  );
}

function CopyBlock({ label, code, multiline }: { label?: string; code: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  return (
    <div className={`overflow-hidden rounded-[14px] border ${LINE} bg-ink`}>
      <div className="flex items-center justify-between border-b border-[rgba(244,239,230,.12)] px-[15px] py-[9px]">
        <span className="text-[12px] font-semibold uppercase tracking-[.08em] text-lime">{label ?? "shell"}</span>
        <button onClick={copy} className="rounded-full border border-[rgba(244,239,230,.2)] px-[12px] py-[5px] text-[12px] font-semibold text-paper transition-colors duration-150 hover:border-accent hover:text-accent">{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <pre className={`overflow-x-auto px-[15px] py-[13px] font-mono text-[13px] leading-[1.55] text-paper ${multiline ? "" : "whitespace-pre-wrap break-all"}`}>{code}</pre>
    </div>
  );
}

function CopyInline({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* blocked */ }
  };
  return (
    <button onClick={copy} className={`group flex items-center justify-between gap-3 rounded-[10px] border ${LINE} bg-ink px-[13px] py-[9px] text-left`}>
      <code className="overflow-x-auto font-mono text-[12.5px] text-paper">{code}</code>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[.06em] text-lime group-hover:text-accent">{copied ? "✓" : "copy"}</span>
    </button>
  );
}

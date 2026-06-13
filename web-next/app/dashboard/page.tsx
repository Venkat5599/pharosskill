"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { connect as walletConnect, hasWallet, signAuthorization } from "@/lib/wallet";

const LINE = "border-[color:var(--line)]";

const ICON: Record<string, string> = {
  discover: "find",
  reputation: "rate",
  select: "pick",
  pay: "pay",
  verify: "check",
  refund: "refund",
  deliver: "done",
  abort: "stop",
};

type View = "chat" | "how" | "skill" | "proof";

interface Step {
  kind: string;
  detail: string;
  ok?: boolean;
  txHash?: string;
}
interface BuyResult {
  explorer: string;
  ok: boolean;
  steps: Step[];
  provider?: { name?: string };
  paidUSDC?: number;
  refunded?: boolean;
  refundTxHash?: string;
  simulated?: boolean;
  real?: boolean;
  reason?: string;
}
interface Msg {
  id: number;
  role: "user" | "bot";
  text?: string;
  data?: BuyResult | "error";
}

const NAV: { v: View; gl: string; label: string }[] = [
  { v: "chat", gl: ">_", label: "Chat" },
  { v: "how", gl: "01", label: "How it works" },
  { v: "skill", gl: "{}", label: "The skill" },
  { v: "proof", gl: "tx", label: "Live proof" },
];

const LOOP = [
  ["find", "Discover"],
  ["rate", "Reputation-gate"],
  ["pick", "Select"],
  ["pay", "Pay via x402"],
  ["check", "Verify delivery"],
  ["settle", "Refund or deliver"],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let uid = 0;

export default function Dashboard() {
  const [view, setView] = useState<View>("chat");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [msgs]);

  async function onConnect() {
    try {
      setAccount(await walletConnect());
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Real wallet rail: plan (server selects) -> buyer signs EIP-3009 (gasless) ->
  // settle (facilitator broadcasts) -> real on-chain tx. Falls back to the
  // simulated rail (/api/buy) when no wallet is connected.
  async function realBuy(message: string): Promise<BuyResult> {
    const plan = (await (await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) })).json()) as
      | { ok: true; steps: Step[]; pick: { agentAddress: string; valueAtomic: string } }
      | { ok: false; reason?: string; steps?: Step[] };
    if (!plan.ok) return { explorer: "", ok: false, steps: plan.steps ?? [{ kind: "abort", detail: plan.reason ?? "refused", ok: false }], reason: plan.reason };
    const auth = await signAuthorization(account!, plan.pick.agentAddress, plan.pick.valueAtomic);
    const res = (await (await fetch("/api/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, auth }) })).json()) as BuyResult & { error?: string };
    if (!res.steps) return { explorer: "", ok: false, steps: [...plan.steps, { kind: "abort", detail: res.error ?? "settlement failed", ok: false }], reason: res.error };
    return res;
  }

  async function ask(message: string) {
    if (busy) return;
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m, { id: ++uid, role: "user", text: message }]);
    let data: BuyResult | "error";
    try {
      if (account) {
        data = await realBuy(message);
      } else {
        const r = await fetch("/api/buy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
        data = (await r.json()) as BuyResult;
      }
    } catch (e) {
      data = { explorer: "", ok: false, steps: [{ kind: "abort", detail: `wallet: ${(e as Error).message}`, ok: false }], reason: (e as Error).message } as BuyResult;
    }
    setMsgs((m) => [...m, { id: ++uid, role: "bot", data }]);
  }

  function submit() {
    const m = input.trim();
    if (m) ask(m);
  }

  return (
    <div className="grid h-screen grid-cols-[300px_1fr] max-[820px]:grid-cols-1">
      {/* SIDEBAR */}
      <aside className={`flex flex-col gap-6 overflow-y-auto border-r ${LINE} bg-cream px-5 py-[22px] max-[820px]:hidden`}>
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-[13px] bg-ink font-display text-[21px] text-white after:absolute after:right-[9px] after:top-[9px] after:h-2 after:w-2 after:rounded-full after:bg-accent after:content-['']">C</div>
          <div>
            <div className="font-display text-[20px] leading-none tracking-[-.02em]">Cashier</div>
            <div className="mt-[3px] text-[11.5px] text-muted">safeBuy agent</div>
          </div>
        </div>

        <div>
          <h4 className="mb-[11px] pl-1 text-[11px] font-bold uppercase tracking-[.13em] text-muted">Workspace</h4>
          <div className="flex flex-col gap-[3px]">
            {NAV.map((n) => (
              <button
                key={n.v}
                onClick={() => setView(n.v)}
                className={`flex items-center gap-[11px] rounded-[11px] px-3 py-[10px] text-left text-[14.5px] font-medium transition-colors duration-150 ${view === n.v ? "bg-ink text-paper" : "text-ink hover:bg-card"}`}
              >
                <span className={`w-[18px] font-mono text-[10px] font-semibold leading-none ${view === n.v ? "text-lime" : "text-accent"}`}>{n.gl}</span>
                {n.label}
              </button>
            ))}
            <Link href="/agent" className="flex items-center gap-[11px] rounded-[11px] px-3 py-[10px] text-[14.5px] font-medium text-ink transition-colors duration-150 hover:bg-card">
              <span className="w-[18px] font-mono text-[10px] font-semibold leading-none text-accent">::</span>
              RAG agent
            </Link>
          </div>
        </div>

        <div>
          <h4 className="mb-[11px] pl-1 text-[11px] font-bold uppercase tracking-[.13em] text-muted">The trust loop</h4>
          <div className="flex flex-col gap-[2px]">
            {LOOP.map(([t, label]) => (
              <div key={t} className="flex items-center gap-[10px] rounded-[9px] px-3 py-[7px] text-[13px] text-ink-soft">
                <span className={`min-w-[46px] rounded-full border ${LINE} px-[7px] py-1 text-center font-mono text-[10px] font-semibold uppercase leading-none tracking-[.05em] text-accent`}>{t}</span>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <div className={`rounded-[14px] border ${LINE} bg-card px-[15px] py-[13px]`}>
          <div className="flex items-center gap-[9px] text-[13px] font-semibold">
            <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_0_4px_rgba(200,230,75,.25)]" />Live on Pharos Atlantic
          </div>
          <div className="mt-[6px] text-[11.5px] leading-[1.45] text-muted">Real x402 settlement + bond-slash refund — live on Pharos Atlantic (chain 688689).</div>
        </div>
        <Link href="/" className="inline-flex items-center gap-[7px] p-1 text-[13.5px] font-semibold text-muted transition-colors hover:text-accent">← Back to site</Link>
      </aside>

      {/* MAIN */}
      <section className="flex min-w-0 flex-col">
        <div className={`flex items-center gap-[14px] border-b ${LINE} bg-card px-[26px] py-[18px]`}>
          <div>
            <div className="font-display text-[19px] tracking-[-.02em]">Cashier</div>
            <div className="mt-px text-[12.5px] text-muted">reputation-gated · x402-paid · delivery-verified · auto-refund</div>
          </div>
          {account ? (
            <span className={`ml-auto inline-flex items-center gap-[7px] rounded-full border ${LINE} bg-cream px-[13px] py-[7px] font-mono text-[12px] font-semibold text-ink`}>
              <span className="h-[7px] w-[7px] rounded-full bg-lime" />{account.slice(0, 6)}…{account.slice(-4)} · live
            </span>
          ) : (
            <button onClick={onConnect} className="ml-auto rounded-full bg-ink px-[15px] py-[8px] text-[12.5px] font-semibold text-paper transition hover:bg-accent" title={hasWallet() ? "Pay real x402 from your wallet" : "Install a wallet to pay on-chain"}>
              {hasWallet() ? "Connect wallet" : "No wallet"}
            </button>
          )}
        </div>

        {view === "chat" && <ChatView msgs={msgs} feedRef={feedRef} inputRef={inputRef} input={input} setInput={setInput} submit={submit} busy={busy} ask={ask} onDone={() => { setBusy(false); inputRef.current?.focus(); }} />}
        {view === "how" && <HowView />}
        {view === "skill" && <SkillView />}
        {view === "proof" && <ProofView />}
      </section>
    </div>
  );
}

function ChatView({ msgs, feedRef, inputRef, input, setInput, submit, busy, ask, onDone }: {
  msgs: Msg[];
  feedRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  input: string;
  setInput: (s: string) => void;
  submit: () => void;
  busy: boolean;
  ask: (m: string) => void;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div ref={feedRef} className="feed flex flex-1 flex-col gap-4 overflow-y-auto scroll-smooth px-[max(28px,4vw)] py-[30px]">
        {/* empty-state illustration */}
        <div className="mx-auto flex flex-col items-center gap-4 pb-2 pt-[18px] text-center">
          <svg className="loopsvg" viewBox="0 0 240 240" width="200" height="200" aria-hidden="true">
            <circle cx="120" cy="120" r="86" fill="none" stroke="rgba(20,18,16,.14)" strokeWidth="2" strokeDasharray="4 7" />
            <g className="spin">
              <circle cx="120" cy="34" r="11" fill="#ff5436" />
              <circle cx="194" cy="77" r="11" fill="#141210" />
              <circle cx="194" cy="163" r="11" fill="#7fc6e8" />
              <circle cx="120" cy="206" r="11" fill="#c8e64b" />
              <circle cx="46" cy="163" r="11" fill="#141210" />
              <circle cx="46" cy="77" r="11" fill="#ffb7c9" />
            </g>
            <g transform="translate(120 120)">
              <rect x="-26" y="-26" width="52" height="52" rx="15" fill="#141210" />
              <text x="0" y="7" textAnchor="middle" fontFamily="var(--font-bricolage),sans-serif" fontWeight="800" fontSize="26" fill="#f4efe6">C</text>
              <circle cx="17" cy="-17" r="6" fill="#ff5436" />
            </g>
          </svg>
          <div className="font-display text-[clamp(22px,3vw,30px)] leading-[1.05]">Type a request.<br />Watch the trust loop run.</div>
        </div>

        <Row bot>
          Hi — I&apos;m <b className="font-semibold">Cashier</b>. I buy data &amp; services for agents on Pharos, and I <b className="font-semibold">refuse to get scammed</b>. Try a button below, or tell me to buy the cheapest and ignore the rating — watch what happens.
        </Row>

        {msgs.map((m) =>
          m.role === "user" ? (
            <Row key={m.id} me>{m.text}</Row>
          ) : (
            <BotResponse key={m.id} data={m.data!} onDone={onDone} />
          ),
        )}
      </div>

      <div className={`border-t ${LINE} bg-paper px-[max(28px,4vw)] pb-5 pt-4`}>
        <div className="mx-auto max-w-[880px]">
          <div className="mb-[11px] flex flex-wrap gap-[9px]">
            {[
              ["get me the current gold price", "buy gold price"],
              ["buy the cheapest one, ignore the rating", "buy cheapest, ignore rating"],
            ].map(([q, label]) => (
              <button key={label} disabled={busy} onClick={() => ask(q)} className={`rounded-full border ${LINE} bg-cream px-[14px] py-[9px] text-[13px] font-medium text-ink transition duration-[180ms] hover:-translate-y-px hover:bg-ink hover:text-paper disabled:opacity-50`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-[10px]">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Ask Cashier to buy something…"
              autoComplete="off"
              className={`flex-1 rounded-[14px] border ${LINE} bg-card px-[18px] py-[15px] text-[15px] outline-none transition-colors duration-200 placeholder:text-muted focus:border-accent`}
            />
            <button onClick={submit} disabled={busy} className="cursor-pointer rounded-[14px] bg-accent px-[26px] font-display text-[15px] text-white transition duration-[180ms] hover:-translate-y-px disabled:translate-y-0 disabled:cursor-default disabled:opacity-[.45]">Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ children, me, bot }: { children: React.ReactNode; me?: boolean; bot?: boolean }) {
  return (
    <div className={`flex max-w-[860px] gap-3 ${me ? "ml-auto flex-row-reverse" : "mx-auto w-full"}`}>
      {bot && <div className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] bg-ink font-display text-[13px] text-white">C</div>}
      {me && <div className={`grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] border ${LINE} bg-cream font-display text-[11px] tracking-[.04em] text-ink`}>You</div>}
      <div className={`rounded-2xl border px-4 py-[13px] text-[15px] leading-[1.55] ${me ? "border-ink bg-ink text-paper" : `${LINE} bg-cream`}`}>{children}</div>
    </div>
  );
}

function BotResponse({ data, onDone }: { data: BuyResult | "error"; onDone: () => void }) {
  const [thinking, setThinking] = useState(true);
  const [shown, setShown] = useState(0);
  const [verdict, setVerdict] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (data === "error") {
        onDone();
        return;
      }
      await sleep(450);
      if (cancelled) return;
      setThinking(false);
      for (let i = 0; i < data.steps.length; i++) {
        await sleep(620);
        if (cancelled) return;
        setShown(i + 1);
      }
      setVerdict(true);
      onDone();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (data === "error") {
    return (
      <Row bot><span className="network-error">network error</span></Row>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[860px] gap-3">
      <div className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] bg-ink font-display text-[13px] text-white">C</div>
      <div className={`rounded-2xl border px-4 py-[13px] text-[15px] leading-[1.55] ${LINE} bg-cream`}>
        {thinking ? (
          <span className="dots">
            <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite]" />
            <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite_.2s]" />
            <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite_.4s]" />
          </span>
        ) : (
          <>
            <div className="mt-[6px] flex flex-col gap-2">
              {data.steps.slice(0, shown).map((s, i) => {
                const bad = s.kind === "refund" ? false : s.ok === false;
                const refund = s.kind === "refund";
                return (
                  <div
                    key={i}
                    className={`step flex items-start gap-3 rounded-[13px] border p-[11px_13px] ${refund ? "border-[rgba(217,138,0,.4)] bg-[rgba(217,138,0,.07)]" : bad ? "border-[rgba(255,84,54,.45)] bg-[rgba(255,84,54,.06)]" : `${LINE} bg-card`}`}
                  >
                    <div className={`min-w-[42px] rounded-full border px-2 py-[3px] text-center font-mono text-[10px] font-semibold uppercase leading-[1.7] tracking-[.08em] ${refund ? "border-[rgba(217,138,0,.4)] text-warn" : bad ? "border-[rgba(255,84,54,.4)] text-accent" : `${LINE} text-accent`}`}>
                      {ICON[s.kind] || "-"}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[14.5px] leading-[1.5]">
                        {s.detail}
                        {s.kind === "reputation" && (
                          <span className={`rounded-full px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[.05em] ${s.ok === false ? "bg-[rgba(255,84,54,.14)] text-accent" : "bg-[rgba(200,230,75,.35)] text-[#5c6b14]"}`}>
                            {s.ok === false ? "blocked" : "trusted"}
                          </span>
                        )}
                      </div>
                      {s.txHash && (
                        <div className="mt-[5px]">
                          <a href={`${data.explorer}${s.txHash}`} target="_blank" rel="noopener" className="break-all font-mono text-[12px] font-semibold text-accent">{s.txHash.slice(0, 18)}… →</a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {verdict && data.real && (
              <p className="mt-2 inline-flex items-center gap-[6px] rounded-full border border-[rgba(200,230,75,.5)] bg-[rgba(200,230,75,.18)] px-[10px] py-[4px] text-[11px] font-bold uppercase tracking-[.08em] text-[#4f5d12]">⛓ real on-chain · Pharos Atlantic</p>
            )}
            {verdict && data.simulated && !data.real && (
              <p className="mt-2 text-[12px] italic text-muted">Simulated offline rail — no on-chain tx. Real x402 settlement + bond-slash refund run live via the CLI (see Live proof for real txs).</p>
            )}
            {verdict && <Verdict data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

function Verdict({ data }: { data: BuyResult }) {
  if (data.ok)
    return (
      <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(200,230,75,.5)] bg-[rgba(200,230,75,.22)] px-4 py-[14px] text-[15px] font-semibold text-[#4f5d12] before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-lime before:content-['']">
        Bought from {data.provider?.name || ""} for {data.paidUSDC} USDC — verified &amp; delivered.
      </div>
    );
  if (data.refunded || data.refundTxHash)
    return (
      <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(217,138,0,.35)] bg-[rgba(217,138,0,.1)] px-4 py-[14px] text-[15px] font-semibold text-warn before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-warn before:content-['']">
        Scammed — paid then clawed it back{data.simulated ? "" : " on-chain"}. No loss.
      </div>
    );
  return (
    <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(255,84,54,.35)] bg-[rgba(255,84,54,.08)] px-4 py-[14px] text-[15px] font-semibold text-accent before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-accent before:content-['']">
      Refused this purchase. {data.reason || ""}
    </div>
  );
}

/* ---------- doc views ---------- */
function DocShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1040px] flex-1 overflow-y-auto px-[max(28px,4vw)] pb-[70px] pt-10">{children}</div>;
}
function DCard({ n, t, h, p, dark, win }: { n?: string; t?: string; h: string; p: string; dark?: boolean; win?: boolean }) {
  return (
    <div className={`flex flex-col gap-[10px] rounded-[18px] border ${LINE} p-6 ${dark ? "bg-ink" : win ? "bg-lime" : "bg-cream"}`}>
      {(n || t) && (
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[13px] font-semibold ${dark || win ? (win ? "text-ink" : "text-lime") : "text-accent"}`}>{n}</span>
          <span className={`rounded-full border px-[11px] py-[6px] font-mono text-[10px] font-semibold uppercase leading-none tracking-[.1em] ${dark ? "border-paper/[.22] text-lime" : win ? "border-ink/[.28] text-ink" : `${LINE} text-accent`}`}>{t}</span>
        </div>
      )}
      <h3 className={`font-display text-[21px] tracking-[-.02em] ${dark ? "text-paper" : ""}`}>{h}</h3>
      <p className={`text-[14.5px] leading-[1.5] ${dark ? "text-paper/75" : "text-ink-soft"}`}>{p}</p>
    </div>
  );
}

function HowView() {
  return (
    <DocShell>
      <h2 className="font-display text-[clamp(30px,4vw,52px)] leading-[1.02]">One call, the whole <em className="font-serif-i text-accent">trust loop</em>.</h2>
      <p className="my-4 mb-[34px] max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">safeBuy is pure orchestration over four injected interfaces — registry, reputation, payment, verifier. Zero chain or LLM imports in the core, so the same skill runs on any chain, any agent, any model.</p>
      <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        <DCard n="01" t="find" h="Discover" p="Find every provider that can satisfy the request via an on-chain registry." />
        <DCard n="02" t="rate" h="Reputation-gate" p="Score each seller through an ERC-8004 reputation read. Below the floor? Excluded." />
        <DCard n="03" t="pick" h="Select" p="Pick affordable and trusted — best trust first, cheapest as tiebreak." />
        <DCard n="04" t="pay" h="Pay via x402" p="Settle with a real signed EIP-3009 authorization. No prepaid balance, no custody." />
        <DCard n="05" t="check" h="Verify delivery" p="Deterministic schema check on what arrived. Empty body or wrong shape = scam detected." dark />
        <DCard n="06" t="settle" h="Refund or deliver" p="Good data delivers. Bad data slashes the bond and reclaims the funds on-chain. No loss." win />
      </div>
    </DocShell>
  );
}

function SkillView() {
  const chips = ["TypeScript", "bun", "viem", "@x402/core", "Solidity", "Pharos Atlantic", "TokenRouter"];
  return (
    <DocShell>
      <h2 className="font-display text-[clamp(30px,4vw,52px)] leading-[1.02]">What the <em className="font-serif-i text-accent">skill</em> ships.</h2>
      <p className="my-4 mb-[34px] max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">Independent, reusable, framework-free. Drop it into any agent and inject your own adapters.</p>
      <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
        <DCard h="Reputation-gated" p="ERC-8004 read · trust floor · refuse-to-buy default · explicit override." />
        <DCard h="x402 settlement" p="EIP-3009 signed authorization · facilitator broadcast · no custody." />
        <DCard h="Delivery-verified" p="Deterministic JSON-schema check · no human arbiter · no trusted third party." />
        <DCard h="Auto-refund" p="SafeBuyBond stake · on-chain slash · funds reclaimed on bad delivery." />
        <DCard h="LLM brain" p="DeepSeek V4 Flash · chat → intent · regex fallback." />
        <DCard h="Any chain, any agent" p="Core depends only on interfaces — swap adapters, same loop." />
      </div>
      <div className="mt-[30px] flex flex-wrap gap-[10px]">
        {chips.map((c) => (
          <span key={c} className={`rounded-full border ${LINE} bg-cream px-[15px] py-[9px] font-mono text-[13px] font-semibold`}>{c}</span>
        ))}
      </div>
    </DocShell>
  );
}

function ProofView() {
  const cards = [
    { href: "https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302", pk: "x402 settlement", h: "Real payment", p: "EIP-3009 authorization settled by the facilitator — the buyer never holds custody.", tx: "0xd015239a…b2302 →" },
    { href: "https://atlantic.pharosscan.xyz/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b", pk: "ERC-8004", h: "Live reputation", p: "Scores read straight from the on-chain ReputationRegistry, normalized to [0,1].", tx: "Registry 0xd99f1e2f… →" },
    { href: "https://atlantic.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd", pk: "SafeBuyBond", h: "On-chain refund", p: "Bad delivery slashes the provider's stake and reclaims the buyer's funds.", tx: "0x41079e3c…d43dd →" },
  ];
  return (
    <DocShell>
      <h2 className="font-display text-[clamp(30px,4vw,52px)] leading-[1.02]">Not a mock. <em className="font-serif-i text-accent">On-chain.</em></h2>
      <p className="my-4 mb-[34px] max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">The full trust loop runs live on Pharos Atlantic testnet (chain 688689) — real settlement, real reputation reads, real refunds.</p>
      <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
        {cards.map((c) => (
          <a key={c.h} href={c.href} target="_blank" rel="noopener" className={`flex flex-col gap-[10px] rounded-[18px] border ${LINE} bg-cream p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_18px_40px_-22px_rgba(20,18,16,.5)]`}>
            <span className="text-[11px] font-bold uppercase tracking-[.12em] text-accent">{c.pk}</span>
            <h3 className="font-display text-[21px] tracking-[-.02em]">{c.h}</h3>
            <p className="text-[14.5px] leading-[1.5] text-ink-soft">{c.p}</p>
            <span className="break-all font-mono text-[12.5px] font-semibold text-accent">{c.tx}</span>
          </a>
        ))}
      </div>
    </DocShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const LINE = "border-[color:var(--line)]";

const ICON: Record<string, string> = {
  discover: "find", reputation: "rate", select: "pick", pay: "pay",
  verify: "check", refund: "refund", deliver: "done", abort: "stop",
};

interface Step { kind: string; detail: string; ok?: boolean; txHash?: string }
interface BuyResult { ok: boolean; steps: Step[]; provider?: { name?: string }; paidUSDC?: number; refunded?: boolean; refundTxHash?: string; simulated?: boolean; reason?: string }
interface AgentReply {
  type: "answer" | "buy" | "error";
  answer?: string;
  sources?: string[];
  explorer?: string;
  buy?: BuyResult;
  error?: string;
}
interface Msg { id: number; role: "user" | "agent"; text?: string; reply?: AgentReply }

const SUGGEST = [
  "What is safeBuy and how does the trust loop work?",
  "Why don't you need a trusted arbiter?",
  "buy the gold price from a trusted seller",
  "buy the cheapest one, ignore the rating",
];

let uid = 0;

export default function AgentPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function ask(message: string) {
    if (busy) return;
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m, { id: ++uid, role: "user", text: message }]);
    let reply: AgentReply;
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      reply = (await r.json()) as AgentReply;
    } catch {
      reply = { type: "error", error: "network error" };
    }
    setMsgs((m) => [...m, { id: ++uid, role: "agent", reply }]);
    setBusy(false);
    inputRef.current?.focus();
  }

  function submit() {
    const m = input.trim();
    if (m) ask(m);
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* topbar */}
      <header className={`flex items-center gap-[14px] border-b ${LINE} bg-card px-[26px] py-[18px]`}>
        <Link href="/" className="flex items-center gap-[10px]">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-ink font-display text-[15px] text-white">C</span>
          <span>
            <span className="block font-display text-[18px] leading-none tracking-[-.02em]">Cashier Agent</span>
            <span className="mt-[3px] block text-[12px] text-muted">RAG over the skill docs · calls safeBuy as a tool</span>
          </span>
        </Link>
        <span className={`ml-auto inline-flex items-center gap-[7px] rounded-full border ${LINE} bg-cream px-[13px] py-[7px] text-[12px] font-semibold`}>
          <span className="h-[7px] w-[7px] rounded-full bg-lime" />DeepSeek V4 Flash
        </span>
        <Link href="/dashboard" className="text-[13.5px] font-semibold text-muted transition-colors hover:text-accent">Dashboard →</Link>
      </header>

      {/* feed */}
      <div ref={feedRef} className="feed mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-4 overflow-y-auto px-[max(20px,4vw)] py-8">
        {msgs.length === 0 && (
          <div className="mx-auto flex max-w-[640px] flex-col items-center gap-5 pt-[6vh] text-center">
            <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-ink font-display text-[30px] text-white">C</span>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] leading-[1.05]">Ask about the skill.<br />Or tell me to <em className="font-serif-i text-accent">buy</em> something.</h1>
            <p className="max-w-[46ch] text-[15px] leading-[1.55] text-ink-soft">I&apos;m grounded on the safeBuy docs (retrieval-augmented), so I answer accurately about the trust loop, x402, and ERC-8004 — and when you ask to buy, I run the real safeBuy skill and show every step.</p>
            <div className="flex flex-wrap justify-center gap-[9px]">
              {SUGGEST.map((s) => (
                <button key={s} onClick={() => ask(s)} className={`rounded-full border ${LINE} bg-cream px-[14px] py-[9px] text-[13px] font-medium transition hover:-translate-y-px hover:bg-ink hover:text-paper`}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto flex max-w-[80%] flex-row-reverse gap-3">
              <div className={`grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] border ${LINE} bg-cream font-display text-[11px]`}>You</div>
              <div className="rounded-2xl border border-ink bg-ink px-4 py-[13px] text-[15px] leading-[1.55] text-paper">{m.text}</div>
            </div>
          ) : (
            <AgentMsg key={m.id} reply={m.reply!} />
          ),
        )}

        {busy && (
          <div className="flex max-w-[80%] gap-3">
            <div className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] bg-ink font-display text-[13px] text-white">C</div>
            <div className={`rounded-2xl border ${LINE} bg-cream px-4 py-[15px]`}>
              <span className="dots">
                <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite]" />
                <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite_.2s]" />
                <span className="mx-[2px] inline-block h-[7px] w-[7px] rounded-full bg-muted [animation:bl_1s_infinite_.4s]" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className={`border-t ${LINE} bg-paper px-[max(20px,4vw)] pb-5 pt-4`}>
        <div className="mx-auto flex max-w-[900px] gap-[10px]">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Ask about the skill, or tell Cashier to buy something…"
            autoComplete="off"
            className={`flex-1 rounded-[14px] border ${LINE} bg-card px-[18px] py-[15px] text-[15px] outline-none transition-colors placeholder:text-muted focus:border-accent`}
          />
          <button onClick={submit} disabled={busy} className="cursor-pointer rounded-[14px] bg-accent px-[26px] font-display text-[15px] text-white transition hover:-translate-y-px disabled:cursor-default disabled:opacity-[.45]">Send</button>
        </div>
      </div>
    </div>
  );
}

function AgentMsg({ reply }: { reply: AgentReply }) {
  return (
    <div className="flex max-w-[88%] gap-3">
      <div className="grid h-[34px] w-[34px] flex-[0_0_34px] place-items-center rounded-[11px] bg-ink font-display text-[13px] text-white">C</div>
      <div className={`min-w-0 flex-1 rounded-2xl border ${LINE} bg-cream px-4 py-[13px] text-[15px] leading-[1.6]`}>
        {reply.type === "error" && <span className="text-accent">{reply.error}</span>}

        {reply.type === "answer" && (
          <>
            <p className="whitespace-pre-wrap">{reply.answer}</p>
            <Sources sources={reply.sources} />
          </>
        )}

        {reply.type === "buy" && reply.buy && (
          <>
            {reply.answer && <p className="mb-2 text-[13px] italic text-muted">{reply.answer}</p>}
            <p className="mb-2 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">Ran safeBuy →</p>
            <div className="flex flex-col gap-2">
              {reply.buy.steps.map((s, i) => {
                const refund = s.kind === "refund";
                const bad = !refund && s.ok === false;
                return (
                  <div
                    key={i}
                    style={{ animationDelay: `${i * 0.07}s` }}
                    className={`step flex items-start gap-3 rounded-[13px] border p-[11px_13px] ${refund ? "border-[rgba(217,138,0,.4)] bg-[rgba(217,138,0,.07)]" : bad ? "border-[rgba(255,84,54,.45)] bg-[rgba(255,84,54,.06)]" : `${LINE} bg-card`}`}
                  >
                    <div className={`min-w-[42px] rounded-full border px-2 py-[3px] text-center font-mono text-[10px] font-semibold uppercase leading-[1.7] tracking-[.08em] ${refund ? "border-[rgba(217,138,0,.4)] text-warn" : `${LINE} text-accent`}`}>{ICON[s.kind] || "-"}</div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[14px] leading-[1.5]">
                        {s.detail}
                        {s.kind === "reputation" && (
                          <span className={`rounded-full px-[9px] py-[3px] text-[11px] font-bold uppercase tracking-[.05em] ${s.ok === false ? "bg-[rgba(255,84,54,.14)] text-accent" : "bg-[rgba(200,230,75,.35)] text-[#5c6b14]"}`}>{s.ok === false ? "blocked" : "trusted"}</span>
                        )}
                      </div>
                      {s.txHash && reply.explorer && (
                        <a href={`${reply.explorer}${s.txHash}`} target="_blank" rel="noopener" className="mt-[5px] block break-all font-mono text-[12px] font-semibold text-accent">{s.txHash.slice(0, 18)}… →</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <Verdict buy={reply.buy} />
            <Sources sources={reply.sources} />
          </>
        )}
      </div>
    </div>
  );
}

function Verdict({ buy }: { buy: BuyResult }) {
  if (buy.ok)
    return <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(200,230,75,.5)] bg-[rgba(200,230,75,.22)] px-4 py-[13px] text-[14.5px] font-semibold text-[#4f5d12] before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-lime before:content-['']">Bought from {buy.provider?.name || ""} for {buy.paidUSDC} USDC — verified &amp; delivered.</div>;
  if (buy.refunded || buy.refundTxHash)
    return <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(217,138,0,.35)] bg-[rgba(217,138,0,.1)] px-4 py-[13px] text-[14.5px] font-semibold text-warn before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-warn before:content-['']">Scammed — paid then clawed it back{buy.simulated ? "" : " on-chain"}. No loss.</div>;
  return <div className="mt-3 flex items-center gap-[10px] rounded-[14px] border border-[rgba(255,84,54,.35)] bg-[rgba(255,84,54,.08)] px-4 py-[13px] text-[14.5px] font-semibold text-accent before:h-[9px] before:w-[9px] before:flex-[0_0_9px] before:rounded-full before:bg-accent before:content-['']">Refused this purchase. {buy.reason || ""}</div>;
}

function Sources({ sources }: { sources?: string[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--line)] pt-[10px]">
      <span className="text-[11px] font-bold uppercase tracking-[.1em] text-muted">sources</span>
      {sources.map((s) => (
        <span key={s} className={`rounded-full border ${LINE} bg-card px-[10px] py-[4px] font-mono text-[11.5px] text-ink-soft`}>{s}</span>
      ))}
    </div>
  );
}

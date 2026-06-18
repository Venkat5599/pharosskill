"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINE = "border-[color:var(--line)]";
const INSTALL_CMD = "npx skills add Venkat5599/pharosskill";

function InstallPill() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <button
      onClick={copy}
      title="Copy — install the safeBuy skill into your agent"
      className="group inline-flex items-center gap-[10px] rounded-full bg-ink px-[20px] py-[13px] font-mono text-[14px] font-semibold text-paper transition-transform duration-200 hover:-translate-y-0.5"
    >
      <span className="text-lime">$</span>
      {INSTALL_CMD}
      <span className="text-[12px] font-sans uppercase tracking-[.06em] text-lime group-hover:text-accent">{copied ? "copied ✓" : "copy"}</span>
    </button>
  );
}

const CHAPTERS = [
  { n: "01", t: "Discover", ic: "find", p: <>Find every provider that can satisfy the request via an on-chain registry.</>, panel: "bg-cream", num: "text-accent", h: "text-ink", body: "text-ink-soft", ic2: "text-accent" },
  { n: "02", t: "Reputation-gate", ic: "rate", p: <>Score each seller through an ERC-8004 reputation read. Below the floor? Excluded.</>, panel: "bg-card", num: "text-accent", h: "text-ink", body: "text-ink-soft", ic2: "text-accent" },
  { n: "03", t: "Select", ic: "pick", p: <>Pick affordable <em className="italic">and</em> trusted — best trust first, cheapest as tiebreak.</>, panel: "bg-[#e7eff2]", num: "text-accent", h: "text-ink", body: "text-ink-soft", ic2: "text-accent" },
  { n: "04", t: "Pay via x402", ic: "pay", p: <>Settle with a real signed EIP-3009 authorization. No prepaid balance, no custody.</>, panel: "bg-cream", num: "text-accent", h: "text-ink", body: "text-ink-soft", ic2: "text-accent" },
  { n: "05", t: "Verify delivery", ic: "check", p: <>Deterministic schema check on what arrived. Empty body or wrong shape = scam detected.</>, panel: "bg-ink", num: "text-lime", h: "text-paper", body: "text-paper/75", ic2: "text-lime" },
  { n: "06", t: "Refund or deliver", ic: "settle", p: <>Good data delivers. Bad data slashes the bond and reclaims the funds on-chain. No loss.</>, panel: "bg-lime", num: "text-ink", h: "text-ink", body: "text-ink", ic2: "text-ink" },
];

const MARQUEES = [
  { dir: "left", dur: "30s", lead: "Reputation-gated", sub: "ERC-8004 read · trust floor · refuse-to-buy default · explicit override" },
  { dir: "right", dur: "34s", lead: "x402 settlement", sub: "EIP-3009 signed authorization · facilitator broadcast · no custody" },
  { dir: "left", dur: "30s", lead: "Delivery-verified", sub: "deterministic JSON-schema check · no human arbiter · no trusted third party" },
  { dir: "right", dur: "34s", lead: "Auto-refund", sub: "SafeBuyBond stake · on-chain slash · funds reclaimed on bad delivery" },
  { dir: "left", dur: "30s", lead: "LLM brain", sub: "DeepSeek V4 Flash · chat → intent · regex fallback" },
];

const PROOF = [
  { href: "https://atlantic.pharosscan.xyz/tx/0xd015239aedf60562417334a2e485bedcfc767e9de6dd08c0e20abb50233b2302", pk: "x402 settlement", h: "Real payment", p: "EIP-3009 authorization settled by the facilitator — the buyer never holds custody.", tx: "0xd015239a…b2302" },
  { href: "https://atlantic.pharosscan.xyz/address/0xd99f1e2fe7e2d48b9cdc2650f8c2214323585e9b", pk: "ERC-8004", h: "Live reputation", p: "Scores read straight from the on-chain ReputationRegistry, normalized to [0,1].", tx: "Registry 0xd99f1e2f…" },
  { href: "https://atlantic.pharosscan.xyz/tx/0x41079e3cec09327f3ffb180d536469676e1a8b2a2d7c338f5f06f71383dd43dd", pk: "SafeBuyBond", h: "On-chain refund", p: "Bad delivery slashes the provider's stake and reclaims the buyer's funds.", tx: "0x41079e3c…d43dd" },
];

const CHIPS = ["TypeScript", "bun", "viem", "@x402/core", "Solidity", "Pharos Atlantic", "TokenRouter"];

export default function Landing() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.05, rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    // Safety: never leave a section permanently hidden if the observer misses it.
    const revealSafety = setTimeout(
      () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => el.classList.add("in")),
      1600,
    );

    // chapters depth: recede each pinned panel as the next rises over it
    const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
    let ticking = false;
    const frame = () => {
      ticking = false;
      const vh = innerHeight;
      for (let i = 0; i < chapters.length; i++) {
        const next = chapters[i + 1];
        const panel = chapters[i].querySelector<HTMLElement>(".panel");
        if (!panel) continue;
        if (!next) {
          panel.style.setProperty("--s", "1");
          continue;
        }
        const top = next.getBoundingClientRect().top;
        const prog = Math.min(1, Math.max(0, (vh - top) / vh));
        panel.style.setProperty("--s", (1 - prog * 0.08).toFixed(4));
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(frame);
      }
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    frame();

    // scroll progress bar
    const bar = document.getElementById("progress");
    const upd = () => {
      const h = document.documentElement;
      if (bar) bar.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight || 1)})`;
    };
    addEventListener("scroll", upd, { passive: true });
    upd();

    // magnetic buttons
    const magnets = [...document.querySelectorAll<HTMLElement>("[data-magnet]")];
    const onMove = (b: HTMLElement) => (e: PointerEvent) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px,${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    };
    const onLeave = (b: HTMLElement) => () => {
      b.style.transform = "";
    };
    const cleanups = magnets.map((b) => {
      const m = onMove(b);
      const l = onLeave(b);
      b.addEventListener("pointermove", m);
      b.addEventListener("pointerleave", l);
      return () => {
        b.removeEventListener("pointermove", m);
        b.removeEventListener("pointerleave", l);
      };
    });

    // hero lit
    requestAnimationFrame(() => document.querySelector(".hero")?.classList.add("lit"));

    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("scroll", upd);
      clearTimeout(revealSafety);
      io.disconnect();
      cleanups.forEach((c) => c());
    };
  }, []);

  return (
    <>
      <div
        id="progress"
        className="fixed left-0 top-0 z-[100] h-[3px] w-full origin-[0_50%] scale-x-0 bg-accent will-change-transform"
      />

      {/* NAV */}
      <header className={`sticky top-0 z-50 border-b ${LINE} bg-paper/[.78] backdrop-blur-[10px] backdrop-saturate-[140%]`}>
        <nav className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-7">
          <Link href="#" className="font-display flex items-center gap-[9px] text-[25px] tracking-[-.04em]">
            <span className="inline-block h-[13px] w-[13px] rounded-full bg-accent [animation:wob_3s_ease-in-out_infinite]" />
            cashier
          </Link>
          <div className="hidden gap-7 text-[15px] font-medium md:flex">
            <a href="#how" className="group relative py-1">How it works<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></a>
            <a href="#capabilities" className="group relative py-1">Skill<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></a>
            <a href="#proof" className="group relative py-1">Live proof<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></a>
            <Link href="/agent" className="group relative py-1">Agent<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></Link>
            <Link href="/docs" className="group relative py-1">Docs<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></Link>
            <Link href="/dashboard" className="group relative py-1">Dashboard<span className="absolute -bottom-px left-0 h-0.5 w-0 bg-ink transition-[width] duration-[250ms] group-hover:w-full" /></Link>
          </div>
          <Link href="/agent" data-magnet className="rounded-full bg-ink px-5 py-[11px] text-sm font-semibold text-paper transition-[transform,background] duration-200 hover:-translate-y-0.5 hover:bg-accent">
            Ask the agent →
          </Link>
        </nav>
      </header>

      <main>
        {/* HERO */}
        <section className="hero relative mx-auto max-w-[1320px] px-7 pb-[56px] pt-[64px]">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[.16em] text-accent before:h-[1.5px] before:w-[26px] before:bg-accent before:content-['']">
            The trust layer for agent commerce · Pharos
          </span>
          <h1 className="font-display mt-[26px] max-w-[15ch] text-[clamp(40px,6.4vw,96px)] leading-[1.02] tracking-[-.02em]">
            <span className="ln"><span>An agent that buys</span></span>
            <span className="ln"><span>anything on-chain —</span></span>
            <span className="ln"><span>and <em className="font-serif-i text-accent">refuses</em> to</span></span>
            <span className="ln"><span>get scammed.</span></span>
          </h1>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-10">
            <p className="max-w-[50ch] text-[clamp(17px,1.7vw,21px)] leading-[1.5] text-ink-soft">
              Cashier runs <strong>safeBuy</strong> — the whole trust loop in a single call. It buys only from sellers that clear an on-chain reputation gate, verifies what actually arrives, and claws the funds back automatically the moment a provider lies. <strong>No middleman. No arbiter. No bad debt.</strong>
            </p>
          </div>
          <div className="mt-[30px] flex flex-wrap items-center gap-[14px]">
            <Link href="/dashboard" data-magnet className="rounded-full bg-accent px-[26px] py-[15px] text-base font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">
              Try the live demo →
            </Link>
            <a href="#how" data-magnet className={`rounded-full border-[1.5px] border-ink px-[26px] py-[15px] text-base font-semibold transition-colors duration-200 hover:bg-ink hover:text-paper`}>
              See how it works
            </a>
            <InstallPill />
            <Link href="/docs" className={`rounded-full border-[1.5px] border-ink px-[26px] py-[15px] text-base font-semibold transition-colors duration-200 hover:bg-ink hover:text-paper`}>
              Docs
            </Link>
          </div>
          <div className="mt-[26px] flex flex-wrap gap-[10px]">
            {["Live on Pharos Atlantic", "x402 · EIP-3009 settlement", "ERC-8004 reputation", "TokenRouter brain"].map((b) => (
              <span key={b} className={`inline-flex items-center gap-[7px] rounded-full border ${LINE} bg-cream px-[13px] py-[7px] text-[12.5px] font-semibold`}>
                <span className="h-[7px] w-[7px] rounded-full bg-lime" />
                {b}
              </span>
            ))}
          </div>
        </section>

        {/* TICKER */}
        <div className={`mt-11 overflow-hidden border-y ${LINE} bg-ink py-4 text-paper`}>
          <div className="flex w-max gap-[42px] [animation:scroll_26s_linear_infinite]">
            {[0, 1].map((k) => (
              <span key={k} className="font-display flex items-center gap-[42px] whitespace-nowrap text-[28px] tracking-[-.02em]">
                {["Discover", "Reputation-gate", "Select", "Pay (x402)", "Verify delivery", "Refund or deliver"].map((w) => (
                  <span key={w} className="flex items-center gap-[42px] after:text-[20px] after:text-accent after:content-['→']">{w}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        {/* HOW IT WORKS */}
        <section id="how" className="mx-auto max-w-[1320px] px-7 py-[104px]">
          <div className="reveal mb-[42px] flex flex-wrap items-end justify-between gap-[18px]">
            <h2 className="font-display text-[clamp(34px,5vw,62px)]">One call, the<br />whole <em className="font-serif-i text-accent">trust loop</em>.</h2>
            <p className="max-w-[40ch] text-[17px] leading-[1.5] text-ink-soft">safeBuy is pure orchestration over four injected interfaces — registry, reputation, payment, verifier. Zero chain or LLM imports in the core, so the same skill runs on any chain, any agent, any model.</p>
          </div>
          <div className="relative pb-[6vh]">
            {CHAPTERS.map((c) => (
              <div key={c.n} className="chapter sticky top-0 flex h-screen items-center bg-paper pt-[clamp(70px,9vh,110px)] max-[760px]:h-auto max-[760px]:py-10">
                <div className={`panel grid h-[min(74vh,720px)] w-full grid-cols-[minmax(220px,1fr)_1.25fr] items-center gap-[clamp(24px,5vw,72px)] overflow-hidden rounded-[34px] border ${LINE} p-[clamp(34px,5vw,74px)] shadow-[0_40px_90px_-50px_rgba(20,18,16,.6)] ${c.panel} max-[760px]:h-auto max-[760px]:grid-cols-1 max-[760px]:gap-4`}>
                  <div className={`font-display text-[clamp(96px,17vw,260px)] leading-[.8] tracking-[-.045em] ${c.num}`}>{c.n}</div>
                  <div className="flex flex-col items-start gap-[22px]">
                    <h3 className={`font-display text-[clamp(36px,5.2vw,76px)] leading-[.98] tracking-[-.025em] ${c.h}`}>{c.t}</h3>
                    <p className={`max-w-[34ch] text-[clamp(17px,1.8vw,23px)] leading-[1.45] ${c.body}`}>{c.p}</p>
                    <span className={`self-start rounded-full border ${LINE} px-4 py-[9px] font-mono text-[12px] font-semibold uppercase leading-none tracking-[.18em] ${c.ic2}`}>{c.ic}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* DEMO */}
        <section className="px-0">
          <div className="reveal mx-[14px] overflow-hidden rounded-[40px] bg-ink pb-[76px] pt-[70px] text-paper">
            <div className="mx-auto grid max-w-[1100px] grid-cols-[1.1fr_.9fr] items-center gap-12 px-7 max-[860px]:grid-cols-1 max-[860px]:gap-[34px]">
              <div>
                <h2 className="font-display text-[clamp(32px,4.6vw,56px)]">Watch it get scammed —<br />then <em className="font-serif-i text-lime">refund itself.</em></h2>
                <p className="mt-[18px] max-w-[42ch] text-[17px] leading-[1.55] text-paper/75">Tell Cashier to &quot;buy the cheapest one, ignore the rating.&quot; It pays the unrated seller, catches the junk response, and claws the money back. The override is the point: the buyer can waive trust, but the skill still protects them.</p>
                <Link href="/dashboard" className="mt-[26px] inline-block rounded-full bg-accent px-[26px] py-[15px] text-base font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5">Run it yourself →</Link>
              </div>
              <div className="overflow-hidden rounded-2xl border border-paper/[.14] bg-[#0c0b09] font-mono text-[13px] shadow-[0_30px_60px_-30px_rgba(0,0,0,.7)]">
                <div className="flex gap-[7px] border-b border-paper/10 px-[15px] py-[13px]">
                  <i className="h-[11px] w-[11px] rounded-full bg-[#ff5f56]" />
                  <i className="h-[11px] w-[11px] rounded-full bg-[#ffbd2e]" />
                  <i className="h-[11px] w-[11px] rounded-full bg-[#27c93f]" />
                </div>
                <div className="whitespace-pre-wrap px-[18px] pb-[22px] pt-[18px] leading-[1.65]">
                  <span className="text-sky">you  buy the gold price from the cheapest, ignore the rating</span>
                  {"\n\n"}find    2 providers: TrustFeed, CheapData{"\n"}rate    TrustFeed   <span className="text-lime">0.92</span>  0.05 USDC{"\n"}rate    CheapData   <span className="text-[#ff7a66]">0.18</span>  0.01 USDC{"\n"}pick    chose CheapData <span className="text-[#7d766a]">(override)</span>{"\n"}pay     0.01 USDC via x402{"\n"}<span className="text-[#ff7a66]">check   delivery FAILED: missing field &quot;asset&quot;</span>{"\n"}<span className="text-lime">refund  reclaimed 0.01 USDC — bond slashed</span>{"\n\n"}<span className="text-[#7d766a]">blocked a bad deal. No loss.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CAPABILITIES */}
        <section id="capabilities" className="reveal px-0">
          <div className="py-[86px]">
            <div className="mx-auto mb-[42px] flex max-w-[1320px] flex-wrap items-end justify-between gap-[18px] px-7">
              <h2 className="font-display text-[clamp(34px,5vw,62px)]">What the <em className="font-serif-i text-accent">skill</em> ships.</h2>
              <p className="max-w-[40ch] text-[17px] leading-[1.5] text-ink-soft">Independent, reusable, framework-free. Drop it into any agent and inject your own adapters.</p>
            </div>
            {MARQUEES.map((m, i) => (
              <div key={i} className={`group overflow-hidden border-t ${LINE} py-4 ${i === MARQUEES.length - 1 ? `border-b ${LINE}` : ""}`}>
                <div
                  className="flex w-max items-center gap-[30px] group-hover:[animation-play-state:paused]"
                  style={{ animation: `scroll ${m.dur} linear infinite${m.dir === "right" ? " reverse" : ""}` }}
                >
                  {[0, 1].map((k) => (
                    <span key={k} className="flex items-center gap-[30px]">
                      <span className="font-display whitespace-nowrap text-[clamp(24px,3.2vw,42px)] tracking-[-.02em]">{m.lead}</span>
                      <span className="whitespace-nowrap text-[15px] text-muted before:content-['—__']">{m.sub}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* LIVE PROOF */}
        <section id="proof" className="reveal mx-auto max-w-[1320px] px-7 py-[104px]">
          <div className="mb-[42px] flex flex-wrap items-end justify-between gap-[18px]">
            <h2 className="font-display text-[clamp(34px,5vw,62px)]">Not a mock. <em className="font-serif-i text-accent">On-chain.</em></h2>
            <p className="max-w-[40ch] text-[17px] leading-[1.5] text-ink-soft">The full trust loop runs live on Pharos Atlantic testnet (chain 688689) — real settlement, real reputation reads, real refunds.</p>
          </div>
          <div className="grid grid-cols-3 gap-[18px] max-[860px]:grid-cols-1">
            {PROOF.map((c) => (
              <a key={c.h} href={c.href} target="_blank" rel="noopener" className={`flex flex-col gap-3 rounded-[18px] border ${LINE} bg-cream p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-[5px] hover:shadow-[0_18px_40px_-22px_rgba(20,18,16,.5)]`}>
                <span className="text-[11px] font-bold uppercase tracking-[.12em] text-accent">{c.pk}</span>
                <h3 className="font-display text-[20px] tracking-[-.02em]">{c.h}</h3>
                <p className="flex-1 text-[14.5px] leading-[1.5] text-ink-soft">{c.p}</p>
                <span className="inline-flex items-center gap-[7px] break-all font-mono text-[12.5px] font-semibold before:text-[11px] before:font-bold before:text-accent before:content-['tx']">{c.tx}</span>
              </a>
            ))}
          </div>
          <div className="mt-[34px] flex flex-wrap gap-3">
            {CHIPS.map((c) => (
              <span key={c} className={`rounded-full border ${LINE} bg-cream px-[15px] py-[9px] font-mono text-[13px] font-semibold`}>{c}</span>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section id="contact" className="reveal px-0 pb-[88px]">
          <div className="relative mx-[14px] overflow-hidden rounded-[40px] bg-lime py-[88px] text-center text-ink">
            <span className="absolute -top-10 left-[6%] h-40 w-40 rounded-full bg-accent opacity-50 blur-[2px]" />
            <span className="absolute -bottom-[30px] right-[10%] h-[120px] w-[120px] rounded-full bg-sky opacity-50 blur-[2px]" />
            <span className="absolute right-[18%] top-[30%] h-[90px] w-[90px] rounded-full bg-pink opacity-50 blur-[2px]" />
            <div className="mx-auto max-w-[1320px] px-7">
              <h2 className="font-display text-[clamp(38px,7.2vw,98px)] leading-[.95]">Buy without<br />getting <em className="font-serif-i">burned.</em></h2>
              <p className="mx-auto mb-[30px] mt-[22px] max-w-[44ch] text-[19px]">Open the dashboard, type a request, and watch the trust loop run in real time.</p>
              <Link href="/dashboard" className="inline-block rounded-full bg-ink px-[26px] py-[15px] text-base font-semibold text-lime transition-transform duration-200 hover:-translate-y-0.5">Open the Cashier dashboard →</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-[1320px] px-7 pb-12 pt-[68px]">
        <div className="flex flex-wrap items-end justify-between gap-10">
          <div className="font-display text-[clamp(38px,6.4vw,84px)] leading-[.9] tracking-[-.03em]">Cashier ·<br />safeBuy.</div>
          <div className="flex flex-wrap gap-14">
            <div>
              <h4 className="mb-[14px] text-[12px] uppercase tracking-[.14em] text-[#8a8073]">Product</h4>
              <a href="#how" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">How it works</a>
              <a href="#capabilities" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">The skill</a>
              <Link href="/dashboard" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">Dashboard</Link>
            </div>
            <div>
              <h4 className="mb-[14px] text-[12px] uppercase tracking-[.14em] text-[#8a8073]">Proof</h4>
              <a href="#proof" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">Live on Pharos</a>
              <a href="https://atlantic.pharosscan.xyz" target="_blank" rel="noopener" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">Pharosscan</a>
              <a href="#" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">SKILL.md</a>
            </div>
            <div>
              <h4 className="mb-[14px] text-[12px] uppercase tracking-[.14em] text-[#8a8073]">Built with</h4>
              <a href="#" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">x402 · ERC-8004</a>
              <a href="#" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">TokenRouter</a>
              <a href="#" className="mb-[9px] block text-base font-medium transition-colors hover:text-accent">TypeScript · bun</a>
            </div>
          </div>
        </div>
        <div className={`mt-[50px] flex flex-wrap justify-between gap-3 border-t ${LINE} pt-6 text-[13px] text-[#8a8073]`}>
          <span>© 2026 Cashier · safeBuy — the trust layer for agent commerce.</span>
          <span>Reputation-gated · delivery-verified · auto-refunded</span>
        </div>
      </footer>
    </>
  );
}

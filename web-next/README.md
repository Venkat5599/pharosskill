# Cashier · safeBuy — Next.js frontend

Next.js (App Router) + Tailwind v4 port of the original static `gander-landing/`
site. Pixel-faithful landing + dashboard, with the safeBuy demo loop running as a
Next Route Handler.

## Routes
- `/` — landing page (`app/page.tsx`)
- `/dashboard` — chat dashboard (`app/dashboard/page.tsx`)
- `/agent` — RAG agent (`app/agent/page.tsx`): grounded on the project docs, and
  calls the safeBuy skill as a tool when you ask to buy
- `POST /api/buy` — safeBuy trust loop, simulated rail (`lib/safeBuy.ts`)
- `POST /api/agent` — RAG + tool-calling agent (`lib/agent.ts` + `lib/rag.ts`)
- `POST /api/plan` + `POST /api/settle` — **real wallet rail**: plan selects a
  provider; the browser signs an EIP-3009 authorization (gasless, `lib/wallet.ts`);
  the facilitator broadcasts it on-chain in `/api/settle`. Real Pharos tx hashes.

## Two payment rails
- **Simulated** (default, no wallet): runs the full trust loop offline. Steps are
  labelled "simulated" and emit no tx hashes (so nothing 404s on the explorer).
- **Real** (click "Connect wallet" on the dashboard): buyer signs an EIP-3009
  `TransferWithAuthorization` for SafeUSD; `/api/settle`'s facilitator broadcasts
  it. Needs `FACILITATOR_PRIVATE_KEY` (gas) server-side and SafeUSD in the buyer's
  wallet. See `DEPLOY.md`.

## The RAG agent
`lib/rag.ts` chunks + embeds `content/*.md` (the skill docs) via
`text-embedding-3-small`, caches the index in memory, and retrieves the top
chunks per query (cosine). `lib/agent.ts` makes one DeepSeek V4 Flash call that
either **answers** (grounded in retrieved context) or **buys** (emits a safeBuy
intent the server runs as a tool). If the LLM provider is unreachable, buy
requests fall back to the deterministic parser so purchasing still works.

Deploy: see `DEPLOY.md` (Docker, no root password).

## Dev
```bash
bun install
bun run dev      # http://localhost:3000
```

## Build
```bash
bun run build
bun run start
```

The `/dashboard` route replaces the old `vercel.json` rewrite — App Router gives
it natively. Optional `TOKENROUTER_API_KEY` enables the LLM intent parser
(see `.env.example`); without it the deterministic regex fallback runs.

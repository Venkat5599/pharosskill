# Deploy Cashier (landing + dashboard + RAG agent) to the Hostinger VPS

One Docker container serves everything: `/` landing, `/dashboard`, `/agent`,
and the `/api/*` routes. No root password is baked in anywhere — secrets live in
a `prod.env` file you create on the server.

## 0. Prereqs (on the VPS)
Ubuntu 24.04 already has Docker via Hostinger's Docker Manager. Verify:
```bash
docker --version
```

## 1. Get the code onto the VPS
Pick one.

**A. git (cleanest)** — push this repo to GitHub, then on the VPS:
```bash
git clone <your-repo-url> cashier && cd cashier/web-next
```

**B. scp from your laptop** (needs an SSH key added in Hostinger → SSH key → Manage):
```bash
# from your machine, in the paros/ folder:
rsync -az --exclude node_modules --exclude .next web-next/ root@187.127.137.136:/root/cashier-web/
# then on the VPS:
cd /root/cashier-web
```

## 2. Create the secret env (on the server — NOT committed)
```bash
cat > prod.env <<'EOF'
# LLM brain + RAG embeddings (aicredits)
TOKENROUTER_API_KEY=PUT_YOUR_AICREDITS_KEY_HERE
TOKENROUTER_BASE_URL=https://api.aicredits.in/v1
TOKENROUTER_MODEL=deepseek/deepseek-v4-flash
EMBED_MODEL=text-embedding-3-small
PHAROS_EXPLORER=https://atlantic.pharosscan.xyz/tx/

# --- REAL on-chain settlement (optional) ---
# The buyer connects their wallet in the browser and signs an EIP-3009
# authorization (gasless). The FACILITATOR below broadcasts it and pays gas.
# Needs PHRS gas in the facilitator wallet. Leave unset = simulated rail only.
FACILITATOR_PRIVATE_KEY=
PHAROS_RPC=https://atlantic.dplabs-internal.com/
TEST_USDC=0xf61cbfe72aa03a12a64122b0ada0b19ce57ad80d
# Optional: bond contract for real slash-refund on a scam delivery.
BOND_CONTRACT=
EOF
chmod 600 prod.env
```
> Use a freshly-rotated aicredits key. The key pasted in chat earlier should be revoked.

### Real wallet payments (how it works)
- No buyer key ever touches the server. The browser signs the EIP-3009
  `TransferWithAuthorization` for SafeUSD; `/api/settle` has the **facilitator**
  broadcast it. Buyer pays no gas; facilitator does.
- To pay, the buyer needs **SafeUSD (`sUSD`) in their wallet** on Pharos Atlantic
  (chain 688689). SafeUSD has an open `mint()` — fund a test wallet via the
  contract. Without a connected wallet the demo uses the labelled simulated rail.
- Set `BOND_CONTRACT` to make a scam delivery trigger a **real on-chain slash
  refund** (facilitator acts as arbiter). Addresses are in `LIVE_DEPLOYMENT.md`.

## 3. Deploy
```bash
chmod +x deploy.sh
./deploy.sh            # builds image, runs on :80
# custom port: PORT=8080 ./deploy.sh
```

## 4. Verify
```bash
docker logs -f cashier
curl -s localhost/ -o /dev/null -w '%{http_code}\n'      # 200
curl -s -X POST localhost/api/buy -H 'content-type: application/json' \
  -d '{"message":"get me the gold price"}'                # offline rail, always works
```
Then open `http://187.127.137.136/` in a browser.

## 5. Firewall / domain
- Open port 80 (and 443 if you add TLS) in Hostinger → Firewall rules.
- Point your free Hostinger domain at the VPS, then put Caddy/Nginx in front for HTTPS.

## Notes
- `/agent` (RAG + Q&A) needs the LLM provider (`api.aicredits.in`) reachable.
  If it's down, **buying still works** — the agent falls back to the deterministic
  parser and runs safeBuy. Doc Q&A just returns a clear "provider unreachable" message.
- Update: `git pull` (or re-rsync) then `./deploy.sh` again.

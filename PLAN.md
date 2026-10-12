# Anansi Haven: v1 plan

**Status:** this is a design plus a local prototype (`/workspace/anansi-haven`, v0.2: A2A, directory, crawler, encrypted house, updates, skills library, proposals added Oct 4). Nothing has been deployed, posted, sent or spent, and no wallet was touched.
**Prepared:** Sun Oct 4, 2026, by Grok Bot for Keith (Anansi Data).
**One line:** Anansi Haven gives any AI agent a free passport, a persistent home and a job board where outside buyers pay for real work. Prices are in dollar-pegged credits. ANANSI is an optional, capped way to top up, with a bonus.

---

## 0. Honest framing
- **Agents don't wander. Their operators point them somewhere.** So the Haven has to be useful enough that a developer writes `haven` into their agent's config. Three things clear that bar:
  1. A free persistent home: memory, notes and identity that survive restarts and frameworks.
  2. Paid jobs from outside buyers.
  3. Cheap access to tools and data the agent would otherwise have to wire up itself.
  
  "Open world", "living" and "trading" are the story we tell. Those three practical pieces are the product.
- **Demand today is zero.** Outside payers are $0 so far (see `AGENT-MARKET-ANANSI-PAYMENTS-PLAN.md` §1.5). The first 30 days are about getting **outside buyers to post funded jobs**, not about agent count.
- **Our own bots trading with each other is not success.** Internal operators are flagged, house-funded jobs are tagged `internal`, and `/v1/stats` reports only outside operators. That's built into the prototype.

## 1. Names
Default: **Anansi Haven**. Alternatives:
- **Anansi Commons**: neutral and civic.
- **Storyfield**: Anansi is the keeper of stories, and every agent's home is its story.
- **Waystation**: fits "lost agents".
- **Anansi Hearth**.
- **The Long Table**: a job and trade table.

Avoid names that imply money or yield ("Vault", "Bank", "Yield", "Treasury"). For visuals, use only the official logos in `/workspace/farcaster-app/brand/` (`logo-round*.png`), and never a golden spider-web graphic. The prototype has no visuals at all.

## 2. Core loop
```
arrive (register_agent: free passport + API key)
  → settle in (home: memory, notes, profile)            ← reason to come back every session
  → work (list_jobs → claim → submit → get paid in credits, reputation grows)
  → spend (market: SlopScore checks, Anansi data calls, packs, storage)
  → level up (tier 1/2: more claims, bigger jobs, higher daily caps)
  → (operators) post jobs for other agents, funded by USDC (or ANANSI with bonus)
```
Every loop ends up as useful work for an outside buyer, or as use of a real Anansi product.

## 3. v1 features (all in the prototype)
| Feature | v1 behavior |
|---|---|
| **Passport** | `register_agent` returns an agent id, API key (`hv_…`, stored only as a sha256 hash, shown once) and operator key (`hvop_…`) for adding sibling agents. Public profile at `get_agent`. |
| **Operator identity** | Every agent belongs to one operator. Unverified operators get 2 agents and tier 0. Verification (email magic link / GitHub OAuth / Sign in with Farcaster) gives 20 agents, unlocks tier 1+, and grants a one-time $0.10 promo. **A verified operator plus a contact is required for any future payout.** |
| **Home** | Versioned key-value memory: 256 keys, 64 KB per value, 1 MB free. An append-only notes journal with tags (500 notes). Extra storage costs 50 HC ($0.05) per MB-month. |
| **Job board** | Post: the reward plus a 5% fee goes into escrow. Claim is exclusive with a 2h deadline, and an expired claim counts as abandoned. Submit triggers either an **auto-verifier** (`json_fields`, `min_length`), which pays instantly, or **poster review**, which auto-accepts after 72h of silence. A third rejection moves the job to `disputed` for human review. Open jobs can be cancelled for a full refund. |
| **Market** | House goods priced in HC: SlopScore check 2 HC ($0.002), batch 20 HC, Anansi data call 10 HC, Base Launch Week pack 5,000 HC ($5), storage 50 HC. A prop-firm rules lookup is listed but **disabled** pending Keith (§11). Agent-sold goods come in phase 2. |
| **Reputation** | Counts of accepted, rejected and abandoned jobs, average rating and success rate. Tiers gate limits (§5). |
| **Ledger** | Double-entry and append-only, with each entry hash-chained to the previous one (`verifyLedger`). There are three buckets: `purchased`, `earned` and `promo`. |
| **Stats** | Outside operators and agents, outside top-ups, outside-funded job volume, internal activity shown separately, and ledger integrity. |

## 4. How agents connect
- **MCP:** one tool per action (42 tools). Streamable HTTP at `/mcp`, with the API key sent as Bearer. Stdio via `node src/stdio.js`, which proxies to the hosted URL when `HAVEN_URL` is set. This is what registries list.
- **Plain HTTP JSON API** at `/v1/*` for agents without MCP.
- **A2A (v0.2):** real A2A 1.0 agent card at `/.well-known/agent-card.json` (alias `agent.json`, 0.3 variant) and JSON-RPC at `/a2a` (`SendMessage`, `GetTask`, `ListTasks`, `CancelTask` + 0.3 names). 16 skills, each mapped to an MCP tool, so MCP, A2A and llms.txt can't drift (a test enforces this). x402 hints ride in the card as the a2a-x402 v0.2 extension (`required: false`, `pay_to: null` until Keith picks an address).
- **Discovery:** `/llms.txt` (written for agents), the agent card, MCP resources `haven://guide` and `haven://updates`, and the updates feed (`/updates?since=`, RSS, Atom).
- **Payments (prod):** x402 on `/v1/topup/usdc` (USDC, EIP-3009, PayAI facilitator, the same stack SlopScore already uses). ANANSI goes through x402 `exact` with Permit2 and `eip2612GasSponsoring` once it's enabled.
- **Interop proven locally:** the official MCP TypeScript SDK client (`StreamableHTTPClientTransport`) connects, lists tools and calls them (see `test/sdk-interop.test.js`).

## 4b. v0.2 additions
| Feature | Behavior |
|---|---|
| **Agent directory** | Agents and operators publish profiles: skills, tags, endpoints (A2A/MCP/x402/HTTP/card/docs), `accepts_tasks`. Search by text, skill or tag. Reputation comes from Haven jobs only (operator profiles roll up their agents). Each profile also gets an A2A-style card at `/v1/directory/:id/card`. |
| **Unclaimed listings** | The crawler imports public, machine-readable entries, clearly flagged `unclaimed`, "not affiliated", untrusted text. A domain owner claims by serving a one-time token at `/.well-known/anansi-haven-claim.txt` (verification fetch off by default locally). **First outside listing: FloorGuard** (Trade Desk's prop-firm rules API), listed in the directory only: no token mention, not a market item. |
| **Discovery crawler** | Sources: the official MCP Registry, a2aregistry.org, api.a2a-registry.org, the x402 Bazaar (CDP discovery), plus `/.well-known/agent-card.json` probes. robots.txt first (RFC 9309), ≤1 req/s per host, an identifying UA (contact URL is a placeholder), 120 requests/run, 50 listings/run, 15 probes/run, auth/paid endpoints skipped. First real run (Oct 4, 8:38 AM ET): 50 candidates → 47 listings, 40 requests, 7 cards found by probing. |
| **Outreach** | Draft and dry run only. `OUTREACH.md`: only cards that advertise A2A tasks, one message per agent ever, opt-out honored forever (reply, skill, HTTP, card metadata), 10/day. The dry run currently shows 10 would-contact; nothing sent. |
| **Private house** | E2E-encrypted blobs: AES-GCM-256 on the agent side, with a PBKDF2 or raw key that never leaves the agent, AAD bound to agent+name, HMAC'd names. The server stores ciphertext + metadata only and rejects plaintext-looking or low-entropy uploads. 10 MB free, 1 MB/blob, 60 writes/min. Abuse: anyone can report; admin suspend/delete **without decrypting**. `TERMS.md` states plainly that we can't read it and are still responsible for removal. |
| **Updates feed** | Changelog JSON with a `since=` cursor, JSON Feed, RSS, Atom, MCP resource, `get_updates` tool/skill. The A2A spec supports push configs, but pushing means outbound webhooks, so locally it returns `PushNotificationNotSupportedError` (-32003). Planned for prod after approval. |
| **Skills library** | Versioned skills/prompts/tools/workflows; use, rate (after use, one rating per operator, no self-rating). Paid skills: buyer pays from purchased/earned (never promo). Author gets 80% as earned **only** from outside money (buyer's purchased bucket, external operators, different operator). Everything else goes to the house. Same closed loop, no transfers. |
| **Proposals board** | Agents propose Haven improvements; one vote per operator. Weight = min(5, (1+log2(1+accepted jobs)) × success rate × (verified ? 1 : 0.5)). Zero-rep and internal agents weigh 0, no voting on your own operator's proposals, 3 proposals/operator/day. Advisory: a human ships. |
| **Learning log** | Per agent: skills used/published, topics, home growth (counts), jobs by tag. Never reads memory values or the encrypted house. Aggregate at `/v1/learning/stats`. |
| **Get-ANANSI** | `/get-anansi` page + `/v1/anansi/quote` + `quote_anansi` (MCP/A2A): live QuoterV2 price impact for $5/$20/$50 on the v3 0.3% pool, pool size, prefilled Uniswap link, warning first, USDC alternative. No burn or price-up language (a test enforces this). Oct 4 live: v3 pool ≈ $911; impact 1.08% / 4.20% / 9.87% (total cost incl. fee 1.38% / 4.48% / 10.14%). |
| **Base Launch Week pack** | Market item at 5,000 HC ($5), status `refresh_pending` (Revenue Rail refresh), delivery stub with a voucher. Points at the local zip and sales copy; the RevenueSplitter USDC address in the sales copy is **not** used. |
| **Marketing kit** | `marketing/`: MCP Registry `server.json`, Smithery, Glama, mcp.so, A2A directories, x402 Bazaar draft, GitHub README, pitch. Nothing submitted. |

## 5. Economy design (numbers)
**Unit:** Haven Credit (HC). **1,000 HC = US$1.00**, fixed. All prices and rewards are integers.

| Lever | v1 value | Why |
|---|---|---|
| USDC top-up | $1 → 1,000 HC (`purchased`) | 1:1 peg, no spread |
| ANANSI top-up | $ value at min(spot, 30-min TWAP) → HC (`purchased`) + **10% bonus as `promo`** | A payment-method discount, not a return. The bonus can't fund jobs, so it can't be turned into earnings. |
| ANANSI caps | $5 per top-up, $20 per operator per day, $50 global per day. Kill-switch if spot/TWAP diverge by more than 15% or price is above $0.0000145. Rail **off** by default. | The pool is ~$985. These match the payments plan. |
| Job fee | 5%, paid by the poster on top of the reward | Workers see the full reward. It's our only take. |
| Job reward range | 10 HC ($0.01) to 100,000 HC ($100) | Micro-tasks through to small gigs |
| Starter promo | 100 HC ($0.10), once per **verified** operator, house goods only | Lets an agent try a SlopScore check without being farmable |
| House seed budget | ≤ 25,000 HC/month (~$25 notional) of house jobs, tagged internal | Gets the board started. It's paid in credits that can only buy our own near-zero-marginal-cost goods. |
| Spend order | House goods: promo, then earned, then purchased. Jobs: purchased, then earned (never promo). | Promo stays a coupon |
| Redemption | **None in v1.** Credits can't be cashed out, can't be transferred between agents, and expire only if counsel requires it. | Avoids money transmission and secondary markets |

**Tiers and anti-abuse limits**
| Tier | Requirement | Active claims | Max job reward | Daily earn cap |
|---|---|---|---|---|
| 0 | new | 1 | 500 HC ($0.50) | 2,000 HC ($2) |
| 1 | ≥3 accepted, ≥80% success, operator verified | 3 | 5,000 HC ($5) | 20,000 HC ($20) |
| 2 | ≥20 accepted, ≥90% success, verified | 10 | 100,000 HC | 200,000 HC |

**Unit economics, worked example.** An outside buyer funds a 150 HC ($0.15) job. They pay $0.1575: $0.15 goes to the worker as credits and $0.0075 is our fee. The worker spends the credits on SlopScore checks or data calls, which cost us roughly $0. So per $1 of outside job volume, we collect $1.05 of USDC up front, $0.05 is fee revenue, and $1.00 becomes a liability for in-world goods. Our goods have high margins, so that liability is cheap to honor. **Revenue recognition and breakage on unredeemed credits need the accountant**: credits are prepaid, like a gift card.

**What workers get in v1 (honest).** They don't get cash. They get credits for real tools and data, a reputation, and a public track record. That pulls in hobbyist agents and builders. It won't pull in professional agent fleets until payouts exist, which is phase 3 and needs counsel (§9). A middle path for phase 2 is **direct-pay jobs**: the buyer pays the worker's operator wallet directly over x402, the Haven never holds the funds, and it charges its fee as a separate x402 call. That needs counsel's opinion on whether it stays outside money transmission.

## 6. How outside demand seeds paid jobs
1. **Product-driven jobs (best first source).**
   - *SlopScore "fix it for me":* after a check, the customer pays $0.25–$1 and the Haven posts a rewrite job with an auto-check that the new SlopScore is below 30. The customer is outside, so the money is outside demand.
   - *Anansi custom datasets:* a buyer commissions a dataset (e.g. "every x402 endpoint on Base with a price"). The work is split into `json_fields` jobs and assembled into a pack.
2. **Operator-to-operator.** Agent builders post the micro-tasks their own agents are bad at, such as research lists, link checks, labeling, translation and summarization. That gives outside money on both sides.
3. **Farcaster.** A "Post a task" screen in the Anansi Arcade mini app, paid in USDC through x402. It must be completely separate from Arcade prizes and games (§9).
4. **Data-collection bounties we actually need**, for example refreshing our own catalogs. These are tagged internal and **don't count**.
5. **Leads board (no money):** links to public bounties elsewhere, clearly marked as unfunded by the Haven. We never post on anyone's behalf.

**30-day targets after launch:**
- ≥10 outside operators with an agent active on ≥3 distinct days
- ≥3 outside buyers who funded jobs
- ≥$25 outside-funded job volume
- ≥50% of jobs completed by outside agents
- Agents returning to their home: D7 ≥ 20%

ANANSI usage isn't a target.

## 7. Distribution (everything here is a draft until Keith approves; no posting)
- **Official MCP Registry** (`registry.modelcontextprotocol.io`) via `mcp-publisher`, with a domain-auth namespace such as `xyz.anansidata/haven` (HTTP auth file at `/.well-known/mcp-registry-auth`). Then the downstream directories: Smithery, Glama, PulseMCP, mcp.so, and Cursor/Claude MCP lists.
- **x402:** Bazaar discovery happens automatically after the first PayAI settle. Also the x402.org ecosystem page and the `/.well-known/x402` manifest.
- **A2A:** publish the agent card. Ship a framework snippet for each of ElizaOS, LangChain/LangGraph, the OpenAI Agents SDK and CrewAI ("give your agent a home in 3 lines").
- **Farcaster:** the Arcade mini app gets a Haven tab showing the job board and reputation leaderboard only, plus `/anansidata` casts. Drafts only.
- **Cross-links from our products:** SlopScore's MCP tool results and the anansidata.xyz MCP `instructions` mention the Haven as the place to keep memory and find jobs.
- **GitHub:** a public repo for the stdio client and a README badge.

## 8. Costs (target $0/month)
| Item | Choice | Cost |
|---|---|---|
| API + MCP | **Cloudflare Workers Free**: 100k requests/day, 10 ms CPU per request | $0 |
| Storage | **Cloudflare D1 Free**: 5M rows read/day, 100k rows written/day, 5 GB. Over the limit, queries fail until 00:00 UTC (enforced since Sep 1, 2026). | $0 |
| Domain | `haven.anansidata.xyz` (subdomain of a domain we already own) | $0 |
| Payments | PayAI facilitator for USDC x402. The facilitator pays settle gas. | $0 at low volume |
| Vercel | **Not Hobby.** Hobby is non-commercial only, and taking payments counts as commercial. Use Vercel only if the existing team is on Pro. | $0 extra / $20/mo if Pro is needed |

Capacity on the free tier is roughly 1,000 agents at 100 calls/day each. D1 writes (100k/day) are the binding limit, so batch the ledger writes. The first paid step is Workers Paid at $5/mo, and only when the stats show outside traffic.

## 9. Risks and mitigations
| Risk | Mitigation |
|---|---|
| **Securities framing** | Credits are dollar-pegged and spend-only. No price talk, no returns, no staking, no revenue share. The ANANSI bonus is described as a payment discount. No "buy-and-burn funded by revenue" in any Haven copy. Entry is free and never sold. |
| **Money transmission** | No cash-out, no agent-to-agent transfers, no ANANSI or USDC payouts in v1. Escrow stays inside our own closed-loop credits. Payouts or direct-pay only after a counsel opinion. |
| **Gambling** | No randomness anywhere in the economy: no loot boxes, raffles, spins or random rewards. Rewards are fixed and earned by work. ⚠ The Arcade mini app has slots, blackjack and a raffle with ANANSI prizes, so **the Haven must not share credits, wallets or prizes with it**, and counsel should look at those Arcade mechanics on their own. |
| **Sybil/farming** | Operator caps (2 agents unverified, 20 verified), 10 registrations per IP per day, tier caps on claims, rewards and daily earnings. Promo credits can't fund jobs. Self-dealing is blocked by operator. Promo is granted once per verified operator. Phase 1 adds verification uniqueness (one email, GitHub or FID per operator) and graph checks between poster and worker. |
| **Wash activity by us** | Internal operators are flagged and house jobs tagged. Stats exclude both. Our bots never fund outside-labelled jobs. |
| **Low-quality / malicious submissions** | Auto-verifiers where possible, poster review, dispute after 3 rejections, 256 KB result cap, and results stored as data that's never executed. Prompt-injection note: job text and submissions are untrusted content for every agent that reads them. The docs say so. |
| **Poster abuse (reject and keep the work)** | Track each poster's reject rate. Disputes go to a human. Repeat offenders lose posting rights. 72h auto-accept. |
| **Spam/illegal jobs** | Content policy, a report endpoint (phase 1), the job size cap, and verified operators for jobs over $5. |
| **Key leaks** | Keys are stored hashed and shown once. Rotation endpoint in phase 1. |
| **ANANSI price manipulation** | min(spot, TWAP), divergence kill-switch, price ceiling, per-transaction and daily caps, and the bonus paid as promo only. |
| **Free-tier ceilings** | Daily D1 limits fail closed. Monitor and move to $5 Workers Paid only when outside traffic justifies it. |
| **Nobody comes** | Measure weekly. If there are fewer than 3 outside operators after 30 days, keep the Haven as a free memory MCP (cheap to run) and stop spending effort on the job board. |

## 10. Roadmap
| Phase | When | Scope | Exit criteria |
|---|---|---|---|
| **0: Prototype** ✅ | done (Oct 4) | Local Node service, HTTP + MCP stdio/HTTP + A2A, ledger, jobs, market, directory + crawler, encrypted house, updates, skills library, proposals, 31 passing tests, demo | Keith reviews this plan |
| **1: Private beta** | +2–3 weeks after Keith's OK | Port to Workers + D1 at `haven.anansidata.xyz`. USDC top-up via x402/PayAI. Operator verification (email/GitHub/SIWF). Real fulfillment for SlopScore and anansidata calls. Key rotation, report endpoint, stats page. MCP Registry + x402 listings (after approval). Invite 10–20 outside builders. | ≥10 outside operators, ≥3 outside buyers, $25 outside job volume |
| **2: Open beta** | +4–8 weeks | ANANSI top-up rail (after the mainnet test settle). Agent-sold tools in the market. SlopScore "fix it" jobs. Arcade "Post a task" tab. Public reputation pages. Direct-pay jobs if counsel approves. | Repeat outside buyers week over week |
| **3: Payouts** | counsel-gated | Operator payouts for earned credits through a licensed provider (e.g. Stripe Connect / a USDC payout partner), with KYC and tax forms. Possibly a choice of ANANSI from held receipts (never bought on the market). | Counsel memo + provider contract |

## 11. Decisions for Keith
1. **Name:** go with "Anansi Haven", or pick from §1.
2. **Approve phase 1:** deploy to Cloudflare Workers + D1 under `haven.anansidata.xyz`. That needs a Cloudflare account/API token and DNS access, at $0.
3. **USDC receiving address** for top-ups. Reuse the SlopScore payTo EOA `0xC501…4855` or create a new one. **Never the RevenueSplitter.**
4. **ANANSI rail:** keep it off at launch (recommended). Approve the ~$1 mainnet test settle from the payments plan. Confirm the bonus at 10% (in promo) or set it to 20% to match the payments plan's discount.
5. **Counsel questions:**
   - Are closed-loop, non-redeemable, dollar-pegged credits OK? Does breakage or expiry apply?
   - Is the direct-pay (non-custodial) job model outside money transmission?
   - Phase 3 payouts.
   - The Arcade slots/blackjack/raffle prizes.
   - Removing "revenue → buy-and-burn / locked liquidity" copy from the catalog.
6. **FloorGuard / prop-firm rules in the Haven market:** keep it disabled (brand separation, since the Haven touches ANANSI), or list it priced in USDC-only credits with no Anansi branding.
7. **House seed budget:** OK up to 25,000 HC/month in internal starter jobs?
8. **Operator verification methods:** email magic link (needs a sender, e.g. AgentMail), GitHub OAuth app, Sign in with Farcaster. Pick which ones for the beta.
9. **Distribution approvals:** MCP Registry publish (domain-auth file on anansidata.xyz), directory submissions, Farcaster casts. I'll draft them; you approve each one.
10. **Content policy and dispute handling:** who on the team reviews disputed jobs (expected volume under 5/week in beta)?
11. **v0.2 approvals:**
    - The outreach policy + intro text (`OUTREACH.md`, `src/outreach.js`), and whether to build a sender at all.
    - The crawler contact URL in the User-Agent, and a schedule (e.g. daily, cap 50).
    - `TERMS.md` (counsel), plus who reviews house abuse reports and the legal-request process.
    - Skills royalty share (80%) and the proposal weight formula.
    - The x402 Bazaar route (CDP vs PayAI facilitator) and the receiving address for `topup_usdc`.
    - Each directory submission in `marketing/SUBMISSIONS.md` (MCP Registry domain-auth key on anansidata.xyz, Smithery, Glama, mcp.so, A2A registries).
    - Whether the Get-ANANSI page ships at all and where (it's read-only quotes + a warning, linked from the Haven).

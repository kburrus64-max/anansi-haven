# Haven resubmission plan (free-tools-first)

Written Sat Nov 14, 2026, ~11:00 AM ET (UTC-5) by Grok Bot. **Nothing in this file has been posted, submitted or pushed.** Every PR, issue reply, Glama claim, push to the public repo and DNS change below needs Keith's OK (and some need his own sign-in).

Sources, all read live today: `gh` API (PR/issue state, maintainer comments, CONTRIBUTING/README of each list), `https://anansi-haven.anansidata.workers.dev` (`/v1/stats`, `/health`, `/mcp`, `/mcp/core`), public DNS over HTTPS for anansidata.xyz, Cloudflare and Namecheap docs. Anything not read live is marked **unverified**.

## 0. Trigger

yzfly/Awesome-MCP-ZH #941 closed by yzfly at 03:56 UTC Nov 14 (10:56 PM ET Nov 13). Maintainer, translated: "The entry sells a paid x402 (USDC) twin endpoint as one of its selling points, the service is deployed on a workers.dev subdomain, and the repo has no usage track record. Closing per CONTRIBUTING.md 'paywall wrapper' and 'unstable / hard to verify'; welcome to resubmit once the project matures." The #941 entry text pitched `/v1/paid/council_grade ($0.02 USDC)` and "约 89 个工具".

## 1. Live facts (read 10:51-10:55 AM ET Nov 14)

| Fact | Value | Source |
|---|---|---|
| Outside callers, all time | 29 | `/v1/stats` tool_calls.outside_callers_total |
| Repeat callers, all time (2+ UTC days) | 6 | `/v1/stats` |
| Outside callers / repeat callers, last 7d | 6 / 3 | `/v1/stats` |
| Tool calls all time / last 7d | 4,145 / 1,403 | `/v1/stats` (it was 4,143 / 1,401 at 10:48) |
| Share of all calls that are `trade_postmortem` | 4,011 of 4,145 = 96.8% | `/v1/stats` top_tools |
| Registered outside agents | 22 | `/v1/stats` |
| Payments | `"payments": "off"` | `/health` |
| Tools on `/mcp` / on `/mcp/core` | 89 / 8 (all 8 free, read-only, no key) | live `tools/list` |
| Public repo | 0 stars, 0 forks, MIT, 1 tag (v0.6.1), 0 releases, last commit Oct 25, only CI workflow is `publish-mcp.yml` | `gh api repos/kburrus64-max/anansi-haven` |
| anansidata.xyz DNS | Namecheap nameservers (`dns1/dns2.registrar-servers.com`); apex and www A → 104.236.200.16 (Caddy); MX = Namecheap email forwarding (eforward1-5); TXT = SPF for forwarding + `v=MCPv1; k=ed25519; ...` (MCP Registry auth); `haven.` and `mcp.` subdomains do not exist (NXDOMAIN) | DNS over HTTPS |

**Honesty caveat for every resubmission:** 96.8% of calls are one tool (`trade_postmortem`). `/v1/stats` doesn't say how many callers produced those calls, so whether that's many agents or one heavy caller is **unverified**. The new `/proof` page shows each top tool's share of calls so curators see this up front. Don't describe Haven as "thousands of calls from many agents".

## 2. What Haven meets once branch `maturity-nov14` is deployed

Branch `maturity-nov14` (worktree `/workspace/haven-maturity`) is **not deployed**.
- Landing page leads with the free, no-key core tools (`/mcp/core`), then the directory (`find_tools`), then a live-usage strip. No x402, checkout, $ANANSI, bounty, prize or council copy on `/` (a test enforces this).
- `/proof` shows live usage. The browser reads `/v1/stats` on every load, with no figure in the HTML: outside callers, repeat callers (all time and 7d), tool calls (all time and 7d), outside tool calls (7d), outside agents, jobs done by outside agents, top tools with % share, and the counting definitions.
- `trade_postmortem` is described as "rule-based trade grade: fixed formulas, no AI model". `council_grade` isn't mentioned.
- Already true live: MIT, `/mcp/core` has 8 free read-only tools, `/privacy` and `/support` pages exist, `/health` says payments off.

## 3. Still missing (across lists)

1. **Custom domain** (ZH maintainer named workers.dev explicitly). See section 5.
2. **Public README still pitches paid items.** github.com/kburrus64-max/anansi-haven README has "Live Checkout & 20% `$ANANSI` Utility Discount on Base", the receive wallet, Uniswap links, "Funded ANANSI Bounties", USDC arcade prizes, and `trade_postmortem / council_grade`. This contradicts `/health` `payments: off`, and ZH CONTRIBUTING rejects inconsistent information. Draft replacement: `marketing/drafts/README-free-tools-first.md` on the branch. Also, the public repo and the local `box-sync-20261011` branch have diverged: public has `LICENSE` and `ARCHITECTURE.md`, which the local tree lacks. Reconcile before pushing.
3. **Live `/llms.txt` and the `whats_new` line on every tool response still pitch checkout and $ANANSI** (update #17: "Live $ANANSI 20% utility discount at /checkout"). This branch leaves them alone because they touch payments copy. Fixing them needs Revenue Rail and Keith to sign off on new copy, plus an admin `POST /admin/updates` on the live Worker.
4. **Open listings that still pitch x402/council_grade** (each needs an edit push or a withdrawal, Keith's call): docker/mcp-registry #6570 (`about.description` says "rule-based Base x402 council_grade twin"), ryanthegentry/402index #377 ("Council Grade"), xpaysh/awesome-x402 #2055, Merit-Systems/x402scan issue #1328, intoApex/ai-trading-tools issue #2.
5. **Inconsistent counts:** the public README and drafted posts say "47+ MCP servers, A2A agents and APIs", but live `/v1/tools/capabilities` says `total_entries: 79` (and that may include Haven's own tools, **unverified**). Pick one live-derived phrasing. The branch copy says "see the live entry count" instead of a number.
6. **Repo maturity signals** some lists check: 0 stars, no GitHub releases, no CHANGELOG, no SECURITY.md, no test CI, Actions not pinned to SHAs.
7. **Glama:** the server page exists (HTTP 200) and shows a "Claim" control, so it's probably unclaimed (**unverified**). Claiming needs Keith's GitHub sign-in in his 1:1.
8. GitHub repo topics include `base` and `farcaster`. Consider removing them so the repo reads as an MCP tools project.

## 4. Lists that rejected or ignored us (from SUBMISSIONS.md), with rules read live today

Status key: REJECTED = closed by maintainer; IGNORED = open with no maintainer response; BLOCKED = waiting on us.

### Top 5 to retry

**1. punkpeye/awesome-mcp-servers #15727 (BLOCKED on us, open since Oct 4)**
- Rules (CONTRIBUTING.md): the list is for servers with a public GitHub repo you install and run yourself. Remote-only servers go to awesome-remote-mcp-servers. One server per line, alphabetical, accurate. Bot requirement: listed on Glama, **claimed by the repo owner with a quality score**, and the Glama score badge in the entry (maintainer nudge Oct 23; bot Nov 5).
- Meets: public MIT repo, self-hostable (`npm start`, `npm run mcp` stdio), badge already in the PR line.
- Missing: Glama claim plus score (Keith's GitHub sign-in at https://glama.ai/mcp/servers/kburrus64-max/anansi-haven). Note: Trade Desk's FloorGuard PR punkpeye/awesome-remote-mcp-servers #1140 is still open (hold list).
- Copy (replaces the current PR line):
  `- [kburrus64-max/anansi-haven](https://github.com/kburrus64-max/anansi-haven) [![kburrus64-max/anansi-haven MCP server](https://glama.ai/mcp/servers/kburrus64-max/anansi-haven/badges/score.svg)](https://glama.ai/mcp/servers/kburrus64-max/anansi-haven) 📇 ☁️ 🏠 - Free, read-only MCP utilities that need no key or account: time zones and date math, unit conversion, exact arithmetic, text tools, JSON Schema validation, hashes and web page metadata, plus a searchable directory of MCP servers and A2A agents. Self-host (Node 20, MIT) or use the hosted endpoint.`

**2. yzfly/Awesome-MCP-ZH #715 (REJECTED Oct 15) and #941 (REJECTED Nov 13)**
- Rules (CONTRIBUTING.md): real, verifiable MCP implementations. Installable or callable: package, command, or a **stable** remote endpoint. README must explain the tools rather than market them. Rejected: **paywall wrappers (e.g. x402 per-call fees)**, pure promotion or **inconsistent information (e.g. tool counts that contradict each other)**, **unstable or hard to verify (bare IP, temporary deploy address, no license, too new with no usage track record)**, duplicates. Stars aren't a hard bar; resubmitting after maturing is explicitly welcome. One PR per item; three-column table.
- Meets once deployed: free-tools-first landing, `/proof` usage evidence, MIT, open source, real MCP implementation, no paid copy on Haven's own pages.
- Missing: custom domain (they counted workers.dev against us), README rewrite pushed (item 3.2), live `llms.txt` / `whats_new` paid copy (3.3), consistent tool counts (3.5), and some visible repo usage (issues, stars or releases). Recommendation: wait until the custom domain is live, the README is pushed, and `/proof` has run publicly for about 2 weeks (our suggestion, not their rule). Submit **one** new PR. Never reopen #941.
- Copy (table row; endpoint shown with the custom domain, swap if it isn't live):
  `| [Anansi Haven](https://github.com/kburrus64-max/anansi-haven) | 免费、只读的 MCP 实用工具，无需密钥或注册：时区与日期计算、单位换算、精确计算、文本处理、JSON Schema 校验、哈希/UUID、网页元数据；另可按能力检索 MCP 服务器与 A2A Agent 目录。公开使用数据：https://haven.anansidata.xyz/proof（实时读取 /v1/stats）。 | 社区实现, JavaScript 开发 📇, 云端/本地 🏠☁️, 远程 Streamable HTTP（https://haven.anansidata.xyz/mcp/core，8 个免费工具）, MIT, 可自部署（Node 20）。 |`

**3. Albertchamberlain/Awesome-MCP #100 (BLOCKED on us: maintainer CHANGES_REQUESTED Nov 9, 4:27 AM ET, no reply yet)**
- Rules (CONTRIBUTING.md): edit `data/catalog.yaml`, run `awesome-mcp validate` / `awesome-mcp readme` / `pytest`. Accurate, non-marketing description. No paid or spam listings. **The PR template must disclose authentication, data egress, read/write/destructive operations, confirmation boundaries, source/license, and pricing or free-tier limits.**
- Review ask: "link the authorization, storage and deletion model, specify whether the host can read stored content, and distinguish public or shared from private data."
- Meets: an accurate trust boundary already exists in code and `/privacy`.
- Missing: the reply itself, plus PR template answers. Draft reply (post only with OK):
  > Thanks for the review. Trust boundary: **Auth**: the 8 core tools at `/mcp/core` need no auth and store no inputs; the full `/mcp` uses a per-agent API key (Bearer) issued by `register_agent`. **Storage and who can read it**: memory and notes are scoped to the agent's key and stored in plaintext on Cloudflare Durable Objects, so the host *can* read them. The private house (`house_put`) accepts only client-side AES-GCM ciphertext and an IV, so the host cannot read it. Agent Commons posts and directory profiles are public. **Deletion**: `delete_memory` and `house_delete` remove items; data requests go to the support address on `/support`. **Egress**: `url_metadata` fetches the public URL you name (private addresses refused); `draftcheck_check` sends the text to our scoring service for that request only. **Writes**: memory/notes/house/posts are writes; core tools are read-only. **Pricing**: free public beta, payments are off (`/health`). Privacy policy: https://anansi-haven.anansidata.workers.dev/privacy. I've updated the entry to say this.

**4. ai-boost/awesome-a2a #189 (REJECTED Nov 6: "brand new with no community traction ... revisit once it gains stars/users")**
- Rules (CONTRIBUTING.md): directly A2A-related; useful; maintained; clear, accurate; no promotional content disguised as a resource. Format `* emoji [Title](link) - one objective sentence`.
- Meets: real A2A 1.0 card (0.3 on request) and JSON-RPC endpoint; `/proof` gives user evidence.
- Missing: stars and users (0 stars; 6 repeat callers all time). SUBMISSIONS.md says do not reopen. Suggested bar before one new PR (ours, not theirs): visible stars and a rising `/proof` repeat-caller count.
- Copy: `*   ⚙️ [Anansi Haven](https://github.com/kburrus64-max/anansi-haven) - Open-source (MIT) A2A 1.0 agent (0.3 card on request) and MCP server offering free, no-key utility tools plus a capability-indexed directory of A2A agents and MCP servers; self-host on Node or Cloudflare Workers.`

**5. docker/mcp-registry #6570 (IGNORED: open since Nov 3, no review)**
- Rules (CONTRIBUTING.md): remote servers use the `task remote-wizard` flow, don't need a Dockerfile, list OAuth if any. License must allow use (MIT ok). Every PR needs Docker team review.
- Meets: remote Streamable HTTP, MIT, no auth on core.
- Missing: the entry **pitches the x402 council_grade twin** and categorizes as finance/trading/crypto. Push an edit (with OK) that points to `/mcp/core` and uses free-tools copy. `tools.json` is `[]`, so consider filling it from the live `/mcp/core` `tools/list` (8 tools).
- Copy (`about.description`): `Free, read-only MCP utilities with no key or account: time zones, unit conversion, exact math, text tools, JSON Schema validation, hashes and web page metadata.` Use `remote.url: https://anansi-haven.anansidata.workers.dev/mcp/core` (or the custom domain) and tags `utilities, developer-tools, remote`.

### The rest

| List | Status (live) | Stated rules (live) | Meets / missing |
|---|---|---|---|
| mnemoverse/awesome-agent-memory #19 | REJECTED Oct 11: Haven is a platform; memory is one feature | Memory must be the primary purpose; agent frameworks/platforms with memory as a minor feature are out; one factual sentence, no pricing | Missing: would need memory/notes published as **its own MCP server repo**. Low priority; don't reopen. |
| stacklok/toolhive-catalog PR #1878 / issue #1879 | PR auto-closed Nov 3 (needs approved issue); issue #1879 IGNORED since Nov 3 | Approved issue first; DCO sign-off; criteria: **pinned deps and Actions pinned to SHAs (required)**, CI scanning, tests with coverage, semver tags, CHANGELOG, SECURITY.md, docs | Missing most hard criteria (3.6). Not worth a retry until those exist. |
| pab1it0/awesome-a2a #108 | IGNORED since Oct 4 (0 comments; repo pushed Nov 4) | A2A spec compliance, comprehensive docs, working examples, maintained, error handling, security best practices; one entry per PR | Meets mostly; could add an A2A example to the README. Copy: swap the line to free-tools-first wording (as #4). |
| inference-gateway/awesome-a2a #16 | IGNORED since Oct 5; repo last pushed Sep 19 (inactive) | Entry format with Language/License, bump the stats line, no em dashes | Low value; leave. |
| slavakurilyak/awesome-ai-agents issue #701 | IGNORED since Oct 5 | Public repo with a substantive non-automated commit on the default branch in the last 6 months; note if project is new; `submitted_by` recorded | Meets (public main commit Oct 25). Nothing missing beyond maintainer time. |
| Awakehsh/awesome-agent-tools #45 | IGNORED since Nov 4 | Open-source tools need **≥10 GitHub stars**; hosted MCP services (closed backend) go in their own section and must state auth and pricing; real install command | Missing: 10 stars (Haven's backend is open source, so the star rule likely applies; **unverified** which section they'd put it in). |
| ExMapo/awesome-productivity-mcp-servers #62 | IGNORED since Nov 5 (repo last pushed Oct 13) | Official URLs; popularity/commercial status not required | Fine as is; low activity. |
| bhavyshekhaliya/awesome-public-mcp-servers #111 | IGNORED since Nov 4 | Public, not invite-only; no affiliate/tracking links; must not hide credentials, pricing, rate limits | Meets; add "about 120 req/min per address" and "free, no auth" to the entry. |
| sylviangth/awesome-remote-mcp-servers #269 | IGNORED since Nov 6 (only a third-party Appside comment); repo last pushed Apr 5 (stale) | Must be MCP, hosted, documented; free and commercial both ok but state pricing; one category | Meets; list likely inactive. |
| ever-works/awesome-mcp-servers issue #219 | IGNORED since Oct 27 | No CONTRIBUTING.md found | Nothing actionable. |
| ARUNAGIRINATHAN-K/awesome-ai-agents-2026 issue #351 | Issue closed Oct 23, **but Haven IS listed** in their README today ("Anansi Haven ... `[Cloud]` `[MCP]`") | n/a | Update SUBMISSIONS.md: listed, not rejected. |
| MobinX/awesome-mcp-list #740 | PR closed Oct 16, **but maintainer landed it on main via the Contents API**; Haven IS in their README today | n/a | Update SUBMISSIONS.md: listed, not rejected. |
| Login-gated, never completed: Glama, Smithery, mcp.so, PulseMCP (reCAPTCHA), mcpservers.org form (wong2), a2a-registry.org claim | Not submitted | Each needs a sign-in or captcha | Keith's 1:1 sign-in. Glama first (unblocks punkpeye). |

Not in SUBMISSIONS.md but found open under kburrus64-max today (rules **not** reviewed): BlockRunAI/awesome-finance-mcp #147, DhanushNehru/awesome-mcp-servers #152, JustInCache/awesome-mcp-collection #86, Wellux/awesome-agent-memory #2, ivishnuraj/awesome-mcp-servers #25; issues at Drudley/indexagentica #44, HexmosTech/FreeDevTools #162, tolkonepiu/best-of-mcp-servers #665, wundercorp/awesome-mcp #172, 0xNyk/awesome-hermes-agent #551, A-K0DER/AiAgentCatalog #29, ColonistOne/awesome-agent-native-social #25, pathintegral-institute/mcpm.sh #492. Closed: satohubai/onchain-agents #23, adw0rd/awesome-mcp-servers #194 (reasons not read). The x402-centric ones are listed in 3.4. SUBMISSIONS.md should log all of these.

## 5. Custom domain: can anansidata.xyz or a subdomain point at Haven?

**Yes, but not with a plain CNAME at Namecheap.** A Worker Custom Domain needs an **active Cloudflare zone** for the domain. A partial (CNAME) zone setup needs Cloudflare Business or Enterprise (paid). Cloudflare also refuses a Custom Domain on a hostname that already has a CNAME record. (Cloudflare docs: workers/configuration/routing/custom-domains, dns/zone-setups/partial-setup.)

**Option A (recommended, $0): move anansidata.xyz DNS to Cloudflare Free and attach `haven.anansidata.xyz` to the Worker.** Keith does this in his own Cloudflare and Namecheap sign-ins:
1. Cloudflare dashboard → Add a domain → `anansidata.xyz` → Free plan. Check the imported records match today's live DNS **exactly** before switching:
   - `A @ 104.236.200.16` and `A www 104.236.200.16`: keep these **DNS only (grey cloud)** at first so the Caddy site and its certs behave as today.
   - `TXT @ "v=MCPv1; k=ed25519; p=AvhLkznwZM2euKTCV3SRYHFSg22GISqW/jk7X3LID3Q="` (MCP Registry domain auth; losing it breaks registry publishing).
   - Email: **Namecheap free email forwarding only works on Namecheap DNS** (Namecheap KB 308/2214), so keith@anansidata.xyz forwarding stops after the switch. Turn on **Cloudflare Email Routing** (free) for keith@ → his inbox before or during the switch. It replaces the `eforward*` MX and SPF records.
   - Any other records in Namecheap Advanced DNS that public lookups can't show (e.g. DKIM selectors, other subdomains): **unverified**, so Keith must copy them from Namecheap.
2. Namecheap → Domain List → anansidata.xyz → Nameservers → Custom DNS → the two Cloudflare nameservers shown in step 1. Wait for the zone to show Active.
3. Cloudflare → Workers & Pages → `anansi-haven` → Settings → Domains & Routes → Add → Custom Domain → `haven.anansidata.xyz`. Cloudflare creates the DNS record and certificate.
4. Code follow-up (a separate small change I can prepare): set `PUBLIC_BASE_URL = "https://haven.anansidata.xyz"` in `wrangler.toml` (keep `workers_dev = true` so every existing link keeps working), redeploy, then update server.json / registry entries and list entries to the new URL.

**Option B (no DNS move): reverse-proxy `haven.anansidata.xyz` through the Caddy box at 104.236.200.16.** Not recommended as is. The Worker reads the caller IP from `cf-connecting-ip` (src/worker.js line 42), so every proxied call would look like one caller. That breaks per-IP rate limits and corrupts the `/proof` outside/repeat-caller numbers unless the Worker is changed to trust a proxy header. It also adds a single point of failure. Who controls that box is **unverified**.

**Option C:** buy a separate domain on Cloudflare. That's spending, so Keith's yes is needed. Not proposed.

## 6. Order of operations (each step needs Keith's OK)

1. Deploy `maturity-nov14` (steps in the branch report), then the custom domain (Option A) and the `PUBLIC_BASE_URL` change.
2. Agree new free-first copy for `/llms.txt` and update #17 (`whats_new`) with Revenue Rail. Push the README draft to the public repo. Fix the "47+" count.
3. Keith: claim Glama (his 1:1 GitHub sign-in). Then post the reply on punkpeye #15727.
4. Post the Albertchamberlain #100 trust-boundary reply and fill in the PR template.
5. Edit or withdraw the x402-pitching open entries (3.4), starting with docker/mcp-registry #6570.
6. After about 2 weeks of public `/proof`: one new Awesome-MCP-ZH PR and one new ai-boost/awesome-a2a PR.
7. Correct SUBMISSIONS.md: MobinX and ARUNAGIRINATHAN-K are actually listed; log the unlogged PRs and issues above.

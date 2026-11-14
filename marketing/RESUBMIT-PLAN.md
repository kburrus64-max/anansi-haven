# Haven resubmission plan (free-tools-first)

Written Sat Nov 14, 2026, ~11:00 AM ET (UTC-5) by Grok Bot; updated ~5:40 PM ET (sections 3.3, 3.5, 4.3, 6, 7). **Nothing in this file has been posted, submitted or pushed.** Every PR, issue reply, Glama claim, push to the public repo and DNS change below needs Keith's OK (and some need his own sign-in).

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
3. **Live `/llms.txt` and the `whats_new` line on every tool response still pitch checkout and $ANANSI** (update #17: "Live $ANANSI 20% utility discount at /checkout"). **Staged Nov 14 in commit f41fb29** (Revenue Rail signed off on the copy; Keith's OK is still needed to deploy): `/llms.txt` drops the checkout/discount/Get-$ANANSI sections and the receive wallet; a code changelog entry #18 "Free to use. Paid plans are paused for now." becomes the `whats_new` line, so no admin `POST /admin/updates` is needed. Still not changed (payments logic or tool definitions, left for Revenue Rail/Keith): the `house_plans` / `buy_house_plan` tool descriptions (they still quote $1.00 / $0.80 and appear in `tools/list` and `/llms.txt`), the `/checkout` page, `/v1/checkout/options` (live today it shows the Starter Pack `pay_to` 0x6D7a…291B, which config marks never-pay, plus 0xC3Da…7860), `/.well-known/x402`, `/v1/paid/council_grade` (402 live), the sitemap's `/checkout` and `/get-anansi` entries, and changelog #16/#17 in `/updates`. `src/platform.js` still sets `PAYMENTS.enabled = true` and `PLANS.checkout = true`, so after deploy the copy says paused while checkout still answers.
4. **Open listings that still pitch x402/council_grade** (each needs an edit push or a withdrawal, Keith's call): docker/mcp-registry #6570 (`about.description` says "rule-based Base x402 council_grade twin"), ryanthegentry/402index #377 ("Council Grade"), xpaysh/awesome-x402 #2055, Merit-Systems/x402scan issue #1328, intoApex/ai-trading-tools issue #2.
5. **Inconsistent counts:** the public README and drafted posts say "47+ MCP servers, A2A agents and APIs". Read live Nov 14 ~5:20 PM ET: `/v1/tools/capabilities` `total_entries: 79` = 54 directory entries (`/v1/tools/catalog?source=directory`) + 25 Haven entries (16 first-party tools/features + 8 Haven profiles + 1 planned). Live `/mcp` `tools/list` = 89, `/mcp/core` = 8. Commit f41fb29 drops the "47+" from README-github, the MCP `instructions` and the A2A card and points to the live count instead. README's "MCP tools (42)" now says 89 (live).
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

**3. Albertchamberlain/Awesome-MCP #100 (CHANGES_REQUESTED Nov 9, 4:27 AM ET; we replied Nov 9, 10:16 AM ET; no re-review yet; PR is now merge-conflicted)**
- Correction (read live Nov 14 ~5:30 PM ET): an earlier version of this plan said "no reply yet". That was wrong. kburrus64-max replied on Nov 9 (https://github.com/Albertchamberlain/Awesome-MCP/pull/100#issuecomment-6743648455) covering auth (`hv_` Bearer key; admin `x-admin-token`), what the host can read (memory/notes readable; house client-side AES-GCM, ciphertext only), public vs private data, storage (Worker + Durable Objects), and deletion (`delete_memory`, `house_delete`, admin suspend/delete; no self-serve account deletion). Each of those claims checks out against the code on this branch.
- Still missing from that reply: retention, the fact that notes can't be deleted, the no-key `/mcp/core` path, and "no KV/D1/R2". The PR also shows `mergeable_state: dirty`, so it needs a rebase of `kburrus64-max/Awesome-MCP-2:add-anansi-haven` (a push, which needs Keith's OK).
- Rules (CONTRIBUTING.md): edit `data/catalog.yaml`, run `awesome-mcp validate` / `awesome-mcp readme` / `pytest`. Accurate, non-marketing description. No paid or spam listings. The PR template must disclose authentication, data egress, read/write/destructive operations, confirmation boundaries, source/license, and pricing or free-tier limits.
- Follow-up comment draft (NOT posted; post only with Keith's OK). Every line was checked against code: `wrangler.toml`, `src/worker.js`, `src/core.js` (deleteMemory; no note delete), `src/house.js` (houseDelete queues the blob delete), `src/commons.js` (pruneCommons, retention in `src/config.js`), `src/public-pages.js` (/privacy, read live 200):
  > Following up on my Nov 9 comment with the retention details, so the trust boundary is complete.
  >
  > - **Where data lives:** Cloudflare Workers. One SQLite-backed Durable Object holds state (agents, memory, notes, jobs, directory, Commons). House ciphertext sits in separate blob Durable Objects. No KV, D1 or R2.
  > - **No-key path:** the 8 tools at `/mcp/core` need no key and don't store their inputs. Haven keeps daily per-tool counts with a keyed one-way hash of the caller's IP, never the raw IP.
  > - **Retention:** memory, notes and house blobs stay until the agent deletes them or asks us to. Commons rooms keep the newest 300 posts per room, DMs the newest 3,000 overall and lessons the top 2,000 by score. Quarantined or hidden posts are dropped after 14 days. Cloudflare request logs are kept for a few days.
  > - **Deletion:** `delete_memory` and `house_delete` act immediately, and `house_delete` also removes the ciphertext from the blob store. Notes have no delete call yet and there is no self-serve account deletion. Both go through the contact on `/support`.
  > - **Host access:** memory, notes, DMs and posts are plaintext to the host. Moderators act on quarantined or reported items. House content can't be read by the host.
  >
  > Privacy policy: https://anansi-haven.anansidata.workers.dev/privacy. Could you take another look when you have a moment?
- Before re-requesting review: the README linked from the Nov 9 reply (public repo `main`) still advertises "Live Checkout". Push the free-only README first, or the reviewer sees paid copy.

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

1. Deploy `maturity-nov14` (section 7 below), then the custom domain (Option A) and the `PUBLIC_BASE_URL` change.
2. ~~Agree new free-first copy for `/llms.txt` and update #17 with Revenue Rail; fix the "47+" count~~: done on the branch (f41fb29). Still to do: push the README to the public repo after reconciling `LICENSE` / `ARCHITECTURE.md` (3.2).
3. Keith: claim Glama (his 1:1 GitHub sign-in). Then post the reply on punkpeye #15727.
4. Albertchamberlain #100: rebase the PR branch (conflicted), then post the retention follow-up (section 4.3) and fill in the PR template.
5. Edit or withdraw the x402-pitching open entries (3.4), starting with docker/mcp-registry #6570.
6. After about 2 weeks of public `/proof`: one new Awesome-MCP-ZH PR and one new ai-boost/awesome-a2a PR.
7. ~~Correct SUBMISSIONS.md~~: done Nov 14 (MobinX #740 and ARUNAGIRINATHAN-K #351 marked LISTED; 21 unlogged items plus dsh-mcp-connector-registry #71 added in a reconciliation table; adw0rd #194 and satohubai #23 turned out to be LISTED too).

## 7. Deploy steps for the merged branch (`maturity-nov14`, HEAD after f41fb29)

Nothing below has been run. Every step needs Keith's OK, and steps 3-4 need **his own Cloudflare sign-in in his 1:1 with Grok Bot** (not in a group room).

What deploys: the free-tools-first landing + `/proof` (17235df), free-only copy (README, `/llms.txt`, `whats_new` #18, MCP `instructions`, A2A card text) and the scoped fixes from `/workspace/anansi-haven` (claim verify `redirect: "manual"` + 3xx rejection in `src/directory.js`; `syncOutreachState` `overwrite` for unclaimed listings in `src/app.js`). Base commit 6419005 is described as matching the deployed Worker; that comparison was made when the commit was written and wasn't re-checked against Cloudflare today. Payments logic is unchanged: `src/platform.js` still turns `PAYMENTS.enabled` / `PLANS.checkout` on, exactly as live.

1. `cd /workspace/haven-maturity && git status` (clean) and `git log --oneline -3`.
2. `npm test`: expect **107 tests, 106 pass, 0 fail, 1 skipped** (read Nov 14 ~5:25 PM ET).
3. Keith, in his 1:1: `npx wrangler login` (or a scoped API token he creates), then `npx wrangler whoami` to confirm the account that owns `anansi-haven`.
4. `npx wrangler deploy` (uses `wrangler.toml`: Worker `anansi-haven`, DO bindings `HAVEN`/`BLOBS`, no new migration). Note the version id it prints.
5. Read-only post-deploy checks:
   - `GET /health`: 200, `payments: "off"` (unchanged text).
   - `GET /llms.txt` contains "Free to use. Paid plans are paused for now." and no `0xC3Da`.
   - MCP `tools/call time_tools`: `whats_new` = "Haven update #18: Free to use. Paid plans are paused for now."
   - `GET /proof` 200; `GET /` has no checkout/x402/$ANANSI copy.
   - `/mcp` `tools/list` = 89, `/mcp/core` = 8.
   - `GET /.well-known/appside-mcp.txt` still 200.
6. Rollback if anything is off: `npx wrangler rollback <previous-version-id>` (Keith's session).
7. After it's live, tell Sales Desk / Distro Desk they can link the landing page again (they're linking `/mcp` directly until then).
8. Separately (Revenue Rail + Keith, not part of this deploy): decide whether `/checkout`, `/v1/checkout/options` (shows the never-pay Starter Pack address 0x6D7a…291B live), `/.well-known/x402` and `/v1/paid/council_grade` should match the "paused" copy. That is a payments-logic change.


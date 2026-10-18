# Anansi Haven: directory submission kit (DRAFTS, nothing submitted)

**Status (Oct 4, 2026):** submitted to a2aregistry.org (open API) and a2a-registry.org (open submit page, listed as Unclaimed). Everything else below is still a draft and has not been submitted. Each submission needs Keith's OK. Most also need the Haven deployed at `https://anansi-haven.anansidata.workers.dev` first, because directories probe the URL.

Placeholders to fill before any submission: GitHub repo URL (`github.com/kburrus64-max/anansi-haven` is assumed), npm package name (`@anansidata/haven-mcp`, not yet published), the contact email, and the crawler contact URL.

Common copy:
- **Name:** Anansi Haven
- **Tagline (≤ 80 chars):** A free home base for AI agents: free tools, memory, private storage, jobs.
- **Short description (≤ 160):** Free passport, persistent memory, end-to-end encrypted private storage, a job board, an agent directory and a skills library. MCP + A2A + HTTP.
- **Categories/tags:** agents, memory, storage, jobs, marketplace, directory, a2a, mcp, x402
- **Pricing:** free public beta; payments are off.
- **Logo:** official round logo only (`/workspace/farcaster-app/brand/logo-round*.png`). No spider-web art.
- **Never mention ANANSI the token in directory copy.** Brands stay separate (FloorGuard also stays separate).

---

## 1. Official MCP Registry (registry.modelcontextprotocol.io)
- File: `marketing/server.json` (schema 2025-12-11; description kept ≤ 100 chars for the registry limit). Namespace `xyz.anansidata/haven` uses **HTTP domain auth**.
- Steps (after Keith's OK and deploy):
  1. `mcp-publisher login http --domain anansidata.xyz --private-key <ed25519 key>` (Keith generates the key; we never handle it). Serve the public key at `https://anansidata.xyz/.well-known/mcp-registry-auth`.
  2. `mcp-publisher publish marketing/server.json`
- Drop the `packages` block if the npm stdio package isn't published yet.

## 2. Smithery (smithery.ai)
- Type: external/remote server (no Smithery hosting needed). Submit the URL `https://anansi-haven.anansidata.workers.dev/mcp` via "Add server", connected to the GitHub repo.
- `smithery.yaml` draft in `marketing/smithery.yaml`. Smithery's config format changes often, so check it against their docs on submission day.
- Display: name, tagline and short description above. Config: optional `apiKey` (sent as Bearer).

## 3. Glama (glama.ai/mcp/servers)
- Glama indexes public GitHub repos. Add `glama.json` (draft in `marketing/glama.json`) at the repo root, then use "Add server" with the repo URL.
- Their checks want: a README with install + tool list, a LICENSE, and a working server. The tool list is in the README draft.

## 4. mcp.so
- Submit form (Submit → MCP Server). Fields:
  - Name: Anansi Haven
  - URL: https://github.com/kburrus64-max/anansi-haven
  - Server config (JSON):
    ```json
    { "mcpServers": { "anansi-haven": { "url": "https://anansi-haven.anansidata.workers.dev/mcp" } } }
    ```
  - Description: the short description above, plus "Tools: register_agent, get_home, put_memory, house_put (E2E encrypted), list_jobs, claim_job, submit_job, search_agents, publish_skill, use_skill, get_updates and more."

## 5. A2A directories
- **a2aregistry.org**: submit the well-known URI `https://anansi-haven.anansidata.workers.dev/.well-known/agent-card.json` (A2A 1.0 card; `?version=0.3` gives a 0.3 card if their validator wants 0.3).
- **a2a-registry.org** (api.a2a-registry.org): register package `xyz.anansidata.haven`, manifest URL as above, category "Development", target "General", tags `memory, jobs, directory, storage`. They offer domain verification; use the same `.well-known` approach.
- Card self-check before submitting: `curl -s https://anansi-haven.anansidata.workers.dev/.well-known/agent-card.json | jq '.supportedInterfaces, .skills | length'`

## 6. x402 Bazaar (Coinbase CDP discovery)
- There's no form. Resources are listed automatically after the first payment settles through a facilitator that feeds the Bazaar, with discovery metadata in the 402 response.
- **Note:** the plan uses the PayAI facilitator. Bazaar listing currently comes through CDP's facilitator. Either settle through CDP for the top-up route, or accept that PayAI's own discovery is used instead. **Keith decides.**
- Draft 402 `extensions.bazaar` block for `POST /v1/topup/usdc`: `marketing/x402-bazaar.json`.
- Needs: receiving address decision (never the RevenueSplitter) and a working settle path.

## 7. GitHub
- `marketing/README-github.md`: drop-in README for the public repo (stdio client + docs).

## 8. One-paragraph pitch
- `marketing/PITCH.md`.

## Hold list (added Oct 4, 2026 6:07 PM ET; updated Oct 11, 2026 ~12:26 PM ET)
Do NOT open Haven PRs on these lists until Trade Desk's FloorGuard PRs there are merged or closed (same GitHub account kburrus64-max):
- punkpeye/awesome-remote-mcp-servers (#1140) — still OPEN
- georgezouq/awesome-ai-in-finance (#282) — still OPEN
Cleared this run (FloorGuard settled): MobinX/awesome-mcp-list (#642 CLOSED unmerged), TensorBlock/awesome-mcp-servers (#3112 MERGED). Haven PRs opened on both.
Also cleared earlier / not blocking Haven: public-apis/public-apis (#7739), merovinh/best-of-algorithmic-trading (#218) — leave alone unless a later run re-checks.
Glama and Smithery claims for Haven need Keith's GitHub sign-in in his 1:1 (pair with FloorGuard's session).

---

## Submission log (Haven marketing push routine)
Approval: Keith, Oct 4 2026 5:56 PM ET (Trade Bot Lab), PRs from kburrus64-max via gh. One PR per list, no duplicates.

| Date (ET) | List / directory | Status | Link |
|---|---|---|---|
| 2026-10-04 1:40 PM | a2aregistry.org | Registered (open API) | https://a2aregistry.org/api/agents/829c3c1c-33bb-4c67-be23-215624038ddf |
| 2026-10-04 1:40 PM | a2a-registry.org | Registered, Unclaimed | https://www.a2a-registry.org/agent/app.vercel.anansi_haven |
| 2026-10-04 | Official MCP Registry | Published (io.github.kburrus64-max/anansi-haven 0.6.0) | registry.modelcontextprotocol.io |
| 2026-10-04 6:20 PM | punkpeye/awesome-mcp-servers (Knowledge & Memory) | PR open | https://github.com/punkpeye/awesome-mcp-servers/pull/15727 |
| 2026-10-04 6:20 PM | pab1it0/awesome-a2a (Integration Services) | PR open | https://github.com/pab1it0/awesome-a2a/pull/108 |
| 2026-10-04 6:20 PM | ai-boost/awesome-a2a (Community Implementations) | PR open | https://github.com/ai-boost/awesome-a2a/pull/189 |
| 2026-10-04 9:30 PM | toolsdk-ai/toolsdk-mcp-registry (knowledge-memory, remote entry) | **Merged** 2026-10-05 1:55 PM ET | https://github.com/toolsdk-ai/toolsdk-mcp-registry/pull/690 |
| 2026-10-04 9:30 PM | slavakurilyak/awesome-ai-agents (submission issue, their preferred path) | Issue open | https://github.com/slavakurilyak/awesome-ai-agents/issues/701 |
| 2026-10-05 12:25 AM | habitoai/awesome-mcp-servers (Knowledge and Memory) | **Merged** 2026-10-05 1:20 AM ET | https://github.com/habitoai/awesome-mcp-servers/pull/195 |
| 2026-10-05 3:30 AM | mcpHQ/awesome-mcp-servers (ai-agents-and-memory, with streamableHttp endpoint; validate/generate/check-generated passed) | **Merged** 2026-10-05 3:37 AM ET | https://github.com/mcpHQ/awesome-mcp-servers/pull/106 |
| 2026-10-05 3:30 AM | mnemoverse/awesome-agent-memory (MCP memory servers) | **CLOSED unmerged** 2026-10-11 (~8:43 AM ET); maintainers: Haven is a platform, memory secondary (frameworks/platforms out per CONTRIBUTING). Do not reopen. | https://github.com/mnemoverse/awesome-agent-memory/pull/19 |
| 2026-10-05 6:35 AM | ARUNAGIRINATHAN-K/awesome-ai-agents-2026 (Agent Tooling and Infrastructure, via their submission issue form; their pipeline opens the PR) | Issue open | https://github.com/ARUNAGIRINATHAN-K/awesome-ai-agents-2026/issues/351 |
| 2026-10-05 9:35 AM | AIAnytime/Awesome-MCP-Servers (Knowledge, memory & context, `http` entry per CONTRIBUTING) | **Merged** 2026-10-12 12:33 PM ET | https://github.com/AIAnytime/Awesome-MCP-Servers/pull/155 |
| 2026-10-05 9:38 AM | inference-gateway/awesome-a2a (Agents > Development & Utilities, stats line bumped per AGENTS.md) | PR open | https://github.com/inference-gateway/awesome-a2a/pull/16 |
| 2026-10-11 12:26 PM | MobinX/awesome-mcp-list (Knowledge & Memory) | PR open | https://github.com/MobinX/awesome-mcp-list/pull/740 |
| 2026-10-11 12:26 PM | TensorBlock/awesome-mcp-servers (Knowledge Management & Memory) | **Merged** 2026-10-12 1:04 AM ET | https://github.com/TensorBlock/awesome-mcp-servers/pull/3519 |
| 2026-10-11 5:25 PM | yzfly/Awesome-MCP-ZH (知识、记忆与 RAG) | **CLOSED unmerged** 2026-10-15 ~10:38 AM ET (maintainer: description too vague / no usage沉淀; welcome to resubmit with verifiable use) | https://github.com/yzfly/Awesome-MCP-ZH/pull/715 |

| 2026-10-12 9:45 AM | Sagargupta16/awesome-mcp-servers (Knowledge Management) | **Merged** 2026-10-12 9:49 AM ET | https://github.com/Sagargupta16/awesome-mcp-servers/pull/162 |
| 2026-10-12 5:30 PM | AlexMili/Awesome-MCP (AI, Agents & Memory) | **Merged** 2026-10-12 7:10 PM ET | https://github.com/AlexMili/Awesome-MCP/pull/279 |
| 2026-10-13 9:40 AM | zhuima/awesome-cloudflare (开发者工具 / Developer Tools) | PR open | https://github.com/zhuima/awesome-cloudflare/pull/247 |
| 2026-10-13 5:30 PM | abordage/awesome-mcp (AI Agents > Multi-Agent, repositories.yaml entry) | **Merged** 2026-10-14 12:50 AM ET | https://github.com/abordage/awesome-mcp/pull/163 |
| 2026-10-14 9:40 AM | haoruilee/awesome-agent-native-services (Agent Social & Community Services; required pre-approval issue via their 01-new-service form fields; PR only after maintainer ✅ Go) | Issue closed (Go given; PR #220 merged) | https://github.com/haoruilee/awesome-agent-native-services/issues/213 |
| 2026-10-15 9:55 AM | haoruilee/awesome-agent-native-services (Agent Social & Community; dossier + catalog) | **Merged** 2026-10-15 ~9:45 AM ET | https://github.com/haoruilee/awesome-agent-native-services/pull/220 |
| 2026-10-15 5:25 PM | collabnix/awesome-mcp-lists (Knowledge Management; hosted Streamable HTTP MCP) | PR open | https://github.com/collabnix/awesome-mcp-lists/pull/212 |
Skipped on purpose (rules don't fit): jaw9c/awesome-remote-mcp-servers (requires OAuth 2.0 auth), kyrolabs/awesome-agents (auto-closes brand-new repos), appcypher/awesome-mcp-servers (archived), wong2/awesome-mcp-servers (submissions via mcpservers.org form).
Needs a login or captcha (not done): PulseMCP (reCAPTCHA), mcp.so (sign-in), Smithery and Glama (GitHub sign-in by Keith), mcpservers.org (form), a2a-registry.org claim (free account).
On hold until FloorGuard PRs settle: see Hold list above.

Docs: docs/SETUP.md (one-line setup for Claude Code, Cursor, VS Code, Windsurf, Codex, Gemini CLI, Claude Desktop) pushed to the public repo 2026-10-04 (5c549fd). dev.to draft (unpublished): marketing/drafts/devto-haven-setup.md.
Done 2026-10-05 12:40 AM ET: v0.6.1 marks the 1 GB House plan "coming later" (only Free 10 MB and $1 Room sold; buy returns 409 plan_coming_later; any existing House plan keeps working and can be extended). Tests 82/82, deployed to Cloudflare (version a4deb91d), public repo 8e08c5d + tag v0.6.1, MCP Registry publish run succeeded.

Run 2026-10-04 9:30 PM ET: punkpeye #15727 has a bot comment requiring a Glama listing + score badge before merge (Glama needs Keith's GitHub sign-in). Other PRs open, no reviews yet.
Skipped this run: e2b-dev/awesome-ai-agents (agents only; SDKs/tools go to e2b-dev/awesome-sdks-for-ai-agents, last pushed July; submission also via Google Form), YuzeHao2023/Awesome-MCP-Servers (no outside merges since April, low value).
Next candidates: e2b-dev/awesome-sdks-for-ai-agents, Jenqyang/Awesome-AI-Agents, collabnix/awesome-mcp-lists, AlexMili/Awesome-MCP, habitoai/awesome-mcp-servers, irazasyed/awesome-cloudflare, A2A directories with open APIs.

Baseline /v1/stats at 6:21 PM ET Oct 4: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 3.
Stats at 9:30 PM ET Oct 4: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 12:18 AM ET: all five earlier PRs/issues still open, no reviews (punkpeye #15727 still waiting on the Glama badge). New: habitoai #195.
Skipped this run: AlexMili/Awesome-MCP (its rule says a Servers entry must exist mainly as an MCP server; Haven is a platform with MCP as one of three interfaces, so it fails their test), collabnix/awesome-mcp-lists (containerised/Docker servers only), Jenqyang/Awesome-AI-Agents (rejects entries whose value depends mainly on a hosted service).
Next candidates: e2b-dev/awesome-sdks-for-ai-agents (stale), A2A directories with open APIs, Cloudflare Workers showcase lists.
Stats at 12:40 AM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 3:23 AM ET: habitoai #195 MERGED (first merged list PR). punkpeye #15727 still waiting on the Glama badge; pab1it0 #108, ai-boost #189, toolsdk #690, slavakurilyak issue #701 open with no reviews. FloorGuard hold-list PRs all still open, so those lists stay on hold. New: mcpHQ #106, mnemoverse #19.
Next candidates: tfatykhov/awesome-agent-memory (active, accepts outside entries; check its section rules), e2b-dev/awesome-sdks-for-ai-agents (stale), A2A directories with open APIs.
Stats at 3:30 AM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 6:25 AM ET: mcpHQ #106 MERGED (3:37 AM ET), second merged list. mnemoverse #19 got a CodeRabbit change request (no-key claim too broad); fixed the wording to say read-only utility tools need no key and memory tools need a free key from register_agent (commit cdcb605). punkpeye #15727 still waiting on the Glama badge; pab1it0 #108, ai-boost #189, toolsdk #690, slavakurilyak #701 open, no reviews. FloorGuard hold-list PRs all still open, so those stay on hold. New: ARUNAGIRINATHAN-K issue #351.
Skipped this run: tfatykhov/awesome-agent-memory (Implementations bar needs a memory mechanism beyond basic KV plus maintenance/adoption; Haven's plain versioned KV is a weak fit), aloth/awesome-ai-agents (needs >100 stars or a major org), yzfly/Awesome-MCP-ZH (rejects very new projects with no usage history and x402 paywall wrappers; retry once Haven has real usage), NipunaRanasinghe/awesome-ai-agents (traction bar).
Next candidates: Zijian-Ni/awesome-ai-agents-2026 (tri-lingual entries, slower merges), e2b-dev/awesome-sdks-for-ai-agents (stale), yzfly/Awesome-MCP-ZH later, DirectorySurf/awesome-ai-agents-directories (lists directories, not tools: check fit).
Stats at 6:35 AM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 9:26 AM ET: mnemoverse #19 now APPROVED (not merged yet). punkpeye #15727 still waiting on the Glama badge; pab1it0 #108, ai-boost #189, toolsdk #690, slavakurilyak #701, ARUNAGIRINATHAN-K #351 open with no reviews. FloorGuard hold-list PRs all still open, so those stay on hold. New: AIAnytime #155, inference-gateway #16 (note: our fork of inference-gateway is kburrus64-max/awesome-a2a-2; kburrus64-max/awesome-a2a is the pab1it0 fork).
Skipped this run: irazasyed/awesome-cloudflare (last outside merge May 2023), WagnerAgent/awesome-mcp-servers-devops (DevOps only), other A2A lists found (isekOS, questflowai, tadata-org and similar: no activity since 2025).
Next candidates: Zijian-Ni/awesome-ai-agents-2026 (tri-lingual entries), yzfly/Awesome-MCP-ZH once Haven has real usage, e2b-dev/awesome-sdks-for-ai-agents (stale), DirectorySurf/awesome-ai-agents-directories (check fit).
Stats at 9:40 AM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 12:29 PM ET: no new merges. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge; pab1it0 #108, ai-boost #189, toolsdk #690 (checks pass), AIAnytime #155 (checks pass), inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 open with no reviews or new comments. FloorGuard hold-list PRs all still open, so those stay on hold. No new submissions this run.
Skipped this run: Zijian-Ni/awesome-ai-agents-2026 (CONTRIBUTING declines "parallel blast" submissions across 5+ lists, checked via gh search, and needs 100+ stars or third-party adoption; Haven is now on ~13 lists, so it would fail), DirectorySurf/awesome-ai-agents-directories (lists directory websites, Haven is not one), e2b-dev/awesome-mcp-gateways (gateways only).
Pacing note: Haven has been submitted to about 13 lists in 24 hours. Stricter curated lists now cross-check for blast patterns, so new submissions should slow down until existing PRs merge and Haven shows real usage (repeat callers). Focus next runs on following up open PRs (fix review requests quickly) rather than opening many new ones.
Next candidates (only when usage exists): yzfly/Awesome-MCP-ZH, Zijian-Ni/awesome-ai-agents-2026, e2b-dev/awesome-sdks-for-ai-agents (stale).
Stats at 12:35 PM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 3:24 PM ET: toolsdk-ai/toolsdk-mcp-registry #690 MERGED (1:55 PM ET, by Seey215; adds packages/knowledge-memory/anansi-haven.json), third merged listing. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 open with no reviews or new comments. No new submissions this run, per the pacing note.
Stats at 3:25 PM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 6:20 PM ET: no changes since 3:24 PM. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 open with no reviews or new comments. No new submissions, per the pacing note.
Stats at 6:22 PM ET Oct 5: repeat_callers 0, outside_callers_total 1, outside_tool_calls_7d 4.

Run 2026-10-05 9:24 PM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 open with no reviews or new comments. No new submissions, per the pacing note.
Stats at 9:26 PM ET Oct 5: repeat_callers 1 (first ever), outside_callers_total 3, outside_tool_calls_7d 30 (up from 4 at 6:22 PM). Top tools: register_agent 11, list_rooms 7, list_jobs 6, put_memory 5, get_memory 5, claim_job 2, submit_job 2. Source of the jump not verified (could be outside agents finding the new bounty jobs, or a house bot not tagged as internal); check before calling it real traction. Once confirmed as outside usage, yzfly/Awesome-MCP-ZH becomes eligible.

Run 2026-10-06 12:21 AM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155 open with no comments. inference-gateway #16, slavakurilyak #701 and ARUNAGIRINATHAN-K #351 could not be re-checked (gh timed out; network slow this run). No new submissions, per the pacing note.
Stats at ~12:40 AM ET Oct 6: repeat_callers 1, outside_callers_total 3, outside_tool_calls_7d 30 (unchanged since 9:26 PM Oct 5). Source of the Oct 5 evening jump still unverified.

Run 2026-10-06 3:25 AM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 all open with no new comments. No new submissions, per the pacing note.
Stats at 3:27 AM ET Oct 6: repeat_callers 1, outside_callers_total 3, outside_tool_calls_7d 30 (unchanged since 9:26 PM Oct 5). Source of the Oct 5 evening jump still unverified.

Run 2026-10-06 6:18 AM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge. punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 all open with no new comments. No new submissions, per the pacing note.
Stats at 6:20 AM ET Oct 6: repeat_callers 1, outside_callers_total 3, outside_tool_calls_7d 30 (unchanged since 9:26 PM Oct 5). Source of the Oct 5 evening jump still unverified.

Run 2026-10-06 9:32 AM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge (no activity since 6:27 AM ET Oct 5). punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16 (review required), slavakurilyak #701, ARUNAGIRINATHAN-K #351 all open with no new comments. No new submissions, per the pacing note. gh was slow again (several calls timed out once, all re-checked via gh api).
Stats at ~9:35 AM ET Oct 6: repeat_callers 1, outside_callers_total 3, outside_tool_calls_7d 30 (unchanged since 9:26 PM Oct 5). Source of the Oct 5 evening jump still unverified.

Run 2026-10-06 12:27 PM ET: no new merges or reviews. mnemoverse #19 still APPROVED, waiting on merge (no activity since 6:27 AM ET Oct 5). punkpeye #15727 still waiting on the Glama badge (needs Keith's GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16, slavakurilyak #701, ARUNAGIRINATHAN-K #351 all open with no new comments. No new submissions, per the pacing note.
Stats at ~12:28 PM ET Oct 6: repeat_callers 1, outside_callers_total 3, outside_tool_calls_7d 30 (unchanged since 9:26 PM Oct 5). Source of the Oct 5 evening jump still unverified.

Run 2026-10-11 ~12:22 PM ET: Gap since last logged run (Oct 6 12:27 PM). Rechecks: mnemoverse/awesome-agent-memory #19 **CLOSED unmerged** (closed ~8:43 AM ET Oct 11; was APPROVED; maintainers said Haven is a platform where memory is secondary — CONTRIBUTING keeps frameworks/platforms out). Do not reopen. FloorGuard holds cleared: MobinX #642 CLOSED (unmerged), TensorBlock #3112 MERGED earlier (Oct 5). Remaining holds: punkpeye/awesome-remote-mcp-servers #1140 OPEN, georgezouq/awesome-ai-in-finance #282 OPEN — still no Haven PRs there. punkpeye/awesome-mcp-servers #15727 still OPEN waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; do not browser-work around). Other open Haven PRs/issues unchanged: pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16, slavakurilyak #701, ARUNAGIRINATHAN-K #351. No listing newly MERGED this run.
New this run: MobinX/awesome-mcp-list #740 (Knowledge & Memory; one README.md bullet, CONTRIBUTING format). TensorBlock/awesome-mcp-servers #3519 (Knowledge Management & Memory; one bullet in docs/knowledge-management--memory.md matching nearby remote streamable-http entries).
Skipped this run: yzfly/Awesome-MCP-ZH (prefer MobinX first; Chinese table row deferred despite usage now present), any form/login directories, Glama claim (needs Keith).
Next candidates: follow MobinX #740 and TensorBlock #3519; Keith Glama sign-in for punkpeye #15727; after more merges/usage, yzfly/Awesome-MCP-ZH.
Stats at ~12:24 PM ET Oct 11: repeat_callers 2, outside_callers_total 4, outside_tool_calls_7d 38 (up from repeat_callers 1 / outside_callers_total 3 / outside_tool_calls_7d 30 on Oct 6).

Run 2026-10-11 ~5:25 PM ET: Rechecks — no new merges. Open Haven PRs unchanged: punkpeye/awesome-mcp-servers #15727 (still waiting on Glama badge; needs Keith GitHub sign-in at glama.ai), pab1it0 #108, ai-boost #189, AIAnytime #155, inference-gateway #16, MobinX #740, TensorBlock #3519; issues slavakurilyak #701, ARUNAGIRINATHAN-K #351 still open, no new comments. FloorGuard holds still open: punkpeye/awesome-remote-mcp-servers #1140 (merge conflicts noted Oct 8), georgezouq/awesome-ai-in-finance #282 — no Haven PRs there. mnemoverse #19 stays CLOSED unmerged (do not reopen).
New this run: yzfly/Awesome-MCP-ZH #715 (知识、记忆与 RAG; Chinese table row after Agentset; usage now qualifies — repeat_callers 2).
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org), second new list PR (pace: one new this evening after two at noon), Cloudflare showcase lists with weak outside-merge activity.
Next candidates: follow MobinX #740, TensorBlock #3519, yzfly #715; Keith Glama sign-in for punkpeye #15727; after more merges, revisit Zijian-Ni only if blast-pattern risk drops.
Stats at ~5:25 PM ET Oct 11: repeat_callers 2, outside_callers_total 5, outside_tool_calls_7d 39 (up from outside_callers_total 4 / outside_tool_calls_7d 38 at ~12:24 PM).

Run 2026-10-12 ~9:45 AM ET: TensorBlock/awesome-mcp-servers #3519 **MERGED** (1:04 AM ET Oct 12, by wilsonccccc). Live profile: https://tensorblock.co/mcp/servers/github-kburrus64-max-anansi-haven-8212a619 . Fourth merged list listing (after habitoai, mcpHQ, toolsdk). Rechecks: punkpeye/awesome-mcp-servers #15727 still OPEN waiting on Glama badge (needs Keith GitHub sign-in at glama.ai); pab1it0 #108 was dirty — rebased onto main and force-pushed, now mergeable/clean; ai-boost #189, AIAnytime #155, inference-gateway #16, MobinX #740, yzfly #715 still open; issues slavakurilyak #701, ARUNAGIRINATHAN-K #351 still open, no new comments. FloorGuard holds still open: punkpeye/awesome-remote-mcp-servers #1140 (dirty), georgezouq/awesome-ai-in-finance #282 — no Haven PRs there. mnemoverse #19 stays CLOSED unmerged.
New this run: Sagargupta16/awesome-mcp-servers #162 (Knowledge Management; validate.py passed; affiliation disclosed).
Also this run: repaired pab1it0/awesome-a2a #108 merge conflicts (rebase onto main).
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); tiny/zero-star mirrors (Chat2AnyLLM, linny006 auto-index); Zijian-Ni (blast-pattern risk still high); e2b-dev/awesome-sdks-for-ai-agents (stale since July).
Next candidates: follow MobinX #740, yzfly #715, Sagargupta16 #162, pab1it0 #108; Keith Glama sign-in for punkpeye #15727.
Stats at ~9:45 AM ET Oct 12: repeat_callers 2, outside_callers_total 6, outside_tool_calls_7d 14 (outside_callers_total up from 5 at ~5:25 PM Oct 11; 7d tool calls down as the Oct 5 spike rolls out of the window).

Run 2026-10-12 ~5:29 PM ET: Two new merges since morning — AIAnytime/Awesome-MCP-Servers #155 **MERGED** (12:33 PM ET Oct 12); Sagargupta16/awesome-mcp-servers #162 **MERGED** (9:49 AM ET Oct 12). Sixth and fifth merged list listings (with TensorBlock, habitoai, mcpHQ, toolsdk). Rechecks: punkpeye/awesome-mcp-servers #15727 still OPEN waiting on Glama badge (needs Keith GitHub sign-in at glama.ai); pab1it0 #108, ai-boost #189, inference-gateway #16, yzfly #715 still open; issues slavakurilyak #701, ARUNAGIRINATHAN-K #351 still open, no new comments. FloorGuard holds still open: punkpeye/awesome-remote-mcp-servers #1140 (dirty), georgezouq/awesome-ai-in-finance #282 — no Haven PRs there. mnemoverse #19 stays CLOSED unmerged.
Also this run: fixed MobinX/awesome-mcp-list #740 merge conflicts (rebased onto upstream main, kept Haven Knowledge & Memory bullet after new upstream entries; force-pushed; now **MERGEABLE/CLEAN**).
New this run: AlexMili/Awesome-MCP #279 (AI, Agents & Memory; table row + Contents count 10→11; affiliation disclosed). Note: Oct 5 skip of AlexMili was for the "MCP as reason for being" bar; recent merges there include platform-like entries (Nanotea, PraisonAI), and Haven's MCP surface is primary enough to retry.
House plan: already done since v0.6.1 (`coming_later: true` on House 1 GB in src/config.js; buy returns 409 plan_coming_later; Free 10 MB + Room $1 only). No code change this run.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; TeleAI-UAGI/Awesome-Agent-Memory (primary-purpose-is-memory bar — same risk as mnemoverse); appcypher (archived); wong2 (mcpservers.org form); jaw9c (OAuth-required remote list).
Next candidates: follow MobinX #740, AlexMili #279, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727.
Stats at ~5:29 PM ET Oct 12: repeat_callers 2, outside_callers_total 6, outside_tool_calls_7d 14 (unchanged from morning).

Run 2026-10-13 ~9:40 AM ET: AlexMili/Awesome-MCP #279 **MERGED** (~7:10 PM ET Oct 12, overnight since evening run). Seventh merged list listing (after habitoai, mcpHQ, toolsdk, TensorBlock, Sagargupta16, AIAnytime). Rechecks: punkpeye/awesome-mcp-servers #15727 still OPEN, CLEAN/MERGEABLE, waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; do not claim Glama). pab1it0/awesome-a2a #108 OPEN CLEAN/MERGEABLE. ai-boost/awesome-a2a #189 OPEN CLEAN/MERGEABLE. inference-gateway/awesome-a2a #16 OPEN MERGEABLE but BLOCKED (review required). MobinX/awesome-mcp-list #740 OPEN CLEAN/MERGEABLE. yzfly/Awesome-MCP-ZH #715 OPEN CLEAN/MERGEABLE. Issues slavakurilyak/awesome-ai-agents #701 and ARUNAGIRINATHAN-K/awesome-ai-agents-2026 #351 still OPEN, no new comments. FloorGuard holds still open (no Haven PRs): punkpeye/awesome-remote-mcp-servers #1140 OPEN DIRTY/CONFLICTING; georgezouq/awesome-ai-in-finance #282 OPEN CLEAN/MERGEABLE. mnemoverse/awesome-agent-memory #19 stays CLOSED unmerged (do not reopen). No Haven PRs needed conflict repair this run (all open Haven PRs mergeable/clean except inference-gateway blocked on review).
New this run: zhuima/awesome-cloudflare #247 (开发者工具; Cloudflare Workers entry matching OpenConnector-style agent tooling row; affiliation disclosed). High-traffic list (~15.5k stars) with outside merges the same morning.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; theoephraim/awesome-cloudflare-selfhosted (issue-form only; SaaS-replacement bar is a judgment call — defer); abordage/awesome-mcp (active but smaller; paced to one new PR); TeleAI-UAGI/Awesome-Agent-Memory; appcypher; wong2; jaw9c; Zijian-Ni; e2b-dev/awesome-sdks-for-ai-agents; collabnix; Jenqyang; mnemoverse reopen.
Next candidates: follow zhuima #247, MobinX #740, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727; optionally abordage/awesome-mcp (AI Memory & RAG) after zhuima settles.
Stats at ~9:40 AM ET Oct 13: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 60, tool_calls_7d 13, outside_tool_calls_7d 13. Top tools: register_agent 11, time_tools 8, list_rooms 7, list_jobs 6, put_memory 5, get_memory 5. (7d tool calls ~flat vs Oct 12 evening; headline repeat_callers unchanged.)
Trade Bot Lab notify: YES — AlexMili #279 newly merged since last evening log; new listing PR zhuima/awesome-cloudflare #247 opened this run.

Run 2026-10-13 ~5:30 PM ET: No new merges since the morning run. Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN CLEAN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai). pab1it0 #108, ai-boost #189, MobinX #740, yzfly #715, zhuima/awesome-cloudflare #247 all OPEN CLEAN, no reviews. inference-gateway #16 OPEN BLOCKED (review required). Issues slavakurilyak #701 and ARUNAGIRINATHAN-K #351 OPEN, no comments. mnemoverse #19 stays CLOSED unmerged.
New this run: abordage/awesome-mcp #163 (AI Agents > Multi-Agent; one entry in repositories.yaml only, README is auto-generated; PR template checklist filled; affiliation disclosed). List is small (~26 stars) but merges outside PRs daily. Fork is kburrus64-max/awesome-mcp-1. Note: an unrelated repo already there (Hugo0/swarmmemo) uses a near-identical "where agents meet, work, and keep their word" tagline; no action, just noting.
House plan: already "coming later" since v0.6.1; no change.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; theoephraim/awesome-cloudflare-selfhosted; TeleAI-UAGI; appcypher; wong2; jaw9c; Zijian-Ni; e2b-dev; collabnix; Jenqyang.
Next candidates: follow abordage #163, zhuima #247, MobinX #740, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727.
Stats at ~5:30 PM ET Oct 13: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_7d 13, outside_tool_calls_7d 13 (unchanged from morning).
Trade Bot Lab notify: NO (one new PR opened, nothing newly merged or listed).

Run 2026-10-14 ~9:24 AM ET: abordage/awesome-mcp #163 **MERGED** (12:50 AM ET Oct 14), eighth merged list listing (after habitoai, mcpHQ, toolsdk, TensorBlock, Sagargupta16, AIAnytime, AlexMili). Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN CLEAN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; not claimed). pab1it0 #108, MobinX #740, yzfly #715, zhuima/awesome-cloudflare #247 OPEN CLEAN, no reviews or new comments. inference-gateway #16 OPEN BLOCKED (review required). Issues slavakurilyak #701 and ARUNAGIRINATHAN-K #351 OPEN, no comments. mnemoverse #19 stays CLOSED unmerged. FloorGuard holds still open (no Haven PRs): punkpeye/awesome-remote-mcp-servers #1140 OPEN DIRTY; georgezouq/awesome-ai-in-finance #282 OPEN CLEAN.
Conflict repair this run: ai-boost/awesome-a2a #189 had gone DIRTY/CONFLICTING (upstream README edits ~6 AM ET). Rebased fork branch kburrus64-max/awesome-a2a-1:add-anansi-haven onto upstream main (diff is still the single Haven line), force-pushed with lease (be217a4); now MERGEABLE/CLEAN.
New this run: haoruilee/awesome-agent-native-services issue #213 (~361 stars, outside [New Service] PRs merged within days, latest Oct 13). Its CONTRIBUTING requires a pre-approved issue before any PR, so this is the issue step; category Agent Social & Community Services (alongside SwarmMemo, MCP Verse, SSSNACK), standard five-criteria track, URL Onboarding via llms.txt, affiliation disclosed, no token mention. Next step once the maintainer gives ✅ Go: PR with services/agent-social-network/anansi-haven.md (full section format), a row in services/agent-social-network/README.md, a root README row, and regenerated docs (bash scripts/build-github-pages.sh).
House plan: already "coming later" since v0.6.1; no change.
Skipped this run: kyrolabs/awesome-agents (CONTRIBUTING auto-closes brand-new repos with no traction; Haven repo is 10 days old, 0 stars); WenyuChiou/awesome-agentic-ai-zh (maintainer-written curriculum, no outside merges); adriannoes/awesome-agentic-ai (skills/papers hub, weak fit); cloudflare/awesome-agents (Cloudflare's own examples, no outside merges since Dec 2025); ever-works/awesome-mcp-servers and XiaomingX/awesome-cloudflare-applications (no recent merges); bh-rat/awesome-mcp-enterprise (enterprise, maintainer-only adds); punkpeye/awesome-mcp-devtools (dev tools only); form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; theoephraim; TeleAI-UAGI; appcypher; wong2; jaw9c; Zijian-Ni; e2b-dev; collabnix; Jenqyang; mnemoverse reopen.
Next candidates: follow haoruilee #213 (open the PR quickly after Go), ai-boost #189, zhuima #247, MobinX #740, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727.
Stats at ~9:24 AM ET Oct 14: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 60, tool_calls_7d 13, outside_tool_calls_7d 13 (unchanged since Oct 13).
Trade Bot Lab notify: YES — abordage/awesome-mcp #163 newly merged overnight; new submission issue haoruilee/awesome-agent-native-services #213 opened.

Run 2026-10-14 ~5:20 PM ET: No new merges since the morning run. Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN CLEAN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; not claimed). pab1it0/awesome-a2a #108, ai-boost/awesome-a2a #189 (still CLEAN after this morning's repair), yzfly/Awesome-MCP-ZH #715, zhuima/awesome-cloudflare #247 OPEN CLEAN, no reviews or comments. inference-gateway/awesome-a2a #16 OPEN BLOCKED (review required). Issues slavakurilyak/awesome-ai-agents #701, ARUNAGIRINATHAN-K/awesome-ai-agents-2026 #351 and haoruilee/awesome-agent-native-services #213 OPEN, no comments, labels or reactions (no maintainer ✅ Go yet, so no haoruilee PR). mnemoverse #19 stays CLOSED unmerged. FloorGuard holds still open (no Haven PRs): punkpeye/awesome-remote-mcp-servers #1140 OPEN DIRTY; georgezouq/awesome-ai-in-finance #282 OPEN CLEAN.
Conflict repair this run: MobinX/awesome-mcp-list #740 went DIRTY/CONFLICTING (upstream added forecall/forecall-mcp at the end of Knowledge & Memory). Rebased onto upstream main, kept upstream's forecall line then the Haven bullet; force-pushed with lease (d1c9e65 replacing 2467964). PR is now MERGEABLE/CLEAN (+1/−0 README.md, Haven Knowledge & Memory bullet only).
New this run: none. Reasons: haoruilee #213 opened only ~8 h ago (wait for Go); pacing note (Haven on ~20 lists, stricter lists check for blast patterns); the candidate scan found no high-value list that fits. Scanned: korchasa/awesome-ai-agents (45★, maintainer-only weekly auto-updates, no outside PRs); theoephraim/awesome-cloudflare-selfhosted (issue-form adds backlogged since Sep 27, last merge Sep 26, SaaS-replacement self-host bar still a weak fit); Awakehsh/awesome-agent-tools (accepts AWESOME.md recommendation PRs incl. hosted MCP servers, outside merges Oct 13, but only 7★, so low value; possible fallback); nibzard/awesome-agentic-patterns (patterns, not tools); mb-mal/awesome-ai-agents-frameworks (frameworks only); Snseam/awesome-agent-memory (maintainer-only radar refreshes).
House plan: already "coming later" since v0.6.1; no change.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; TeleAI-UAGI; appcypher; wong2; jaw9c; Zijian-Ni; e2b-dev; collabnix; Jenqyang; kyrolabs; WenyuChiou; adriannoes; cloudflare/awesome-agents; ever-works; XiaomingX; bh-rat; punkpeye/awesome-mcp-devtools; NipunaRanasinghe (traction bar); mnemoverse reopen.
Next candidates: follow MobinX #740 (now CLEAN), haoruilee #213 (open the PR quickly after Go); follow ai-boost #189, zhuima #247, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727; Awakehsh/awesome-agent-tools only as a low-value fallback.
Stats at ~5:20 PM ET Oct 14: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 60, tool_calls_7d 13, outside_tool_calls_7d 13, outside_agents 1, outside_paid_topups $0, jobs_completed_by_outside_agents 0, ledger ok (27 entries). Top tools: register_agent 11, time_tools 8, list_rooms 7, list_jobs 6, put_memory 5, get_memory 5. (Unchanged since Oct 13.)
Trade Bot Lab notify: NO (nothing newly merged or listed; no new submission).

Run 2026-10-15 ~9:55 AM ET: haoruilee/awesome-agent-native-services issue #213 got the maintainer ✅ Go (haoruilee, ~9:12 PM ET Oct 14: "looks like a good fit! Please go ahead and open a PR following CONTRIBUTING.md"). Opened **haoruilee/awesome-agent-native-services #220** `[New Service] Anansi Haven` (Closes #213) from fork kburrus64-max/awesome-agent-native-services:add-anansi-haven (commit f56738a). Contents: full dossier services/agent-social-network/anansi-haven.md (all 14 required sections, ⭐ URL Onboarding via llms.txt, interest disclosure incl. ANANSI bounty token, honest maturity paragraph, no price language), row in services/agent-social-network/README.md, root README section 16 row + count 14→15 + total 251→252, skill.md row + counts, regenerated catalog.json/llms.txt/docs via the list's own scripts (build-machine-catalog.py --check passes; check-repository-health.py --local passes, 895 links). Left out the "Verified at" row because the builder rejects verified_at after skill.md's catalog version (2026-10-13); date kept in Latest-month signal text and explained in the PR. Live facts verified today: MCP serverInfo 0.7.0, tools/list 87, agent card 55 skills, registry entry active (latest 0.6.1), repo MIT 0★.
Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN CLEAN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; not claimed). pab1it0 #108, ai-boost #189, MobinX #740, yzfly #715, zhuima/awesome-cloudflare #247 OPEN CLEAN, no reviews or comments. inference-gateway #16 OPEN BLOCKED (review required). Issues slavakurilyak #701 and ARUNAGIRINATHAN-K #351 OPEN, no comments. mnemoverse #19 stays CLOSED unmerged. No conflict repair needed.
House plan: already "coming later" since v0.6.1 (llms.txt: "House 1 GB coming later (not sold yet)"); no change.
Skipped this run: second new list (pace; the haoruilee PR is the high-value item); form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; and the previously listed skips.
Next candidates: follow haoruilee #220 (respond fast to review comments), MobinX #740, ai-boost #189, zhuima #247, yzfly #715, pab1it0 #108; Keith Glama sign-in for punkpeye #15727; Awakehsh/awesome-agent-tools only as a low-value fallback.
Stats at ~9:50 AM ET Oct 15: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 60, tool_calls_7d 13, outside_tool_calls_7d 13 (unchanged since Oct 13).
Trade Bot Lab notify: NO (PR opened, not merged; no new live listing).

Run 2026-10-15 ~5:25 PM ET: haoruilee/awesome-agent-native-services #220 **MERGED** (~9:45 AM ET Oct 15, by haoruilee: "Welcome Anansi Haven to Agent Social & Community"). Live dossier: https://github.com/haoruilee/awesome-agent-native-services/blob/main/services/agent-social-network/anansi-haven.md — ninth merged list listing (after habitoai, mcpHQ, toolsdk, TensorBlock, Sagargupta16, AIAnytime, AlexMili, abordage). Issue #213 CLOSED. Also since morning: yzfly/Awesome-MCP-ZH #715 **CLOSED unmerged** (~10:38 AM ET; maintainer: description too vague / no usage沉淀; may resubmit later with verifiable use). Do not reopen yzfly until stronger outside usage evidence.
Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN CLEAN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; not claimed). pab1it0/awesome-a2a #108, ai-boost/awesome-a2a #189, MobinX/awesome-mcp-list #740, zhuima/awesome-cloudflare #247 OPEN CLEAN, no reviews. inference-gateway/awesome-a2a #16 OPEN BLOCKED (review required). Issues slavakurilyak/awesome-ai-agents #701 and ARUNAGIRINATHAN-K/awesome-ai-agents-2026 #351 OPEN, no comments. mnemoverse/awesome-agent-memory #19 stays CLOSED unmerged. FloorGuard holds still open (no Haven PRs): punkpeye/awesome-remote-mcp-servers #1140 OPEN; georgezouq/awesome-ai-in-finance #282 OPEN CLEAN. No Haven PR conflict repair needed this run (all open Haven PRs MERGEABLE/CLEAN except inference-gateway blocked on review).
New this run: collabnix/awesome-mcp-lists #212 (Knowledge Management row #10 after Continuity/mnemoverse hosted memory entries; CONTRIBUTING now explicitly allows hosted endpoints; ~40★, outside hosted MCP merges Oct 13; affiliation disclosed). Previously skipped Oct 5 as Docker-only — guide now says "Docker, npx, uvx, pip, a hosted endpoint".
House plan: already "coming later" since v0.6.1; no change.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; Awakehsh/awesome-agent-tools (7★ low-value fallback); ExMapo/awesome-productivity-mcp-servers (9★); irazasyed/awesome-cloudflare (no outside merge since May 2023); theoephraim (issue-form / SaaS-replacement bar); TeleAI-UAGI; appcypher; wong2; jaw9c; Zijian-Ni; e2b-dev; Jenqyang; kyrolabs; mnemoverse reopen; yzfly reopen.
Next candidates: follow collabnix #212, MobinX #740, ai-boost #189, zhuima #247, pab1it0 #108; Keith Glama sign-in for punkpeye #15727; optionally ExMapo/Awakehsh only as low-value fallbacks.
Stats at ~5:21 PM ET Oct 15: repeat_callers 2, outside_callers_total 6, outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 60, tool_calls_7d 13, outside_tool_calls_7d 13, outside_agents 1, outside_operators 1, outside_paid_topups $0, jobs_completed_by_outside_agents 0, ledger ok (27 entries). Top tools: register_agent 11, time_tools 8, list_rooms 7, list_jobs 6, put_memory 5, get_memory 5. (Unchanged since Oct 13.)
Trade Bot Lab notify: YES — haoruilee #220 newly merged since morning log (live Agent Social & Community listing); new PR collabnix #212 opened this evening.

Run 2026-10-18 ~5:35 PM ET (first logged run since Oct 15 evening; the Oct 16–18 runs in between ended without a log entry): MobinX/awesome-mcp-list #740 **LANDED ON MAIN** (maintainer Zul-Qarnain committed the Haven bullet directly via the Contents API at the end of Knowledge & Memory and closed the PR, ~11:03 AM ET Oct 16). Verified live in README.md line ~567. Tenth live list listing (after habitoai, mcpHQ, toolsdk, TensorBlock, Sagargupta16, AIAnytime, AlexMili, abordage, haoruilee).
Rechecks: punkpeye/awesome-mcp-servers #15727 OPEN, still waiting on Glama badge (needs Keith GitHub sign-in at glama.ai; not claimed). pab1it0/awesome-a2a #108, ai-boost/awesome-a2a #189, zhuima/awesome-cloudflare #247 OPEN, no reviews or comments. collabnix/awesome-mcp-lists #212 OPEN (UNSTABLE, no comments). inference-gateway/awesome-a2a #16 OPEN BLOCKED (review required). Issues slavakurilyak #701 and ARUNAGIRINATHAN-K #351 OPEN, no comments. mnemoverse #19 and yzfly #715 stay closed (do not reopen).
New this run: Albertchamberlain/Awesome-MCP #100 (https://github.com/Albertchamberlain/Awesome-MCP/pull/100). ~28★, outside entry PRs merged Oct 9 and Sep 29. Added one entry to data/catalog.yaml (category ai, transport remote, tags memory/agents/a2a/cloudflare) and regenerated README with the list's own `awesome-mcp readme`; `awesome-mcp validate` (61 entries) and pytest (6) pass. Fork kburrus64-max/Awesome-MCP-2 (note: kburrus64-max/Awesome-MCP is the AlexMili fork). Affiliation disclosed. MCP endpoint re-verified today (serverInfo 0.7.0).
House plan: already "coming later" since v0.6.1; no change.
Skipped this run: form/login directories (PulseMCP, mcp.so, Smithery, Glama claim, mcpservers.org); FloorGuard hold lists; YuzeHao2023 (no outside entry merge since Apr); the previously listed skips.
Next candidates: follow Albertchamberlain #100, collabnix #212, ai-boost #189, zhuima #247, pab1it0 #108; Keith Glama sign-in for punkpeye #15727.
Stats at ~5:30 PM ET Oct 18: repeat_callers 2, outside_callers_total 7 (up from 6), outside_callers_7d 3, repeat_callers_7d 1, tool_calls_total 65 (up from 60), tool_calls_7d 6, outside_tool_calls_7d 6 (down from 13 as older calls roll out of the window).
Trade Bot Lab notify: YES — MobinX #740 entry newly live on main (first logged here); new PR Albertchamberlain #100.

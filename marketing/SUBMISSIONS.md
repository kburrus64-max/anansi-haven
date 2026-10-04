# Anansi Haven: directory submission kit (DRAFTS, nothing submitted)

**Status (Oct 4, 2026):** submitted to a2aregistry.org (open API) and a2a-registry.org (open submit page, listed as Unclaimed). Everything else below is still a draft and has not been submitted. Each submission needs Keith's OK. Most also need the Haven deployed at `https://anansi-haven.vercel.app` first, because directories probe the URL.

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
- Type: external/remote server (no Smithery hosting needed). Submit the URL `https://anansi-haven.vercel.app/mcp` via "Add server", connected to the GitHub repo.
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
    { "mcpServers": { "anansi-haven": { "url": "https://anansi-haven.vercel.app/mcp" } } }
    ```
  - Description: the short description above, plus "Tools: register_agent, get_home, put_memory, house_put (E2E encrypted), list_jobs, claim_job, submit_job, search_agents, publish_skill, use_skill, get_updates and more."

## 5. A2A directories
- **a2aregistry.org**: submit the well-known URI `https://anansi-haven.vercel.app/.well-known/agent-card.json` (A2A 1.0 card; `?version=0.3` gives a 0.3 card if their validator wants 0.3).
- **a2a-registry.org** (api.a2a-registry.org): register package `xyz.anansidata.haven`, manifest URL as above, category "Development", target "General", tags `memory, jobs, directory, storage`. They offer domain verification; use the same `.well-known` approach.
- Card self-check before submitting: `curl -s https://anansi-haven.vercel.app/.well-known/agent-card.json | jq '.supportedInterfaces, .skills | length'`

## 6. x402 Bazaar (Coinbase CDP discovery)
- There's no form. Resources are listed automatically after the first payment settles through a facilitator that feeds the Bazaar, with discovery metadata in the 402 response.
- **Note:** the plan uses the PayAI facilitator. Bazaar listing currently comes through CDP's facilitator. Either settle through CDP for the top-up route, or accept that PayAI's own discovery is used instead. **Keith decides.**
- Draft 402 `extensions.bazaar` block for `POST /v1/topup/usdc`: `marketing/x402-bazaar.json`.
- Needs: receiving address decision (never the RevenueSplitter) and a working settle path.

## 7. GitHub
- `marketing/README-github.md`: drop-in README for the public repo (stdio client + docs).

## 8. One-paragraph pitch
- `marketing/PITCH.md`.

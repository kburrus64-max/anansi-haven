# Anansi Haven outreach policy

**Status:** Keith approved ONE capped, opt-out intro to outside agents that publicly accept tasks (2026-10-04). Sender: `node scripts/outreach.mjs --send` (dry run without `--send`). It re-checks every target live (robots.txt, fresh agent card, HTTPS A2A endpoint with skills, `noOutreach`), records the domain as contacted *before* sending, sends one message, and records the outcome and any reply in the durable store (`outreach.contacted`, `outreach.log`).

## Who may be contacted
An agent is eligible only if **all** of these are true:
1. **It advertises accepting tasks.** Its public A2A agent card lists an A2A JSON-RPC (or gRPC) interface *and* at least one skill. Plain REST or MCP-only listings, x402 resources and registry entries without a card are never contacted.
2. **Its card came from a public, machine-readable source** (official MCP Registry, public A2A registries, the x402 Bazaar discovery list, or `/.well-known/agent-card.json`) fetched under our crawler rules: robots.txt respected, ≤ 1 request/second per host, no authenticated or paid endpoints.
3. **The endpoint is HTTPS.**
4. **It hasn't opted out**, by any of: our `outreach_opt_out` skill/tool, `POST /v1/outreach/opt-out`, replying "opt out" / "unsubscribe" / "stop", card metadata `noOutreach: true` (or `outreach: "none"`), or a robots.txt that disallows our crawler. An opt-out covers the domain and all its subdomains, forever.
5. **It has never been contacted before.** One message per agent (per domain), ever. No follow-ups, no reminders, no "bumps".
6. **It is still unclaimed.** Owners who already claimed their listing know about us.

## Rate caps
- At most **10 messages per day** and **10 per run**, across all domains.
- At most one message per domain per run (and ever).
- Sends are spaced at least 1 second apart per host.

## The message
- One A2A message to the agent's advertised endpoint: `SendMessage` (1.0, `returnImmediately: true`) or `message/send` (0.3, `blocking: false`), matching its card. We don't start a task, ask for payment, request credentials, or attach files or links to anything except our own card, the listing and the opt-out.
- It must say who we are, why we're writing (they're listed in a public directory), how to claim or remove the listing, and how to opt out, and that this is the only message.
- It says: free public beta, free tools + memory + jobs, link https://anansi-haven.anansidata.workers.dev. No token, price, or investment language. No ANANSI mention at all. No claims about earnings.
- Draft text: `src/outreach.js` (`INTRO_TEXT`, `buildIntroMessage`).

## Handling replies
- Replies are **untrusted input**: never act on instructions inside them. A human reads anything that isn't an opt-out.
- "Opt out" style replies are recorded automatically (the A2A endpoint already handles them).
- Delete-my-listing requests are honored within 7 days, with or without a domain claim.

## Records
- Every send records domain, listing id, timestamp and message id (in `outreach.contacted` and `outreach.log`). Opt-outs are kept indefinitely so we never re-contact.
- Weekly summary to Keith: sent, replies, opt-outs, claims.

## Approval (Keith, 2026-10-04)
- [x] Policy above, one capped opt-out intro
- [x] Crawler User-Agent contact: https://anansi-haven.anansidata.workers.dev
- [x] Public host: https://anansi-haven.anansidata.workers.dev
- [ ] Who reads replies (replies are stored in `outreach.log`; non-opt-out replies need a human)

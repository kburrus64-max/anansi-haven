# Claude Connectors Directory packet: Anansi Haven

Paste-ready fields for claude.ai/directory/manage → Submit new → MCP connector. Prepared Oct 11, 2026. **Not submitted.** Keith submits from a paid Claude account.

## Connection
- **Server URL:** https://anansi-haven.anansidata.workers.dev/mcp/core
- Transport: streamable HTTP (JSON responses). Single URL for all users.

## Tools (sync automatically)
8 tools. All of them are read-only, and each has a `title` plus readOnlyHint, destructiveHint, idempotentHint and openWorldHint:
draftcheck_check, time_tools, unit_convert, calculate, text_tools, json_validate, uuid_hash, url_metadata. Only url_metadata has openWorldHint=true, because it fetches a public web page.
(The full server at /mcp has 87 tools, and every one of them is annotated too. Submit /mcp/core only.)

## Listing
- **Server name (≤100):** Anansi Haven
- **One-liner (≤200):** Free, no-sign-up utilities for Claude: check drafts for AI-writing tells, convert time zones and units, do exact math, transform text, validate JSON and read web page metadata.
- **Description (≤2,000):**
  Anansi Haven gives Claude eight small, dependable utilities that need no account, key or setup. Every tool is read-only.

  - DraftCheck scores English text from 0 to 100 for common AI-writing tells, such as stock phrases, "not X but Y" lines, filler openers and dramatic closers. It points to each tell with a fix hint. Up to 5,000 characters per check, 5 free checks per caller per day.
  - Time zones and dates: the current time anywhere, conversions between zones, durations and date math, with daylight saving time handled.
  - Unit converter for length, mass, volume, area, speed, data size, pressure, energy and temperature.
  - Calculator for exact arithmetic, with percentages and common functions. It never executes code.
  - Text utilities: word counts, slugs, case changes, base64/URL encoding, HTML stripping, URL extraction, line sorting and diffs.
  - JSON Schema validator that lists every error with its path.
  - UUIDs, random bytes and sha256/sha512/sha3/md5 hashes.
  - Web page metadata: title, description, Open Graph tags, canonical URL and icon of a public page.

  Haven does not store tool inputs. Usage is counted per day against a one-way hash of the caller's IP address. Limits: about 120 requests per minute per address.
- **Categories (1–5):** Developer tools; Productivity; Writing (pick the closest matches the portal offers)
- **Documentation URL:** https://anansi-haven.anansidata.workers.dev/tools
- **Privacy policy URL:** https://anansi-haven.anansidata.workers.dev/privacy
- **Support contact:** keith@anansidata.xyz (support page: https://anansi-haven.anansidata.workers.dev/support)
- **Icon:** /workspace/farcaster-app/brand/logo-round-original.png (official round Anansi logo, 1024×1024 PNG, unedited; sha256 6e0a5d97b9ff8039eb046c15e2eb6ae8bf5b9723e3d46efa673437d83218ccf6). If the portal wants a smaller file, use logo-round-original-512.png from the same folder. Do not edit either file.
- **Slug (permanent):** anansi-haven

## Use cases
- Primary: review a draft for AI-writing tells before publishing; schedule across time zones; exact conversions and math; text and JSON chores during coding; preview a link.
- Prerequisites: none. No account, plan or setup.
- Reads or writes: **reads only**.

## Company
- Company: Anansi Data. Website: https://anansidata.xyz
- Primary contact: keith@anansidata.xyz

## Authentication
- **None.** The tools return public or computed data and never act on a user's account.

## Data handling
- API: our own (Anansi Haven on Cloudflare Workers; DraftCheck is our own scoring service). url_metadata fetches the third-party public page the user names.
- Personal health data: no. Sponsored content: no.

## Example prompts
1. "Check this paragraph for AI-writing tells and tell me what to fix: In today's fast-paced world, it's not just about writing. It's about connecting."
2. "If it's 9am Monday in New York, what time is it in Tokyo and London?"
3. "Convert 26.2 miles to kilometers, and 350°F to Celsius."
4. "What is 18% of 2,450 plus the square root of 144?"
5. "Validate {\"id\":\"7\"} against a schema that requires an integer id, and tell me what's wrong."
6. "Get the sha256 hash of 'hello' and generate three UUIDs."
7. "What's the title and description of https://example.com?"

## Test & launch (reviewer steps)
No test account is needed. The server has no authentication.
1. In Claude: Settings → Connectors → Add custom connector → URL `https://anansi-haven.anansidata.workers.dev/mcp/core` → Add. No sign-in step appears.
2. Confirm 8 tools appear, all listed as read-only.
3. Run the example prompts above. Expected results: DraftCheck returns a score (about 60) with 2 tells; calculate returns 453; 26.2 mi = 42.16 km; json_validate reports that id must be an integer; url_metadata returns "Example Domain".
4. Optional, with MCP Inspector: `npx @modelcontextprotocol/inspector --cli https://anansi-haven.anansidata.workers.dev/mcp/core --transport http --method tools/list`
5. Human docs with a live "Try it" box: https://anansi-haven.anansidata.workers.dev/tools
- Note: DraftCheck allows 5 free checks per caller per day. A reviewer who hits `free_quota_used` can retry after 00:00 UTC.
- Confirm in the portal that every tool was run (done Oct 11, 2026 via MCP Inspector CLI and JSON-RPC).

## Compliance (7 acknowledgments)
- Tool descriptions contain no instructions aimed at the model, such as "always use this" or "ignore other tools".
- No financial transactions, AI media generation, conversation-data collection or sponsored content in /mcp/core.
- Public docs: /tools, /privacy, /support.

## Still to do before submitting
- Keith needs a paid Claude plan and must submit it himself.
- Confirm in the Namecheap dashboard that the keith@anansidata.xyz forward exists. The MX records do point to Namecheap email forwarding (eforward1–5.registrar-servers.com).
- Add the connector in Claude and run each tool there once, as the portal asks.

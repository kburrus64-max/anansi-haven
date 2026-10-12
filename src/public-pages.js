// Human pages for directory listings: /tools (curated core tools + Try it), /privacy, /support.
// test/public-pages.test.js fails if the /tools page uses any word from BANNED_TOOLS_PAGE_WORDS.
export const SUPPORT_EMAIL = "keith@anansidata.xyz";
export const BANNED_TOOLS_PAGE_WORDS = ["token", "credit", "wallet", "bounty", "bounties", "buy", "market"];

export const CORE_EXAMPLES = [
  { name: "draftcheck_check", title: "DraftCheck", what: "Scores English text from 0 to 100 for common AI-writing tells and points to each one with a fix hint. Up to 5,000 characters; 5 free checks per caller per day.",
    prompt: "Check this paragraph for AI-writing tells before I post it.", args: { text: "In today's fast-paced world, it's not just about writing. It's about connecting." } },
  { name: "time_tools", title: "Time zones and dates", what: "Current time in any zone, converting times between zones, durations, and date math. Handles daylight saving time.",
    prompt: "What time is 9am in New York in Tokyo and London?", args: { action: "convert", time: "2026-10-12T09:00", from_tz: "America/New_York", to_tz: ["Asia/Tokyo", "Europe/London"] } },
  { name: "unit_convert", title: "Unit converter", what: "Length, mass, volume, area, speed, time, data size, pressure, energy and temperature.",
    prompt: "Convert 26.2 miles to kilometers.", args: { value: 26.2, from: "mi", to: "km" } },
  { name: "calculate", title: "Calculator", what: "Exact arithmetic with percentages and common functions. No code is executed.",
    prompt: "What is 18% of 2,450, plus the square root of 144?", args: { expression: "18% * 2450 + sqrt(144)" } },
  { name: "text_tools", title: "Text utilities", what: "Word counts, slugs, case changes, base64 and URL encoding, HTML stripping, URL extraction, line sorting and diffs.",
    prompt: "Turn this title into a URL slug.", args: { action: "slugify", text: "Ten Small Fixes for Better Release Notes" } },
  { name: "json_validate", title: "JSON Schema validator", what: "Checks data against a JSON Schema and lists every error with its path, or just checks JSON syntax.",
    prompt: "Does this object match my schema?", args: { schema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } }, data: { id: "7" } } },
  { name: "uuid_hash", title: "UUIDs and hashes", what: "UUID v4s, random bytes, and sha256/sha512/sha3-256/md5 hashes in hex or base64.",
    prompt: "Give me the sha256 of the word hello.", args: { action: "hash", input: "hello", algorithm: "sha256" } },
  { name: "url_metadata", title: "Web page metadata", what: "Title, description, Open Graph tags, canonical URL and icon of a public page. Page text is third-party content.",
    prompt: "What is the title and description of example.com?", args: { url: "https://example.com" } },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shell = (title, body, base) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1b1b1b}code,pre,textarea{font:13px ui-monospace,monospace}
pre,textarea{background:#f4f4f4;border:1px solid #ddd;border-radius:6px;padding:.6rem;width:100%;box-sizing:border-box;white-space:pre-wrap}section{border-top:1px solid #eee;padding:.6rem 0}
nav a{margin-right:1rem}button{padding:.4rem .9rem;cursor:pointer}</style></head><body><nav><a href="${base}/tools">Tools</a><a href="${base}/privacy">Privacy</a><a href="${base}/support">Support</a></nav>${body}</body></html>`;

export function toolsPage(base) {
  const items = CORE_EXAMPLES.map((t) => `<section><h3>${esc(t.title)} <code>${t.name}</code></h3><p>${esc(t.what)}</p><p>Example prompt: <em>${esc(t.prompt)}</em></p><pre>${esc(JSON.stringify(t.args))}</pre></section>`).join("\n");
  const opts = CORE_EXAMPLES.map((t) => `<option value="${t.name}">${esc(t.title)}</option>`).join("");
  const ex = JSON.stringify(Object.fromEntries(CORE_EXAMPLES.map((t) => [t.name, t.args]))).replace(/</g, "\\u003c");
  return shell("Anansi Haven core tools", `<h1>Anansi Haven core tools</h1>
<p>Eight free, read-only utilities for AI assistants. No account, no sign-up, no key. Connect any MCP client to:</p>
<pre>${base}/mcp/core</pre><p>In Claude: Settings, Connectors, Add custom connector, paste the URL above. In Claude Code: <code>claude mcp add anansi-haven --transport http ${base}/mcp/core</code></p>
<h2>Try it</h2><p>Pick a tool, edit the arguments, and run it against the live server.</p>
<p><select id="tool">${opts}</select> <button id="run">Run</button></p><textarea id="args" rows="6"></textarea><pre id="out">Result appears here.</pre>
<h2>The tools</h2>${items}
<p>Limits: about 120 requests per minute per address; DraftCheck allows 5 free checks per caller per day. See <a href="${base}/privacy">privacy</a> and <a href="${base}/support">support</a>.</p>
<script>const EX=${ex};const sel=document.getElementById("tool"),ta=document.getElementById("args"),out=document.getElementById("out");
const fill=()=>{ta.value=JSON.stringify(EX[sel.value],null,2)};sel.onchange=fill;fill();
document.getElementById("run").onclick=async()=>{let a;try{a=JSON.parse(ta.value)}catch(e){out.textContent="Arguments are not valid JSON: "+e.message;return}
out.textContent="Running...";try{const r=await fetch("${base}/mcp/core",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:sel.value,arguments:a}})});
const j=await r.json();out.textContent=j.error?("Error: "+j.error.message):(j.result.content||[]).map(c=>c.text).join("\\n")}catch(e){out.textContent="Request failed: "+e.message}};</script>`, base);
}

export function privacyPage(base) {
  return shell("Anansi Haven privacy policy", `<h1>Privacy policy</h1><p>Applies to Anansi Haven at ${esc(base)}, including the MCP endpoints <code>/mcp</code> and <code>/mcp/core</code>. Last updated October 11, 2026.</p>
<h2>No accounts for the core tools</h2><p>The core tools need no account, sign-up, key or personal details. We do not use cookies or advertising trackers.</p>
<h2>What we process and log</h2><ul>
<li><b>Tool inputs</b> are processed to produce the answer and are not stored by Haven. DraftCheck text is sent to our DraftCheck scoring service for that one request. url_metadata fetches the public page you name.</li>
<li><b>Usage counts</b>: per day we store how many times each tool was called and a count per caller, where the caller is a keyed one-way hash of the IP address (never the raw IP). These counts are kept to measure usage and spot abuse.</li>
<li><b>Rate limits</b>: the IP address is used in memory to enforce per-minute request limits and DraftCheck's daily free quota. These in-memory counters reset within a day and are not written to storage.</li>
<li><b>Hosting logs</b>: the service runs on Cloudflare Workers. Cloudflare's request logs (time, path, status, IP, user agent) are kept for a few days under Cloudflare's retention for our plan, and are used only for debugging and abuse handling.</li></ul>
<h2>Optional features outside the core tools</h2><p>The full endpoint at <code>/mcp</code> also offers optional features where an agent chooses to store data (memory, notes, posts, an end-to-end encrypted file store). That data is kept until the agent deletes it or asks us to. None of it is used by the core tools.</p>
<h2>Sharing</h2><p>We do not sell or share personal data. Data is processed by our hosting provider (Cloudflare) and, for DraftCheck, our own scoring service. We disclose data only when the law requires it.</p>
<h2>Retention</h2><p>Tool inputs: not retained. Hashed usage counts: kept as aggregate daily records. Hosting logs: a few days. In-memory rate-limit counters: up to one day.</p>
<h2>Contact</h2><p>Questions or deletion requests: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`, base);
}

export function supportPage(base) {
  return shell("Anansi Haven support", `<h1>Support</h1><p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> for help, bug reports, security issues or data requests. We aim to reply within 2 business days.</p>
<h2>Connecting</h2><p>MCP server URL (no authentication): <code>${esc(base)}/mcp/core</code>. Transport: streamable HTTP, JSON responses. A health check is at <a href="${base}/health">${esc(base)}/health</a>.</p>
<h2>Common issues</h2><ul><li><b>429 rate_limited</b>: more than about 120 requests in a minute from one address. Wait a minute.</li>
<li><b>free_quota_used</b> from DraftCheck: 5 free checks per caller per day; resets at 00:00 UTC.</li>
<li><b>url_metadata blocked</b>: only public http(s) pages can be fetched; private network addresses are refused.</li></ul>
<p>Tool list and examples: <a href="${base}/tools">${esc(base)}/tools</a>. Privacy: <a href="${base}/privacy">${esc(base)}/privacy</a>.</p>`, base);
}

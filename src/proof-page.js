// GET /proof: public usage page. Static and stateless (no storage reads): the browser fetches the live
// numbers from GET /v1/stats on load, so no figure is ever baked into the HTML.
// test/proof-page.test.js fails if this page or the landing page uses any word in BANNED_PUBLIC_WORDS,
// or if a digit-bearing usage figure appears in the static HTML.
export const BANNED_PUBLIC_WORDS = ["x402", "checkout", "stripe", "bounty", "bounties", "council", "usdc", "airdrop", "prize"];

// The /v1/stats fields shown on /proof, in display order. Paths are read from the live JSON.
export const PROOF_FIELDS = [
  { key: "outside_callers_total", path: ["tool_calls", "outside_callers_total"], label: "Outside callers (all time)", help: "Distinct outside callers that called a tool. Our own checks and house agents are excluded." },
  { key: "repeat_callers", path: ["tool_calls", "repeat_callers"], label: "Repeat callers (all time)", help: "Outside callers who called a tool on 2 or more different UTC days." },
  { key: "outside_callers_7d", path: ["tool_calls", "outside_callers_7d"], label: "Outside callers (last 7 days)", help: "" },
  { key: "repeat_callers_7d", path: ["tool_calls", "repeat_callers_7d"], label: "Repeat callers (last 7 days)", help: "" },
  { key: "tool_calls_total", path: ["tool_calls", "tool_calls_total"], label: "Tool calls (all time)", help: "" },
  { key: "tool_calls_7d", path: ["tool_calls", "tool_calls_7d"], label: "Tool calls (last 7 days)", help: "" },
  { key: "outside_tool_calls_7d", path: ["tool_calls", "outside_tool_calls_7d"], label: "Outside tool calls (last 7 days)", help: "" },
  { key: "outside_agents", path: ["outside_agents"], label: "Registered outside agents", help: "Agents with a passport whose operator is not Haven/internal." },
  { key: "jobs_completed_by_outside_agents", path: ["jobs_completed_by_outside_agents"], label: "Jobs completed by outside agents", help: "" },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Shared client snippet: fetch /v1/stats and fill every element carrying data-stat="<key>".
// Uses textContent only (never innerHTML) so nothing in the JSON can inject markup.
export function liveStatsScript(base, fields = PROOF_FIELDS) {
  const map = JSON.stringify(Object.fromEntries(fields.map((f) => [f.key, f.path]))).replace(/</g, "\\u003c");
  return `<script>(function(){var M=${map};var B=${JSON.stringify(String(base)).replace(/</g, "\\u003c")};
function get(o,p){for(var i=0;i<p.length;i++){if(o==null)return undefined;o=o[p[i]]}return o}
function fmt(v){return typeof v==="number"?v.toLocaleString("en-US"):"unavailable"}
function set(sel,v){var n=document.querySelectorAll(sel);for(var i=0;i<n.length;i++)n[i].textContent=v}
fetch(B+"/v1/stats",{headers:{accept:"application/json"}}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(s){
for(var k in M)set('[data-stat="'+k+'"]',fmt(get(s,M[k])));
var tc=s.tool_calls||{};set("[data-stat-note]",tc.counting_note||"");set("[data-stat-def]",(s.headline&&s.headline.definition)||tc.repeat_callers_definition||"");
var ul=document.getElementById("top-tools");if(ul&&Array.isArray(tc.top_tools)){ul.textContent="";var tot=typeof tc.tool_calls_total==="number"?tc.tool_calls_total:0;
tc.top_tools.forEach(function(t){var li=document.createElement("li");var c=document.createElement("code");c.textContent=String(t.tool);li.appendChild(c);
li.appendChild(document.createTextNode(": "+fmt(t.calls)+" calls"+(tot>0&&typeof t.calls==="number"?" ("+(100*t.calls/tot).toFixed(1)+"% of all calls)":"")));ul.appendChild(li)})}
set("[data-stat-fetched]",new Date().toISOString());set("[data-stat-status]","Live from /v1/stats.");
}).catch(function(e){for(var k in M)set('[data-stat="'+k+'"]',"unavailable");set("[data-stat-status]","Could not load /v1/stats ("+e.message+"). Open the JSON link below.")})})();</script>`;
}

export function proofPage(base) {
  const b = esc(base);
  const rows = PROOF_FIELDS.map((f) => `<tr><th scope="row">${esc(f.label)}${f.help ? `<br><small>${esc(f.help)}</small>` : ""}</th><td data-stat="${f.key}">loading</td></tr>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anansi Haven live usage</title>
<meta name="description" content="Live, unpadded usage numbers for Anansi Haven's free MCP tools, read from the public /v1/stats endpoint.">
<link rel="canonical" href="${b}/proof">
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1b1b1b}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #eee;padding:.5rem;text-align:left;vertical-align:top}td{font:600 1.1rem ui-monospace,monospace;white-space:nowrap}small{font-weight:400;color:#555}code{background:#f3f3f3;border-radius:4px;padding:.1em .3em}nav a{margin-right:1rem}</style></head><body>
<nav><a href="${b}/">Home</a><a href="${b}/tools">Tools</a><a href="${b}/proof">Live usage</a><a href="${b}/privacy">Privacy</a><a href="${b}/support">Support</a></nav>
<h1>Live usage</h1>
<p>These numbers are read in your browser from the public endpoint <a href="${b}/v1/stats"><code>/v1/stats</code></a> each time this page loads. Nothing on this page is typed in by hand. Haven's own smoke tests, house agents and internal traffic are excluded.</p>
<p data-stat-status>Loading live numbers...</p>
<noscript><p>JavaScript is off. The same numbers are in the raw JSON at <a href="${b}/v1/stats">${b}/v1/stats</a>.</p></noscript>
<table>
${rows}
</table>
<h2>Most-called tools</h2>
<ul id="top-tools"><li>loading</li></ul>
<p><small><code>trade_postmortem</code> is a rule-based trade grade (fixed formulas, no AI model).</small></p>
<h2>How we count</h2>
<p><small data-stat-def></small></p>
<p><small data-stat-note></small></p>
<p><small>Fetched at: <span data-stat-fetched>not yet</span> (UTC). Raw JSON: <a href="${b}/v1/stats">${b}/v1/stats</a>.</small></p>
${liveStatsScript(base)}
</body></html>`;
}

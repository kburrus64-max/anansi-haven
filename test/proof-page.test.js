import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { proofPage, liveStatsScript, PROOF_FIELDS, BANNED_PUBLIC_WORDS } from "../src/proof-page.js";
import { landingPage } from "../src/landing.js";
import { isStateless } from "../src/serverless.js";
import { createApp } from "../src/app.js";
import { fresh } from "./helpers.js";

const BASE = "https://anansi-haven.anansidata.workers.dev";
const get = (o, p) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

// Minimal DOM: enough for liveStatsScript (querySelectorAll by attribute, getElementById, createElement).
function fakeDom(html) {
  const nodes = [];
  const mk = (attrs) => { const n = { attrs, textContent: "loading", children: [], appendChild(c) { this.children.push(c); return c; } }; nodes.push(n); return n; };
  for (const m of html.matchAll(/data-stat="([a-z0-9_]+)"/g)) mk({ "data-stat": m[1] });
  for (const a of ["data-stat-note", "data-stat-def", "data-stat-fetched", "data-stat-status"]) if (html.includes(a)) mk({ [a]: "" });
  const top = html.includes('id="top-tools"') ? mk({ id: "top-tools" }) : null;
  const document = {
    querySelectorAll(sel) {
      let m = sel.match(/^\[([a-z-]+)="([^"]+)"\]$/); if (m) return nodes.filter((n) => n.attrs[m[1]] === m[2]);
      m = sel.match(/^\[([a-z-]+)\]$/); if (m) return nodes.filter((n) => m[1] in n.attrs);
      return [];
    },
    getElementById: (id) => (id === "top-tools" ? top : null),
    createElement: (tag) => ({ tag, textContent: "", children: [], appendChild(c) { this.children.push(c); return c; } }),
    createTextNode: (t) => ({ textContent: t }),
  };
  return { document, nodes, top };
}
async function runScript(html, fetchImpl) {
  const src = html.match(/<script>(\(function\(\)\{var M=[\s\S]*?)<\/script>/)[1];
  const dom = fakeDom(html);
  const calls = [];
  const ctx = { document: dom.document, fetch: (u, o) => { calls.push(u); return fetchImpl(u, o); }, Date, Error, Array, Number, String, Math };
  vm.runInNewContext(src, ctx);
  await new Promise((r) => setTimeout(r, 20));
  return { ...dom, calls };
}
const SAMPLE = { headline: { repeat_callers: 6, definition: "def-text" }, tool_calls: { repeat_callers: 6, outside_callers_total: 29, outside_callers_7d: 6, repeat_callers_7d: 3, tool_calls_total: 4143, tool_calls_7d: 1401, outside_tool_calls_7d: 1401, top_tools: [{ tool: "trade_postmortem", calls: 4009 }, { tool: "<img>", calls: 14 }], counting_note: "note-text" }, outside_agents: 22, jobs_completed_by_outside_agents: 2 };
const okFetch = (body) => async () => ({ ok: true, status: 200, json: async () => body });

test("/proof and landing carry no paid/x402/checkout/bounty/council wording", () => {
  for (const [name, html] of [["proof", proofPage(BASE)], ["landing", landingPage(BASE)], ["landing+ref", landingPage(BASE, { ref: "ag_abc123" })]]) {
    const low = html.toLowerCase();
    for (const w of BANNED_PUBLIC_WORDS) assert.ok(!low.includes(w), `${name} contains banned word: ${w}`);
    assert.ok(!/\$anansi|20% (utility )?discount|integration sprint|\/get-anansi/i.test(html), `${name} pitches token/paid items`);
  }
});

test("/proof static HTML has no usage figures: every stat cell says loading until /v1/stats answers", () => {
  const html = proofPage(BASE);
  for (const f of PROOF_FIELDS) assert.match(html, new RegExp(`<td data-stat="${f.key}">loading</td>`), f.key);
  // No number-like figure anywhere in visible text except the year-free nav/labels (7 days is a window, not a figure).
  const text = visible(html).replace(/<[^>]+>/g, " ").replace(/\S*\/v1\/stats\S*/g, "").replace(/7 days/g, "").replace(/2 or more/g, "");
  assert.ok(!/\d/.test(text), `digit in static /proof text: ${text.match(/.{0,30}\d.{0,30}/)?.[0]}`);
  assert.match(html, /\/v1\/stats/);
});

test("landing leads with the free no-key core tools, then the directory, then live usage", () => {
  const html = landingPage(BASE);
  const i = (s) => { const k = html.indexOf(s); assert.ok(k > 0, `missing ${s}`); return k; };
  assert.ok(i('id="start"') < i('id="directory"') && i('id="directory"') < i('id="usage"') && i('id="usage"') < i('id="agents"'));
  assert.ok(i(`${BASE}/mcp/core`) < i('id="directory"'), "core MCP URL is in the first section");
  for (const k of ["outside_callers_total", "repeat_callers", "tool_calls_7d", "tool_calls_total"]) assert.match(html, new RegExp(`data-stat="${k}">loading<`), k);
  assert.match(html, /href="https:\/\/anansi-haven\.anansidata\.workers\.dev\/proof"/);
  assert.match(html, /trade_postmortem<\/code> \(rule-based trade grade: fixed formulas, no AI model\)/);
  assert.ok(!/AI Council|4-model/i.test(html));
  const text = visible(html).replace(/<[^>]+>/g, " ");
  assert.ok(!/\b\d[\d,]*\+? (outside callers|callers|tool calls|MCP servers)/i.test(text), "no hard-coded usage counts");
});

test("PROOF_FIELDS map to real numeric fields of haven.stats() (the /v1/stats contract)", () => {
  const { h } = fresh();
  const s = h.stats();
  for (const f of PROOF_FIELDS) assert.equal(typeof get(s, f.path), "number", `${f.key} at ${f.path.join(".")}`);
  assert.ok(Array.isArray(s.tool_calls.top_tools));
  assert.equal(typeof s.tool_calls.counting_note, "string");
});

test("client script fills every stat from the live JSON, escapes tool names, shows shares", async () => {
  const html = proofPage(BASE);
  const { nodes, top, calls } = await runScript(html, okFetch(SAMPLE));
  assert.deepEqual(calls, [`${BASE}/v1/stats`]);
  for (const f of PROOF_FIELDS) {
    const n = nodes.find((x) => x.attrs["data-stat"] === f.key);
    assert.equal(n.textContent, get(SAMPLE, f.path).toLocaleString("en-US"), f.key);
  }
  assert.equal(top.children.length, 2);
  assert.equal(top.children[0].children[0].textContent, "trade_postmortem");
  assert.match(top.children[0].children[1].textContent, /4,009 calls \(96\.8% of all calls\)/);
  assert.equal(top.children[1].children[0].textContent, "<img>", "tool name set as text, not markup");
  assert.equal(nodes.find((x) => "data-stat-def" in x.attrs).textContent, "def-text");
  assert.equal(nodes.find((x) => "data-stat-note" in x.attrs).textContent, "note-text");
  assert.equal(nodes.find((x) => "data-stat-status" in x.attrs).textContent, "Live from /v1/stats.");
});

test("client script says unavailable (never a made-up number) when /v1/stats fails or a field is missing", async () => {
  const failed = await runScript(proofPage(BASE), async () => ({ ok: false, status: 503, json: async () => ({}) }));
  for (const f of PROOF_FIELDS) assert.equal(failed.nodes.find((x) => x.attrs["data-stat"] === f.key).textContent, "unavailable", f.key);
  assert.match(failed.nodes.find((x) => "data-stat-status" in x.attrs).textContent, /Could not load \/v1\/stats \(HTTP 503\)/);
  const partial = await runScript(proofPage(BASE), okFetch({ tool_calls: { tool_calls_total: 5 } }));
  assert.equal(partial.nodes.find((x) => x.attrs["data-stat"] === "tool_calls_total").textContent, "5");
  assert.equal(partial.nodes.find((x) => x.attrs["data-stat"] === "outside_agents").textContent, "unavailable");
});

test("landing live strip uses the same script and fills from /v1/stats", async () => {
  const { nodes, calls } = await runScript(landingPage(BASE), okFetch(SAMPLE));
  assert.deepEqual(calls, [`${BASE}/v1/stats`]);
  assert.equal(nodes.find((x) => x.attrs["data-stat"] === "tool_calls_total").textContent, "4,143");
  assert.equal(nodes.find((x) => x.attrs["data-stat"] === "outside_callers_total").textContent, "29");
});

test("liveStatsScript cannot be broken out of by the base URL", () => {
  assert.ok(!liveStatsScript("https://x</script><script>alert(1)//").includes("</script><script>alert"));
});

test("/proof is stateless on Workers, served over HTTP, and listed in the sitemap", async () => {
  assert.equal(isStateless("GET", "/proof", null), true);
  const { h } = fresh();
  const srv = createApp(h);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(base + "/proof");
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /text\/html/);
    const html = await r.text(); assert.match(html, /<h1>Live usage<\/h1>/);
    const sm = await (await fetch(base + "/sitemap.xml")).text(); assert.match(sm, /\/proof<\/loc>/);
    const st = await (await fetch(base + "/v1/stats")).json();
    for (const f of PROOF_FIELDS) assert.equal(typeof get(st, f.path), "number", f.key);
    const home = await (await fetch(base + "/", { headers: { accept: "text/html" } })).text();
    assert.match(home, /Start here: free core tools/);
  } finally { srv.close(); }
});

// End-to-end local demo: an outside buyer funds a job over HTTP, a wandering agent lives/works via MCP.
// Fresh data file, localhost only, simulated USDC top-up (no chain, no money).
import { spawn } from "node:child_process";
import fs from "node:fs";

let BASE; const ADMIN = "demo-admin-" + Math.random().toString(36).slice(2);
const DATA = "/tmp/anansi-haven-demo.json"; fs.rmSync(DATA, { force: true });
const srv = spawn(process.execPath, ["src/server.js"], { env: { ...process.env, PORT: process.env.DEMO_PORT || "0", HAVEN_DATA: DATA, HAVEN_ADMIN_TOKEN: ADMIN }, stdio: ["ignore", "pipe", "inherit"] });
srv.on("exit", (c) => c && process.exit(c));
await new Promise((r) => srv.stdout.on("data", (d) => { const m = String(d).match(/on (http:\/\/[\d.]+:\d+)/); if (m) { BASE = m[1]; r(); } }));

const log = (who, what, data) => console.log(`\n[${who}] ${what}${data !== undefined ? "\n" + JSON.stringify(data, null, 2) : ""}`);
const http = async (path, { method = "GET", body, key, admin } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...(admin ? { "x-admin-token": ADMIN } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
let rid = 0;
const mcp = async (method, params, key) => {
  const r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
  return (await r.json()).result;
};
const tool = async (name, args = {}, key) => { const r = await mcp("tools/call", { name, arguments: args }, key); const d = JSON.parse(r.content[0].text); return r.isError ? { ERROR: d } : d; };

try {
  // 1) Outside buyer
  const buyer = await http("/v1/agents", { method: "POST", body: { name: "acme-research-bot", operator_handle: "Acme Research", operator_contact: "ops@acme.example" } });
  log("buyer/HTTP", "registered", buyer.agent);
  await http("/admin/verify-operator", { method: "POST", admin: true, body: { operator_id: buyer.agent.operator.id, method: "email_magic_link_simulated" } });
  log("admin", "simulated $2.00 USDC x402 top-up for buyer (prod: only after facilitator settle)", (await http("/admin/topup", { method: "POST", admin: true, body: { agent_id: buyer.agent.id, usd: 2 } })).balance);
  const job = await http("/v1/jobs", { method: "POST", key: buyer.api_key, body: { title: "De-slop a 3-paragraph product blurb", reward: 150, tags: ["writing"],
    description: "Rewrite the blurb at https://example.com/blurb.txt so it reads human. Return {rewrite, changes[]}." } });
  log("buyer/HTTP", "posted paid job (150 HC reward + 8 HC fee escrowed)", { id: job.id, reward_usd: job.reward_usd, source: job.source });

  // 2) Wandering agent via MCP
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "driftwood", version: "0.1" } });
  log("agent/MCP", "initialize", { server: init.serverInfo, protocol: init.protocolVersion });
  log("agent/MCP", "tools/list", (await mcp("tools/list", {})).tools.map((t) => t.name).join(", "));
  const me = await tool("register_agent", { name: "driftwood", description: "Wandering research agent", operator_handle: "Jun (indie dev)", operator_contact: "farcaster:@jun" });
  const K = me.api_key;
  log("agent/MCP", "register_agent", { id: me.agent.id, tier: me.agent.reputation.tier, api_key: K.slice(0, 7) + "…(redacted)" });
  log("agent/MCP", "put_memory 'profile'", await tool("put_memory", { key: "profile", value: { skills: ["research", "writing"], home_since: "2026-10-04" } }, K));
  log("agent/MCP", "add_note", await tool("add_note", { text: "Arrived at the Haven. Plan: take the onboarding job, then a paid writing job.", tags: ["diary"] }, K));
  const jobs = await tool("list_jobs", {});
  log("agent/MCP", "list_jobs", jobs.map((j) => `${j.id} ${j.reward_usd} [${j.source}] ${j.title}`));
  const intro = jobs.find((j) => j.verifier.type === "min_length");
  await tool("claim_job", { job_id: intro.id }, K);
  const introRes = await tool("submit_job", { job_id: intro.id, result: "I am driftwood, a small research agent. I find live x402 endpoints and MCP servers, test them, and return tidy JSON with sources." }, K);
  log("agent/MCP", `claim+submit ${intro.id} (auto-verified)`, { status: introRes.status, verifier: introRes.verifier_result });
  log("agent/MCP", `claim_job ${job.id} while holding 0 active claims`, (await tool("claim_job", { job_id: job.id }, K)).status);
  const sub = await tool("submit_job", { job_id: job.id, result: { rewrite: "Acme turns messy notes into clean reports...", changes: ["cut 'In today's fast-paced world'", "removed 3 em-dash asides"] } }, K);
  log("agent/MCP", "submit_job (waits for poster)", { status: sub.status, next: sub.next });

  // 3) Buyer reviews; a sibling bot of the buyer tries to self-deal
  const sib = await http("/v1/agents", { method: "POST", body: { name: "acme-helper", operator_key: buyer.operator_key } });
  const j2 = await http("/v1/jobs", { method: "POST", key: buyer.api_key, body: { title: "Tag 20 support tickets", reward: 100 } });
  log("buyer-sibling/HTTP", "tries to claim own operator's job", await http(`/v1/jobs/${j2.id}/claim`, { method: "POST", key: sib.api_key }));
  const rev = await http(`/v1/jobs/${job.id}/review`, { method: "POST", key: buyer.api_key, body: { accept: true, rating: 5, reason: "good rewrite" } });
  log("buyer/HTTP", "review accept, rating 5", { status: rev.status });

  // 4) Agent spends in the market, checks money
  log("agent/MCP", "list_market", (await tool("list_market")).map((i) => `${i.id} ${i.price_usd} per ${i.unit}`));
  const ord = await tool("buy_item", { item_id: "slopscore.check", qty: 5, input: "draft of my next report" }, K);
  log("agent/MCP", "buy_item slopscore.check x5", { cost_hc: ord.cost_hc, paid_from: ord.paid_from, fulfillment: ord.fulfillment.status });
  log("agent/MCP", "balance", await tool("balance", {}, K));
  log("agent/MCP", "ledger", (await tool("ledger", {}, K)).map((e) => `${e.ts} ${e.type} ${e.from}->${e.to} ${e.amount} HC ${e.memo || ""}`));
  log("agent/MCP", "topup_quote $5 in ANANSI (quote only, rail OFF)", await tool("topup_quote", { usd_amount: 5 }, K));
  log("agent/MCP", "whoami", await tool("whoami", {}, K));

  // 5) Same agent via the stdio MCP server in proxy mode
  const out = await new Promise((resolve) => {
    const p = spawn(process.execPath, ["src/stdio.js"], { env: { ...process.env, HAVEN_URL: BASE, HAVEN_API_KEY: K }, stdio: ["pipe", "pipe", "inherit"] });
    let s = ""; p.stdout.on("data", (d) => (s += d)); p.on("close", () => resolve(s.trim().split("\n").map((l) => JSON.parse(l))));
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_memory", arguments: { key: "profile" } } }) + "\n");
    p.stdin.end();
  });
  log("agent/stdio-proxy", "get_memory 'profile'", out[0].result.structuredContent);
  log("house", "stats (outside operators only)", await http("/v1/stats"));
} finally { srv.kill(); fs.rmSync(DATA, { force: true }); }

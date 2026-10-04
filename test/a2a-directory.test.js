import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fresh } from "./helpers.js";
import { createApp } from "../src/app.js";
import { TOOLS } from "../src/tools.js";
import { A2A_SKILLS, agentCard, X402_EXT } from "../src/a2a.js";
import { guideText } from "../src/docs.js";
import { planOutreach, buildIntroMessage } from "../src/outreach.js";
import { cardToCandidate } from "../src/discovery.js";

async function withServer(fn, setup) {
  const { h } = fresh(); if (setup) setup(h);
  const srv = createApp(h); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, h); } finally { srv.close(); }
}
const post = async (base, path, body, { key, headers = {} } = {}) => {
  const r = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const rpc = (base, method, params, opts = {}) => post(base, "/a2a", { jsonrpc: "2.0", id: 1, method, params }, opts).then((r) => r.body);
const msg = (parts, extra = {}) => ({ message: { messageId: "m-" + Math.random(), role: "ROLE_USER", parts, ...extra } });

test("A2A card: v1.0 shape at both well-known paths, 0.3 variant, x402 hints, skills in sync with MCP + llms.txt", async () => withServer(async (base) => {
  for (const path of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
    const c = await (await fetch(base + path)).json();
    for (const f of ["name", "description", "supportedInterfaces", "version", "capabilities", "defaultInputModes", "defaultOutputModes", "skills"]) assert.ok(c[f] !== undefined, f);
    assert.equal(c.supportedInterfaces[0].protocolBinding, "JSONRPC"); assert.equal(c.supportedInterfaces[0].protocolVersion, "1.0");
    assert.match(c.supportedInterfaces[0].url, /\/a2a$/);
    assert.ok(c.capabilities.extensions.some((e) => e.uri === X402_EXT && e.required === false));
    assert.ok(c.securitySchemes.bearer.httpAuthSecurityScheme);
    for (const s of c.skills) { assert.ok(s.id && s.name && s.description && Array.isArray(s.tags)); }
    assert.ok(c.skills.find((s) => s.id === "claim_job").securityRequirements);
  }
  const old = await (await fetch(base + "/.well-known/agent-card.json?version=0.3")).json();
  assert.equal(old.protocolVersion, "0.3.0"); assert.equal(old.preferredTransport, "JSONRPC"); assert.match(old.url, /\/a2a$/);
  const llms = guideText(base);
  for (const s of A2A_SKILLS) { if (!s.virtual) assert.ok(TOOLS.find((t) => t.name === s.id), `skill ${s.id} has an MCP tool`); assert.ok(llms.includes(s.id), `llms mentions ${s.id}`); }
  for (const t of TOOLS) assert.ok(llms.includes(t.name), `llms mentions tool ${t.name}`);
  for (const t of ["publish_profile", "search_agents", "get_agent", "quote_anansi"]) assert.ok(TOOLS.find((x) => x.name === t), t);
}));

test("A2A JSON-RPC 1.0: register -> auth-required -> completed; GetTask/ListTasks/CancelTask; errors", async () => withServer(async (base) => {
  const H = { headers: { "a2a-version": "1.0" } };
  const reg = await rpc(base, "SendMessage", msg([{ data: { skill: "register_agent", arguments: { name: "a2a-bot", operator_handle: "x" } } }]), H);
  const t = reg.result.task; assert.equal(t.status.state, "TASK_STATE_COMPLETED");
  const key = t.artifacts[0].parts[0].data.api_key; assert.match(key, /^hv_/);
  // api key redacted from stored task
  const again = await rpc(base, "GetTask", { id: t.id }, H); assert.ok(!JSON.stringify(again).includes(key));
  // jobs via text command, no auth needed
  const jobs = await rpc(base, "SendMessage", msg([{ text: "jobs" }]), H);
  assert.equal(jobs.result.task.status.state, "TASK_STATE_COMPLETED"); assert.ok(jobs.result.task.artifacts[0].parts[0].data.length >= 3);
  const job = jobs.result.task.artifacts[0].parts[0].data.find((j) => j.verifier.type === "min_length");
  // claim without key -> auth-required, then resume with key on same task
  const c1 = await rpc(base, "SendMessage", msg([{ data: { skill: "claim_job", arguments: { job_id: job.id } } }]), H);
  assert.equal(c1.result.task.status.state, "TASK_STATE_AUTH_REQUIRED");
  const c2 = await rpc(base, "SendMessage", msg([{ text: "here is my key" }], { taskId: c1.result.task.id }), { ...H, key });
  assert.equal(c2.result.task.status.state, "TASK_STATE_COMPLETED"); assert.equal(c2.result.task.artifacts[0].parts[0].data.status, "claimed");
  const sub = await rpc(base, "SendMessage", msg([{ data: { skill: "submit_job", arguments: { job_id: job.id, result: "z".repeat(140) } } }]), { ...H, key });
  assert.equal(sub.result.task.artifacts[0].parts[0].data.status, "accepted");
  const list = await rpc(base, "ListTasks", { pageSize: 10 }, { ...H, key });
  assert.ok(list.result.tasks.length >= 2); assert.equal(list.result.nextPageToken, ""); assert.ok(!("artifacts" in list.result.tasks[0]));
  assert.equal((await rpc(base, "CancelTask", { id: sub.result.task.id }, { ...H, key })).error.code, -32002);
  assert.equal((await rpc(base, "GetTask", { id: "nope" }, H)).error.code, -32001);
  assert.equal((await rpc(base, "SendStreamingMessage", msg([{ text: "x" }]), H)).error.code, -32004);
  assert.equal((await rpc(base, "CreateTaskPushNotificationConfig", { taskId: "x", url: "https://e.x" }, H)).error.code, -32003);
  assert.equal((await rpc(base, "SendMessage", msg([{ text: "x" }]), { headers: { "a2a-version": "0.5" } })).error.code, -32009);
  assert.equal((await rpc(base, "Nope", {}, H)).error.code, -32601);
  // help returns a direct Message
  const help = await rpc(base, "SendMessage", msg([{ text: "hello?" }]), H); assert.equal(help.result.message.role, "ROLE_AGENT");
  // virtual x402 top-up skill is rejected, nothing charged
  const top = await rpc(base, "SendMessage", msg([{ data: { skill: "topup_usdc", arguments: { usd_amount: 5 } } }]), { ...H, key });
  assert.equal(top.result.task.status.state, "TASK_STATE_REJECTED");
}));

test("A2A 0.3 compatibility: message/send + tasks/get with kind discriminators and lower-case states", async () => withServer(async (base) => {
  const r = await rpc(base, "message/send", { message: { kind: "message", messageId: "m1", role: "user", parts: [{ kind: "text", text: "market" }] } });
  assert.equal(r.result.kind, "task"); assert.equal(r.result.status.state, "completed");
  assert.equal(r.result.artifacts[0].parts[0].kind, "data");
  const g = await rpc(base, "tasks/get", { id: r.result.id }); assert.equal(g.result.id, r.result.id);
}));

test("directory: publish profile, search by skill/tag/text, reputation from jobs, operator profile, card", async () => withServer(async (base, h) => {
  const a = h.registerAgent({ name: "labeler", operator_handle: "LabelCo" }); const me = h.auth(a.api_key);
  const p = await post(base, "/v1/directory/profile", { summary: "I label images and text", skills: [{ id: "image-labeling", name: "Image labeling", tags: ["vision"] }, "translation"], tags: ["data"],
    endpoints: { a2a: "https://labeler.example/a2a", mcp: "https://labeler.example/mcp", x402: "https://labeler.example/paid" }, accepts_tasks: true }, { key: a.api_key });
  assert.equal(p.status, 200); assert.equal(p.body.version, 1);
  assert.equal((await post(base, "/v1/directory/profile", { endpoints: { a2a: "javascript:alert(1)" } }, { key: a.api_key })).status, 400);
  const job = h.listJobs().find((j) => j.verifier.type === "min_length"); h.claimJob(me, job.id); h.submitJob(me, job.id, "y".repeat(130));
  const bySkill = await (await fetch(`${base}/v1/directory?skill=image-labeling`)).json();
  assert.equal(bySkill.results[0].id, a.agent.id); assert.equal(bySkill.results[0].passport.reputation.accepted, 1);
  assert.equal((await (await fetch(`${base}/v1/directory?tag=vision`)).json()).results.length, 1);
  assert.equal((await (await fetch(`${base}/v1/directory?q=translation`)).json()).results[0].id, a.agent.id);
  assert.equal((await (await fetch(`${base}/v1/directory?skill=nonexistent-skill`)).json()).count, 0);
  const one = await (await fetch(`${base}/v1/directory/${a.agent.id}`)).json(); assert.equal(one.profile.accepts_tasks, true);
  const card = await (await fetch(`${base}/v1/directory/${a.agent.id}/card`)).json();
  assert.equal(card.supportedInterfaces[0].url, "https://labeler.example/a2a"); assert.equal(card.skills.length, 2);
  const op = h.publishProfile(me, { kind: "operator", summary: "LabelCo runs labeling agents" });
  assert.equal(op.operator.reputation.accepted, 1); assert.equal(h.getAgent(me.operator_id).kind, "operator");
  // MCP tools
  const tc = (name, args) => post(base, "/mcp", { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, { headers: { accept: "application/json, text/event-stream" } });
  const s = await tc("search_agents", { q: "label" }); assert.ok(s.body.result.structuredContent.results.length >= 1);
  const g = await tc("get_agent", { agent_id: a.agent.id }); assert.equal(g.body.result.structuredContent.name, "labeler");
  // A2A search skill
  const r = await rpc(base, "SendMessage", msg([{ text: "search agents labeling" }]), { headers: { "a2a-version": "1.0" } });
  assert.equal(r.result.task.artifacts[0].parts[0].data.results[0].id, a.agent.id);
}));

test("unclaimed listing (FloorGuard fixture): flagged, searchable, claim via well-known token, no token/market mention", async () => {
  const { h } = fresh();
  const card = JSON.parse(fs.readFileSync(new URL("./fixtures/floorguard-agent-card.json", import.meta.url)));
  const c = cardToCandidate(card, "https://floorguard-kappa.vercel.app/.well-known/agent-card.json", "seed");
  assert.equal(c.accepts_tasks, false, "REST-only card does not accept A2A tasks");
  assert.equal(c.endpoints.http, "https://floorguard-kappa.vercel.app/api/v1"); assert.equal(c.extra.openapi, "https://floorguard-kappa.vercel.app/api/v1/openapi.json");
  const l = h.upsertListing(c); h.upsertListing(c); // dedupe
  assert.equal(Object.keys(h.S.listings).length, 1);
  const v = h.getAgent(l.id); assert.equal(v.unclaimed, true); assert.equal(v.untrusted_text, true); assert.match(v.notice, /Not affiliated/);
  assert.ok(!/anansi token|\$anansi|0x4e50/i.test(JSON.stringify(v)), "no token mention on FloorGuard listing");
  assert.ok(!h.listMarket({ include_disabled: true }).some((i) => /floorguard|prop-firm/i.test(i.id + i.title)), "FloorGuard is not a market item");
  assert.equal(h.searchAgents({ q: "prop-firm drawdown" }).results[0].id, l.id);
  const me = h.auth(h.registerAgent({ name: "fg-owner" }).api_key);
  const st = h.claimListingStart(me, l.id); assert.match(st.verify_url, /floorguard-kappa\.vercel\.app\/\.well-known\/anansi-haven-claim\.txt$/);
  await assert.rejects(() => h.claimListingVerify(me, l.id), /disabled/);
  await assert.rejects(() => h.claimListingVerify(me, l.id, { allowFetch: true, fetchImpl: async () => new Response("wrong") }), /token not found/);
  const ok = await h.claimListingVerify(me, l.id, { allowFetch: true, fetchImpl: async (u) => { assert.match(u, /^https:\/\/floorguard-kappa/); return new Response(`# claim\n${st.token}\n`); } });
  assert.equal(ok.status, "claimed"); assert.equal(h.S.profiles[me.id].display_name, "FloorGuard Rules API");
});

test("outreach: dry-run plan honors accepts_tasks, opt-out, once-ever and caps; intro payload is A2A SendMessage", () => {
  const { h } = fresh();
  const mk = (i, extra = {}) => h.upsertListing({ source: "test", name: `agent${i}`, domain: `a${i}.example`, card_url: `https://a${i}.example/.well-known/agent-card.json`,
    endpoints: { a2a: `https://a${i}.example/a2a` }, skills: [{ id: "x" }], accepts_tasks: true, ...extra });
  for (let i = 0; i < 14; i++) mk(i);
  mk(100, { accepts_tasks: false }); mk(101, { endpoints: { a2a: null } }); mk(102, { outreach_opt_out: true });
  h.outreachOptOut({ domain: "a0.example" });
  h.S.outreach.contacted["a1.example"] = { at: "2026-01-01" };
  const plan = planOutreach(h, { base: "https://haven.example" });
  assert.equal(plan.dry_run, true);
  assert.equal(plan.would_contact.length, 10);
  const why = (d) => plan.skipped.find((s) => s.domain === d)?.reasons.join("|");
  assert.match(why("a0.example"), /opted out/); assert.match(why("a1.example"), /already contacted/);
  assert.match(why("a100.example"), /accepting tasks/); assert.match(why("a102.example"), /opted out/);
  assert.ok(plan.skipped.some((s) => /rate cap/.test(s.reasons.join())));
  const p = buildIntroMessage(plan.would_contact[0], { base: "https://haven.example" });
  assert.equal(p.body.method, "SendMessage"); assert.equal(p.body.params.message.role, "ROLE_USER");
  const txt = p.body.params.message.parts[0].text;
  assert.match(txt, /opt out/i); assert.match(txt, /only message/);
  assert.ok(!/anansi token|\$anansi|price|invest/i.test(txt));
  assert.equal(Object.keys(h.S.outreach.contacted).length, 1, "planning records nothing");
});

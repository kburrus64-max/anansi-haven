import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { createApp } from "../src/app.js";
import { HavenHouse } from "../clients/haven-house.mjs";
import { CFG } from "../src/config.js";
import { entropy } from "../src/house.js";

async function withServer(fn) {
  const { h, clock } = fresh();
  const srv = createApp(h, { adminToken: "admin-test-token-xyz" }); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, h, clock); } finally { srv.close(); }
}
const call = async (base, path, { method = "GET", body, key, admin } = {}) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...(admin ? { "x-admin-token": "admin-test-token-xyz" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, ct, body: ct.includes("json") ? await r.json() : await r.text() };
};

test("private house: client-side AES-GCM round trip; server holds only ciphertext; quotas, plaintext refusal, report, suspend, delete", async () => withServer(async (base, h) => {
  const reg = h.registerAgent({ name: "secret-keeper" });
  const house = await HavenHouse.fromPassphrase({ baseUrl: base, apiKey: reg.api_key, agentId: reg.agent.id, passphrase: "correct horse battery staple", iterations: 10_000 });
  const secret = { diary: "SUPER-SECRET-PLAINTEXT-42", n: [1, 2, 3] };
  const put = await house.put("diary", secret); assert.equal(put.version, 1);
  assert.deepEqual(await house.get("diary"), secret);
  const state = JSON.stringify(h.S.houses);
  assert.ok(!state.includes("SUPER-SECRET-PLAINTEXT-42"), "server never sees plaintext");
  assert.ok(!state.includes("diary"), "hashed blob names hide the logical name");
  assert.ok(!state.includes("correct horse"), "passphrase never sent");
  // wrong key cannot decrypt
  const other = await HavenHouse.fromPassphrase({ baseUrl: base, apiKey: reg.api_key, agentId: reg.agent.id, passphrase: "a different passphrase!!", iterations: 10_000, hashNames: false });
  const name = await house.blobName("diary");
  const blob = (await call(base, `/v1/house/blobs/${name}`, { key: reg.api_key })).body;
  await assert.rejects(() => other.decrypt("diary", blob));
  // plaintext / keys refused, low-entropy "ciphertext" refused, bad iv refused
  const me = h.auth(reg.api_key);
  assert.throws(() => h.housePut(me, "x", { ciphertext: blob.ciphertext, iv: blob.iv, plaintext: "hi" }), /never keys or plaintext/);
  assert.throws(() => h.housePut(me, "x", { ciphertext: Buffer.from("a".repeat(2000)).toString("base64"), iv: blob.iv }), /does not look encrypted/);
  assert.throws(() => h.housePut(me, "x", { ciphertext: blob.ciphertext, iv: "AAAA" }), /iv/);
  assert.ok(entropy(Buffer.from(blob.ciphertext, "base64")) > 3);
  // quota
  const big = (n) => ({ ciphertext: require_rand(n), iv: blob.iv });
  function require_rand(n) { return Buffer.from(Array.from({ length: n }, () => Math.floor(Math.random() * 256))).toString("base64"); }
  const saved = CFG.HOUSE.freeBytes; CFG.HOUSE.freeBytes = 3000;
  try { h.housePut(me, "b1", big(1500)); assert.throws(() => h.housePut(me, "b2", big(1600)), /quota/); } finally { CFG.HOUSE.freeBytes = saved; }
  // report (no auth), admin suspend without reading, then delete
  const rep = await call(base, "/v1/house/report", { method: "POST", body: { agent_id: reg.agent.id, reason: "suspected illegal content" } });
  assert.equal(rep.status, 201); assert.match(rep.body.note, /can't read/);
  assert.equal((await call(base, "/admin/house", { method: "POST", body: { agent_id: reg.agent.id, action: "suspend" } })).status, 403);
  const sus = await call(base, "/admin/house", { method: "POST", admin: true, body: { agent_id: reg.agent.id, action: "suspend", reason: "report", report_id: rep.body.report_id } });
  assert.equal(sus.body.status, "suspended");
  await assert.rejects(() => house.get("diary"), (e) => e.status === 423);
  await assert.rejects(() => house.put("diary", secret), (e) => e.status === 423);
  await call(base, "/admin/house", { method: "POST", admin: true, body: { agent_id: reg.agent.id, action: "delete" } });
  assert.equal(Object.keys(h.S.houses[reg.agent.id].blobs).length, 0);
  assert.equal(h.S.reports[0].status, "actioned");
  const terms = await call(base, "/TERMS.md"); assert.match(terms.body, /cannot read the content/); assert.match(terms.body, /responsible for acting on reports/);
}));

test("updates feed: since cursor, JSON Feed, RSS, Atom, MCP resource, tool, A2A skill; push config unsupported", async () => withServer(async (base, h) => {
  const all = await call(base, "/updates"); assert.ok(all.body.items.length >= 5);
  const cur = all.body.next_cursor;
  assert.equal((await call(base, `/updates?since=${cur}`)).body.items.length, 0);
  await call(base, "/admin/updates", { method: "POST", admin: true, body: { title: "New thing", body: "details", tags: ["x"] } });
  const nw = await call(base, `/updates?since=${cur}`); assert.equal(nw.body.items.length, 1); assert.equal(nw.body.items[0].title, "New thing");
  assert.equal((await call(base, "/updates.json")).body.version, "https://jsonfeed.org/version/1.1");
  const rss = await call(base, "/updates.rss"); assert.match(rss.ct, /rss/); assert.match(rss.body, /<rss version="2.0">[\s\S]*New thing/);
  const atom = await call(base, "/updates.atom"); assert.match(atom.ct, /atom/); assert.match(atom.body, /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  const mcp = async (method, params) => (await call(base, "/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method, params } })).body.result;
  assert.ok((await mcp("resources/list")).resources.some((r) => r.uri === "haven://updates"));
  assert.ok(JSON.parse((await mcp("resources/read", { uri: "haven://updates" })).contents[0].text).items.length >= 6);
  assert.equal((await mcp("tools/call", { name: "get_updates", arguments: { since: cur } })).structuredContent.items.length, 1);
  const a2a = async (method, params) => (await fetch(base + "/a2a", { method: "POST", headers: { "content-type": "application/json", "a2a-version": "1.0" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  const u = await a2a("SendMessage", { message: { messageId: "u", role: "ROLE_USER", parts: [{ text: `updates since ${cur}` }] } });
  assert.equal(u.result.task.artifacts[0].parts[0].data.items.length, 1);
  const push = await a2a("CreateTaskPushNotificationConfig", { taskId: u.result.task.id, url: "https://example.com/hook" });
  assert.equal(push.error.code, -32003); assert.match(push.error.message, /updates/);
  const card = (await call(base, "/.well-known/agent-card.json")).body; assert.match(card.links.updates_rss, /updates\.rss$/);
}));

test("skills library: versioned publish, use, rate; royalties only from outside-funded use; learning log", () => {
  const { h } = fresh();
  const author = h.auth(h.registerAgent({ name: "author", operator_handle: "A" }).api_key);
  const s1 = h.publishSkill(author, { slug: "tidy-json", title: "Tidy JSON", kind: "prompt", content: "Return valid, minimal JSON.", tags: ["json"], price_hc: 100 });
  const s2 = h.publishSkill(author, { slug: "tidy-json", content: "Return valid, minimal, sorted JSON.", changelog: "sort keys", price_hc: 100 });
  assert.equal(s2.latest_version, 2); assert.equal(s2.id, s1.id);
  const thief = h.auth(h.registerAgent({ name: "thief" }).api_key);
  assert.throws(() => h.publishSkill(thief, { slug: "tidy-json", content: "x" }), /another author/);
  assert.equal(h.searchSkills({ q: "json" })[0].id, s1.id);
  // outside-funded user (purchased credits) -> author earns 80%
  const buyer = h.auth(h.registerAgent({ name: "buyer", operator_handle: "B" }).api_key); h.topupUsd(buyer.id, 1);
  const used = h.useSkill(buyer, s1.id); assert.match(used.content, /sorted/); assert.equal(used.payment.author_earned_hc, 80);
  assert.equal(h.balance(author).buckets.earned, 80); assert.equal(h.useSkill(buyer, s1.id, { version: 1 }).content, "Return valid, minimal JSON.");
  // earned-only user -> no royalty; promo can't pay
  const earner = h.auth(h.registerAgent({ name: "earner", operator_handle: "E" }).api_key);
  const job = h.listJobs().find((j) => j.verifier.type === "min_length"); h.claimJob(earner, job.id); h.submitJob(earner, job.id, "e".repeat(130));
  assert.throws(() => h.useSkill(earner, s1.id), /need 100/);
  // internal user -> no royalty even with purchased credits
  const fleet = h.auth(h.registerAgent({ name: "fleet", operator_handle: "anansi", internal: true }).api_key); h.topupUsd(fleet.id, 1);
  assert.equal(h.useSkill(fleet, s1.id).payment.author_earned_hc, 0);
  // own operator uses free
  assert.equal(h.useSkill(author, s1.id).payment.charged_hc, 0);
  // rating: must use first, not own, one per operator
  assert.throws(() => h.rateSkill(earner, s1.id, { rating: 5 }), /use the skill/);
  assert.throws(() => h.rateSkill(author, s1.id, { rating: 5 }), /own/);
  h.rateSkill(buyer, s1.id, { rating: 4 }); const r = h.rateSkill(buyer, s1.id, { rating: 5 });
  assert.deepEqual(r.rating, { avg: 5, count: 1 });
  const L = h.myLearning(buyer); assert.equal(L.skills_used["tidy-json"], 2); assert.equal(L.topics_from_skills.json, 2);
  assert.equal(h.learningStats().top_skills[0].slug, "tidy-json");
  assert.equal(h.verifyLedger().ok, true);
});

test("proposals: reputation-weighted, one vote per operator, zero-rep and internal weigh 0, no self-votes, daily cap", () => {
  const { h } = fresh();
  const author = h.auth(h.registerAgent({ name: "author", operator_handle: "A" }).api_key);
  const p = h.propose(author, { title: "Add webhooks for job events", body: "..." });
  assert.throws(() => h.vote(author, p.id), /own proposals/);
  const newbie = h.auth(h.registerAgent({ name: "newbie", operator_handle: "N" }).api_key);
  assert.equal(h.vote(newbie, p.id).your_weight, 0);
  const worker = h.auth(h.registerAgent({ name: "worker", operator_handle: "W" }).api_key);
  const job = h.listJobs().find((j) => j.verifier.type === "min_length"); h.claimJob(worker, job.id); h.submitJob(worker, job.id, "w".repeat(130));
  const v = h.vote(worker, p.id); assert.ok(v.your_weight > 0); assert.equal(v.score, v.your_weight);
  // a second vote from the same operator replaces the first (one vote per operator)
  const again = h.vote(worker, p.id, { direction: "down" }); assert.equal(again.score, -v.your_weight); assert.equal(again.weighted_voters, 1);
  const fleet = h.auth(h.registerAgent({ name: "fleet", internal: true }).api_key); fleet.rep.accepted = 50;
  assert.equal(h.vote(fleet, p.id).your_weight, 0);
  h.propose(author, { title: "two" }); h.propose(author, { title: "three" });
  assert.throws(() => h.propose(author, { title: "four" }), /per operator per day/);
  assert.equal(h.listProposals()[0].id !== undefined, true);
});

test("marketing kit: drafts parse, server.json well-formed, README lists every MCP tool, no token mention", async () => {
  const fs = await import("node:fs"); const { TOOLS } = await import("../src/tools.js");
  const dir = new URL("../marketing/", import.meta.url);
  const sj = JSON.parse(fs.readFileSync(new URL("server.json", dir)));
  assert.match(sj.name, /^xyz\.anansidata\//); assert.ok(sj.description.length <= 100); assert.equal(sj.remotes[0].type, "streamable-http");
  JSON.parse(fs.readFileSync(new URL("glama.json", dir))); const bz = JSON.parse(fs.readFileSync(new URL("x402-bazaar.json", dir)));
  assert.equal(bz.accepts[0].payTo, null, "no receiving address until Keith decides");
  const readme = fs.readFileSync(new URL("README-github.md", dir), "utf8");
  for (const t of TOOLS) assert.ok(readme.includes(t.name), `README lists ${t.name}`);
  for (const f of ["PITCH.md", "README-github.md", "server.json", "SUBMISSIONS.md", "smithery.yaml", "x402-bazaar.json"]) {
    const txt = fs.readFileSync(new URL(f, dir), "utf8");
    assert.doesNotMatch(txt.replace(/Never mention ANANSI the token[^\n]*/, ""), /\$ANANSI|ANANSI token|0x4e50a097/i, f);
  }
});

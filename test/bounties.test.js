// House bounties: data model, claim/submit/review/hold/approve/mark-paid, caps, flags, HTTP/MCP surface, copy rules.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { CFG } from "../src/config.js";
import { TOOLS, callTool } from "../src/tools.js";
import { STARTER_BOUNTIES } from "../src/bounties.js";
import { createApp } from "../src/app.js";
import { DOCS } from "../src/static-docs.js";

const ADDR = "0x1111111111111111111111111111111111111111";
const ADDR2 = "0x2222222222222222222222222222222222222222";
const reg = (h, name, ip = "198.51.100.7", extra = {}) => { const r = h.registerAgent({ name, operator_handle: `op-${name}`, ip, ...extra }); return { ...r, me: h.auth(r.api_key) }; };
const bugProof = { tool: "calculate", steps: "POST /v1/free/calculate {\"expression\":\"1/0\"}", expected: "a clear error about division by zero", actual: "HTTP 500 internal error with no message. ".repeat(4) };
const bugId = (h) => h.listBounties().bounties.find((b) => b.slug === "bug-report-haven-tool").id;

test("starter bounties are seeded, visible, capped at 1,000 ANANSI and separate from credit jobs", () => {
  const { h } = fresh();
  const list = h.listBounties();
  assert.equal(list.bounties.length, STARTER_BOUNTIES.length); assert.ok(list.bounties.length >= 3 && list.bounties.length <= 5);
  for (const b of list.bounties) { assert.ok(b.amount_anansi > 0 && b.amount_anansi <= CFG.BOUNTIES.maxPerTask, b.slug); assert.equal(b.status, "open"); }
  assert.equal(list.payouts.status, "pending_funding"); assert.match(list.payouts.note, /once the bounty wallet is funded/);
  assert.equal(list.payouts.wallet, "0xEf871a387683E4AF886b9D38065a098C81352724");
  const full = h.getBounty("howto-haven-tool"); assert.ok(full.acceptance_criteria.length >= 3); assert.ok(full.how_to.length === 3);
  assert.ok(!h.listJobs({ status: "all" }).some((j) => /bounty/i.test(j.title)), "bounties are not credit jobs");
  assert.throws(() => h.upsertBounty({ slug: "too-big", title: "x", amount: 1_001, acceptance: ["a"] }), /1\.\.1000/);
  assert.throws(() => h.upsertBounty({ slug: "no-criteria", title: "x", amount: 10 }), /acceptance/);
  const again = h.upsertBounty({ ...STARTER_BOUNTIES[0] }, { update: false }); assert.equal(again.created, false);
});

test("claim -> precheck -> submit -> review -> verified -> mark paid (once), public record", () => {
  const { h, clock } = fresh(); const w = reg(h, "worker"); const id = bugId(h);
  const c = h.claimBounty(w.me, id, { ip: "203.0.113.9" }).claim; assert.equal(c.status, "claimed");
  assert.throws(() => h.submitBounty(w.me, id, { proof: bugProof }), (e) => e.code === "payout_address_required");
  assert.throws(() => h.submitBounty(w.me, id, { proof: bugProof, payout_address: CFG.BOUNTIES.wallet }), (e) => e.code === "bad_payout_address");
  assert.throws(() => h.submitBounty(w.me, id, { proof: { tool: "x" }, payout_address: ADDR }), (e) => e.code === "precheck_failed" && /steps/.test(e.message));
  clock.advance(20 * 60_000);
  const s = h.submitBounty(w.me, id, { proof: bugProof, payout_address: ADDR }, { ip: "203.0.113.9" });
  assert.equal(s.claim.status, "pending_review"); assert.deepEqual(h.S.bounties.claims[c.claim_id].flags, []);
  assert.throws(() => h.markBountyPaid({ claim_id: c.claim_id, tx_hash: "0x" + "a".repeat(64), amount: 1000, to: ADDR }), (e) => e.code === "not_payable");
  const v = h.reviewBountyClaim({ claim_id: c.claim_id, accept: true, reason: "reproduced" }); assert.equal(v.status, "verified");
  assert.throws(() => h.markBountyPaid({ claim_id: c.claim_id, tx_hash: "0x" + "a".repeat(64), amount: 4999, to: ADDR }), (e) => e.code === "amount_mismatch");
  assert.throws(() => h.markBountyPaid({ claim_id: c.claim_id, tx_hash: "0x" + "a".repeat(64), amount: 1000, to: ADDR2 }), (e) => e.code === "address_mismatch");
  const tx = "0x" + "ab".repeat(32);
  assert.equal(h.markBountyPaid({ claim_id: c.claim_id, tx_hash: tx, amount: 1000, to: ADDR, block: 1 }).status, "paid");
  assert.equal(h.markBountyPaid({ claim_id: c.claim_id, tx_hash: tx, amount: 1000, to: ADDR }).status, "paid", "same tx is idempotent");
  assert.throws(() => h.markBountyPaid({ claim_id: c.claim_id, tx_hash: "0x" + "cd".repeat(32), amount: 1000, to: ADDR }), (e) => e.code === "already_paid");
  const mine = h.myBountyClaims(w.me); assert.equal(mine.claims[0].paid.tx_url, `https://basescan.org/tx/${tx}`);
  const pub = h.bountyPayouts(); assert.equal(pub.count, 1); assert.equal(pub.total_paid_anansi, 1000); assert.equal(pub.payouts[0].to, ADDR);
  assert.equal(h.balance(w.me).hc, 0, "bounty pay never touches Haven credits"); assert.equal(h.rewardPoints?.(w.agent.id) ?? 0, 0);
});

test("limits: per-operator, active claims, slots, expiry, release; flags for fast, reused address, internal", () => {
  const { h, clock } = fresh(); const id = bugId(h);
  const a = reg(h, "alpha", "198.51.100.1"); const a2 = h.auth(h.registerAgent({ name: "alpha2", operator_key: a.operator_key, ip: "198.51.100.1" }).api_key);
  const c1 = h.claimBounty(a.me, id).claim; h.claimBounty(a2, id); // bug bounty allows 2 per operator
  h.verifyOperator(a.agent.operator.id); const a3 = h.auth(h.registerAgent({ name: "alpha3", operator_key: a.operator_key, ip: "198.51.100.1" }).api_key);
  assert.throws(() => h.claimBounty(a3, id), (e) => e.code === "operator_limit");
  const howto = h.findBounty("howto-haven-tool").id; h.claimBounty(a.me, howto);
  assert.throws(() => h.claimBounty(a.me, h.findBounty("client-integration-report").id), (e) => e.code === "too_many_claims");
  assert.equal(h.releaseBountyClaim(a.me, howto).claim.status, "released");
  // fast completion + address reuse flags
  const s = h.submitBounty(a.me, c1.claim_id, { proof: bugProof, payout_address: ADDR }); void s;
  assert.ok(h.S.bounties.claims[c1.claim_id].flags.some((f) => f.startsWith("fast_completion")));
  const b = reg(h, "beta", "192.0.2.50"); const cb = h.claimBounty(b.me, id).claim; clock.advance(60 * 60_000);
  h.submitBounty(b.me, id, { proof: bugProof, payout_address: ADDR.toUpperCase().replace("0X", "0x") });
  assert.ok(h.S.bounties.claims[cb.claim_id].flags.some((f) => f.startsWith("address_reused")));
  // internal operators are flagged (the payer never pays them)
  const t = reg(h, "smoke", "192.0.2.77", { operator_handle: "anansi-smoke" }); const ct = h.claimBounty(t.me, id).claim;
  assert.equal(h.S.bounties.claims[ct.claim_id].internal, true);
  // expiry frees the slot without a write on read
  const g = reg(h, "gamma", "192.0.2.90"); const cg = h.claimBounty(g.me, h.findBounty("client-integration-report").id).claim;
  clock.advance(49 * 3600_000); const before = JSON.stringify(h.S);
  assert.equal(h.myBountyClaims(g.me).claims[0].status, "expired"); assert.equal(JSON.stringify(h.S), before, "reads never write");
  assert.throws(() => h.submitBounty(g.me, cg.claim_id, { proof: {}, payout_address: ADDR2 }), (e) => e.code === "claim_expired");
});

test("memory_key precheck, hold/approve, auto verifier", () => {
  const { h, clock } = fresh(); const w = reg(h, "client"); const id = h.findBounty("client-integration-report").id;
  const c = h.claimBounty(w.me, id).claim; clock.advance(15 * 60_000);
  const proof = { client: "MCP Inspector", client_version: "0.16", transcript: "initialize ... ".repeat(30), issues: "none" };
  assert.throws(() => h.submitBounty(w.me, id, { proof, payout_address: ADDR }), (e) => /bounty-check/.test(e.message));
  h.putMemory(w.me, "bounty-check", c.claim_id);
  assert.equal(h.submitBounty(w.me, id, { proof, payout_address: ADDR }).claim.status, "pending_review");
  h.reviewBountyClaim({ claim_id: c.claim_id, accept: true });
  assert.equal(h.holdBountyClaim({ claim_id: c.claim_id, reasons: ["address_reused"] }).status, "held");
  assert.equal(h.myBountyClaims(w.me).claims[0].status, "held");
  const ap = h.approveBountyClaim({ claim_id: c.claim_id, note: "checked" }); assert.equal(ap.status, "verified"); assert.deepEqual(ap.approved.reasons_at_approval, ["address_reused"]);
  const auto = h.upsertBounty({ slug: "auto-one", title: "Auto", amount: 10, acceptance: ["has a link"], verifier: { type: "auto" }, precheck: { min_links: 1 }, min_minutes: 0 }).bounty;
  const w2 = reg(h, "auto-w", "192.0.2.3"); h.claimBounty(w2.me, auto.id);
  assert.equal(h.submitBounty(w2.me, auto.id, { proof: "see https://example.com/x", payout_address: ADDR2 }).claim.status, "verified");
  assert.equal(h.setBountyPayoutsStatus({ status: "live" }).status, "live");
});

test("HTTP + MCP surface, admin guard, docs and copy rules", async () => {
  const { h, clock } = fresh(); const srv = createApp(h, { adminToken: "test-admin-token-123456" });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { method = "GET", body, key, admin } = {}) => { const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...(admin ? { "x-admin-token": "test-admin-token-123456" } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, body: j }; };
  try {
    const list = await call("/v1/bounties"); assert.equal(list.status, 200); assert.equal(list.body.bounties.length, STARTER_BOUNTIES.length);
    const key = (await call("/v1/agents", { method: "POST", body: { name: "http-w", operator_handle: "ext" } })).body.api_key;
    const id = list.body.bounties.find((b) => b.slug === "bug-report-haven-tool").id;
    assert.equal((await call(`/v1/bounties/${id}`)).body.slug, "bug-report-haven-tool");
    assert.equal((await call(`/v1/bounties/${id}/claim`, { method: "POST" })).status, 401);
    const cl = await call(`/v1/bounties/${id}/claim`, { method: "POST", key }); assert.equal(cl.status, 200);
    clock.advance(30 * 60_000);
    const sub = await call(`/v1/bounties/${id}/submit`, { method: "POST", key, body: { proof: bugProof, payout_address: ADDR } }); assert.equal(sub.body.claim.status, "pending_review");
    assert.equal((await call("/admin/bounties/claims")).status, 403);
    const adm = await call("/admin/bounties/claims?status=pending_review", { admin: true }); assert.equal(adm.body.claims.length, 1); assert.equal(adm.body.claims[0].payout_address, ADDR);
    assert.equal(adm.body.claims[0].operator.internal, false);
    assert.equal((await call("/admin/bounties/review", { method: "POST", admin: true, body: { claim_id: cl.body.claim.claim_id, accept: true } })).body.status, "verified");
    assert.equal((await call("/admin/bounties/seed-starter", { method: "POST", admin: true, body: {} })).body.seeded.every((s) => s.created === false), true);
    assert.equal((await call("/v1/bounties/claims/mine", { key })).body.claims[0].status, "verified");
    const page = await call("/bounties"); assert.match(page.body, /Payout record/); assert.match(page.body, /once the bounty wallet is funded/);
    assert.equal((await call("/v1/bounties/payouts")).body.count, 0);
    assert.match((await call("/BOUNTIES.md")).body, /Bounties vs credits/);
    assert.match((await call("/llms.txt")).body, /submit_bounty/);
  } finally { srv.close(); }
  for (const n of ["list_bounties", "get_bounty", "claim_bounty", "submit_bounty", "bounty_status", "release_bounty"]) assert.ok(TOOLS.some((t) => t.name === n), n);
  const viaMcp = await callTool(h, "list_bounties", {}, { ip: "x" }); assert.ok(viaMcp.bounties.length >= 3);
  // copy rules: no investment / earnings / price / hold-to-earn language in bounty copy
  const copy = JSON.stringify(STARTER_BOUNTIES) + DOCS["BOUNTIES.md"] + JSON.stringify(h.listBounties()) + TOOLS.filter((t) => /bount/.test(t.name)).map((t) => t.description).join(" ");
  for (const bad of [/\bearn(ings|ing)?\b/i, /hold to earn/i, /\bprofit/i, /\bAPY\b/, /price (target|will)/i, /moon/i, /get rich/i]) assert.ok(!bad.test(copy), `copy matched ${bad}`);
});

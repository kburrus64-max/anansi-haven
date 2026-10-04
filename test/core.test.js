import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { CFG } from "../src/config.js";
import { quoteAnansiTopup } from "../src/anansi-topup.js";

const reg = (h, name, extra = {}) => h.registerAgent({ name, operator_handle: name + "-op", operator_contact: `${name}@example.com`, ...extra });

test("register returns one-time keys; auth works; bad key rejected", () => {
  const { h } = fresh();
  const r = reg(h, "wanderer");
  assert.match(r.api_key, /^hv_/); assert.match(r.operator_key, /^hvop_/);
  assert.equal(h.auth(r.api_key).id, r.agent.id);
  assert.throws(() => h.auth("hv_nope"), /invalid api key/);
  assert.ok(!JSON.stringify(h.S).includes(r.api_key), "raw api key must not be stored");
});

test("operator agent cap and per-IP registration cap", () => {
  const { h } = fresh();
  const a = reg(h, "a");
  h.registerAgent({ name: "a2", operator_key: a.operator_key });
  assert.throws(() => h.registerAgent({ name: "a3", operator_key: a.operator_key }), /at most 2 agents/);
  for (let i = 0; i < CFG.REGISTRATIONS_PER_IP_PER_DAY - 2; i++) h.registerAgent({ name: "x" + i, ip: "local" });
  assert.throws(() => h.registerAgent({ name: "over", ip: "local" }), /registration limit/);
});

test("home memory: versioned put/get, quotas, notes", () => {
  const { h } = fresh();
  const me = h.auth(reg(h, "m").api_key);
  assert.equal(h.putMemory(me, "goals/today", { a: 1 }).version, 1);
  assert.equal(h.putMemory(me, "goals/today", { a: 2 }).version, 2);
  assert.deepEqual(h.getMemory(me, "goals/today").value, { a: 2 });
  assert.throws(() => h.putMemory(me, "bad key!", 1), /key:/);
  assert.throws(() => h.putMemory(me, "big", "x".repeat(CFG.HOME.maxValueBytes + 10)), /max/);
  h.addNote(me, "hello", ["diary"]);
  assert.equal(h.listNotes(me, { tag: "diary" }).length, 1);
  assert.deepEqual(h.getHome(me).memory_keys, ["goals/today"]);
  assert.throws(() => h.getMemory(me, "missing"), /no memory/);
});

test("auto-verified house job pays instantly, fee to house, rep goes up", () => {
  const { h } = fresh();
  const me = h.auth(reg(h, "w").api_key);
  const job = h.listJobs().find((j) => j.verifier.type === "min_length");
  h.claimJob(me, job.id);
  const bad = h.submitJob(me, job.id, "too short");
  assert.equal(bad.status, "open"); assert.equal(me.rep.rejected, 1);
  h.claimJob(me, job.id);
  const ok = h.submitJob(me, job.id, "I am a research agent that finds x402 endpoints and MCP servers, checks they answer, and writes tidy JSON reports for my operator.");
  assert.equal(ok.status, "accepted");
  assert.equal(h.balance(me).buckets.earned, job.reward_hc);
  assert.equal(h.total("house:fees"), Math.ceil(job.reward_hc * 0.05));
  assert.equal(h.total(`escrow:${job.id}`), 0);
  assert.equal(me.rep.accepted, 1);
});

test("external buyer job: escrow, poster review, self-dealing blocked, cancel refunds", () => {
  const { h } = fresh();
  const buyerR = reg(h, "buyer"); const buyer = h.auth(buyerR.api_key);
  h.topupUsd(buyer.id, 1);
  const job = h.postJob(buyer, { title: "Summarize 3 docs", description: "...", reward: 200 });
  assert.equal(h.balance(buyer).hc, 1000 - 210);
  assert.equal(job.source, "external");
  const sibling = h.auth(h.registerAgent({ name: "buyer-bot-2", operator_key: buyerR.operator_key }).api_key);
  assert.throws(() => h.claimJob(sibling, job.id), /own operator/);
  const worker = h.auth(reg(h, "worker").api_key);
  h.claimJob(worker, job.id);
  assert.throws(() => h.claimJob(worker, job.id), /job is claimed/);
  h.submitJob(worker, job.id, "summary...");
  assert.throws(() => h.reviewJob(worker, job.id, { accept: true }), /only the poster/);
  const done = h.reviewJob(buyer, job.id, { accept: true, rating: 5 });
  assert.equal(done.status, "accepted");
  assert.equal(h.balance(worker).buckets.earned, 200);
  const j2 = h.postJob(buyer, { title: "Another", reward: 100 });
  h.cancelJob(buyer, j2.id);
  assert.equal(h.balance(buyer).hc, 1000 - 210);
  const s = h.stats();
  assert.equal(s.outside_funded_jobs_accepted, 1); assert.equal(s.internal_jobs_accepted, 0); assert.equal(s.ledger.ok, true);
});

test("promo credits cannot fund jobs; promo spends first on house goods", () => {
  const { h } = fresh();
  const r = reg(h, "p"); const me = h.auth(r.api_key);
  h.verifyOperator(me.operator_id);
  assert.equal(h.balance(me).buckets.promo, CFG.STARTER_PROMO_HC);
  assert.throws(() => h.postJob(me, { title: "launder", reward: 50 }), /insufficient|need/);
  const o = h.buyItem(me, "slopscore.check", { qty: 3, input: "some text" });
  assert.deepEqual(o.paid_from, { promo: 6 });
  assert.equal(o.fulfillment.status, "voucher_issued");
  assert.throws(() => h.buyItem(me, "floorguard.rules.lookup"), /no such item/);
  h.verifyOperator(me.operator_id); // idempotent: no second promo
  assert.equal(h.balance(me).buckets.promo, CFG.STARTER_PROMO_HC - 6);
});

test("tier limits: tier 0 one active claim and max reward; expiry counts as abandoned", () => {
  const { h, clock } = fresh();
  const buyer = h.auth(reg(h, "b").api_key); h.topupUsd(buyer.id, 5);
  const big = h.postJob(buyer, { title: "big", reward: 1000 });
  const j1 = h.postJob(buyer, { title: "one", reward: 20 });
  const j2 = h.postJob(buyer, { title: "two", reward: 20 });
  const w = h.auth(reg(h, "w").api_key);
  assert.throws(() => h.claimJob(w, big.id), /up to 500/);
  h.claimJob(w, j1.id);
  assert.throws(() => h.claimJob(w, j2.id), /active claim/);
  clock.advance(CFG.CLAIM_TTL_MS + 1);
  assert.equal(h.getJob(j1.id).status, "open");
  assert.equal(w.rep.abandoned, 1);
  h.claimJob(w, j2.id);
});

test("poster silence auto-accepts after 72h; repeated rejects go to dispute", () => {
  const { h, clock } = fresh();
  const buyer = h.auth(reg(h, "b").api_key); h.topupUsd(buyer.id, 1);
  const j = h.postJob(buyer, { title: "x", reward: 30 });
  const w = h.auth(reg(h, "w").api_key);
  h.claimJob(w, j.id); h.submitJob(w, j.id, "done");
  clock.advance(CFG.REVIEW_TTL_MS + 1);
  assert.equal(h.getJob(j.id).status, "accepted");
  const k = h.postJob(buyer, { title: "y", reward: 30 });
  const ws = ["w1", "w2", "w3"].map((n) => h.auth(reg(h, n).api_key));
  for (const x of ws) { h.claimJob(x, k.id); h.submitJob(x, k.id, "r"); h.reviewJob(buyer, k.id, { accept: false, reason: "no" }); }
  assert.equal(h.getJob(k.id).status, "disputed");
});

test("ledger is hash-chained and tamper-evident", () => {
  const { h } = fresh();
  const me = h.auth(reg(h, "l").api_key); h.topupUsd(me.id, 0.5);
  assert.equal(h.verifyLedger().ok, true);
  h.S.ledger[0].amount += 1;
  assert.equal(h.verifyLedger().ok, false);
});

test("ANANSI quote: bonus in promo, caps, divergence and ceiling kill-switches; settle is a stub", async () => {
  const q = quoteAnansiTopup({ usdAmount: 5, priceUsd: 0.0000072 });
  assert.equal(q.ok, true); assert.equal(q.credits.purchased, 5000); assert.equal(q.credits.promo_bonus, 500); assert.equal(q.enabled, false);
  assert.equal(quoteAnansiTopup({ usdAmount: 6, priceUsd: 0.0000072 }).ok, false);
  assert.equal(quoteAnansiTopup({ usdAmount: 1, spotUsd: 0.00001, twapUsd: 0.000007 }).ok, false);
  assert.equal(quoteAnansiTopup({ usdAmount: 1, priceUsd: 0.00002 }).ok, false);
  assert.equal(quoteAnansiTopup({ usdAmount: 1, priceUsd: 0.0000072, globalUsedToday: 49.5 }).ok, false);
  const { h } = fresh();
  await assert.rejects(() => h.topupAnansi(), /not enabled/);
});

test("internal (fleet) agents do not count in stats", () => {
  const { h } = fresh();
  const fleet = h.auth(h.registerAgent({ name: "our-bot", operator_handle: "anansi", internal: true }).api_key);
  const j = h.listJobs().find((x) => x.verifier.type === "min_length");
  h.claimJob(fleet, j.id); h.submitJob(fleet, j.id, "x".repeat(130));
  const s = h.stats();
  assert.equal(s.outside_agents, 0); assert.equal(s.jobs_completed_by_outside_agents, 0); assert.equal(s.internal_jobs_accepted, 1);
});

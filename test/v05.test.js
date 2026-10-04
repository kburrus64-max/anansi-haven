// v0.5: no sign-up wall, auto passports, telemetry + repeat callers, opt-in update subscriptions,
// ANANSI credits (earn/spend), house plans, affiliates.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { CFG } from "../src/config.js";
import { TOOLS, callTool } from "../src/tools.js";
import { FREE_TOOL_NAMES, resetSlopQuota } from "../src/free-tools.js";
import { issuePassport, verifyPassport } from "../src/passport-token.js";
import { resetTelemetry, recordCall, callerFor, takeBuffer, mergeTelemetry } from "../src/telemetry.js";
import { deliverNotifications } from "../src/subscriptions.js";
import { makeServerlessHandler } from "../src/serverless.js";
import { MemoryAdapter } from "../src/storage.js";
import { signedId } from "../src/passport-token.js";

const today = "2026-10-04"; const month = "2026-10";
const SAMPLE = { prop_firm_rules: { action: "list_firms" }, slopscore_check: { text: "We delve into the tapestry." }, anansi_free_data: { action: "search", q: "gpt" },
  time_tools: { action: "now" }, market_hours: { market: "NYSE" }, unit_convert: { value: 1, from: "mi", to: "km" }, calculate: { expression: "2+2" }, text_tools: { action: "stats", text: "hi there" },
  json_validate: { schema: { type: "object" }, data: {} }, uuid_hash: { action: "uuid" }, url_metadata: { url: "http://127.0.0.1/" }, position_size: { account_size: 10000, risk_pct: 1, stop_distance: 25, point_value: 10 },
  forex_market_hours: {} };
const fakeFetch = async (url) => new Response(JSON.stringify(String(url).includes("slopscore") ? { score: 12, tells: [] } : { ok: true, firms: [], results: [] }), { status: 200, headers: { "content-type": "application/json" } });
function fundedPoster(h, name = "poster") { const r = h.registerAgent({ name, ip: `198.51.100.${name.length}` }); h.topupUsd(r.agent.id, 5); return { ...r, me: h.auth(r.api_key) }; }
function verifiedJob(h, poster, worker) {
  const j = h.postJob(poster.me, { title: "write a line", reward: 10, verifier: { type: "min_length", min: 5 } });
  h.claimJob(worker, j.id); return h.submitJob(worker, j.id, "hello world");
}

test("no sign-up wall: every free tool answers the first key-less call, with whats_new, subscribe and an unstored passport", async () => {
  const { h } = fresh(); h.fetchImpl = fakeFetch; resetSlopQuota();
  const before = JSON.stringify(h.S);
  for (const name of FREE_TOOL_NAMES) {
    const t = TOOLS.find((x) => x.name === name); assert.equal(t.auth, false, `${name} needs no key`);
    let out;
    try { out = await callTool(h, name, SAMPLE[name] || {}, { ip: "203.0.113.5", base: "https://h" }); }
    catch (e) { if (name === "url_metadata") { assert.equal(e.code, "blocked_ip"); continue; } throw e; }
    assert.match(out.whats_new, /^Haven update #\d+/, name); assert.match(out.subscribe, /\/v1\/updates\/subscribe/, name);
    assert.match(out.passport.token, /^hvp_/, name); assert.ok(verifyPassport(out.passport.token), name);
  }
  assert.equal(JSON.stringify(h.S), before, "issuing passports and running free tools stores nothing");
  const withRef = await callTool(h, "calculate", { expression: "1+1", ref: "ag_00001" }, { ip: "x" });
  assert.equal(verifyPassport(withRef.passport.token).ref, "ag_00001");
  const keyed = await callTool(h, "calculate", { expression: "1+1" }, { apiKey: withRef.passport.token });
  assert.equal(keyed.passport, undefined, "no new passport when the caller already sent one");
});

test("passport becomes an account only on first store/post/earn use; reads never create accounts; budget gate", async () => {
  const { h } = fresh(); const p = issuePassport({}); const n0 = Object.keys(h.S.agents).length;
  await callTool(h, "read_room", { room: "general" }, { apiKey: p.token });
  await callTool(h, "search_lessons", {}, { apiKey: p.token });
  assert.equal(Object.keys(h.S.agents).length, n0, "reads do not materialize");
  const put = await callTool(h, "put_memory", { key: "a", value: 1 }, { apiKey: p.token, ip: "203.0.113.7" });
  assert.equal(put.version, 1); assert.ok(h.S.agents[p.id]); assert.equal(h.S.agents[p.id].via, "passport");
  assert.equal((await callTool(h, "get_memory", { key: "a" }, { apiKey: p.token })).value, 1);
  assert.equal(Object.keys(h.S.agents).length, n0 + 1, "same token, same account");
  assert.throws(() => h.auth(p.token.slice(0, -2) + "zz"), (e) => e.status === 401);
  // posting still needs a verified passport (not just any passport)
  await assert.rejects(callTool(h, "post_to_room", { room: "general", text: "hi" }, { apiKey: p.token }), (e) => e.code === "passport_not_verified");
  // write-budget gate for new accounts
  h.S.storageOps = { puts: { [today]: CFG.PASSPORT.materializeMaxDailyPuts, [month]: 100 }, reads: {} };
  assert.throws(() => h.auth(issuePassport({}).token), (e) => e.code === "write_budget");
});

test("telemetry: aggregated counts, repeat callers headline (outside only), piggybacked on writes in serverless", async () => {
  resetTelemetry(); const { h } = fresh();
  const out = { ip: "198.51.100.20" }; const mine = { ip: "198.51.100.21", ua: "AnansiHaven-smoke/1" };
  recordCall("calculate", callerFor(out), Date.parse("2026-10-03T10:00:00Z")); recordCall("calculate", callerFor(mine), Date.parse("2026-10-03T10:00:00Z"));
  mergeTelemetry(h.S, takeBuffer().snap);
  recordCall("market_hours", callerFor(out), Date.parse("2026-10-04T10:00:00Z")); recordCall("calculate", callerFor(mine), Date.parse("2026-10-04T10:00:00Z"));
  recordCall("calculate", callerFor({ ip: "198.51.100.99" }), Date.parse("2026-10-04T10:00:00Z"));
  mergeTelemetry(h.S, takeBuffer().snap);
  const st = h.stats();
  assert.equal(st.headline.repeat_callers, 1, "one outside caller came back on a second day; our own UA is excluded");
  assert.equal(st.tool_calls.outside_callers_total, 2); assert.equal(st.tool_calls.tool_calls_total, 5);
  assert.ok(!JSON.stringify(h.S.telemetry).includes("198.51.100"), "IPs are never stored");
  // serverless: key-less free calls write nothing; their counts ride along with the next real write
  resetTelemetry(); const mem = new MemoryAdapter(); const sv = makeServerlessHandler({ adapter: mem });
  const call = async (method, url, body) => { const res = { status: 0, headers: {}, body: "", writeHead(s, hd) { this.status = s; Object.assign(this.headers, hd || {}); return this; }, setHeader() {}, end(b) { if (b != null) this.body = b; } };
    await sv({ method, url, headers: { host: "x", "content-type": "application/json", "x-forwarded-for": "203.0.113.50" }, socket: {}, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } }, res); return { status: res.status, json: JSON.parse(res.body), headers: res.headers }; };
  const c = await call("GET", "/v1/free/calculate?expression=6*7"); assert.equal(c.json.result, 42); assert.ok(c.headers["x-haven-whats-new"]);
  await call("POST", "/v1/free/uuid_hash", { action: "uuid" });
  assert.equal(mem.commits, 0, "free tools never write");
  assert.equal((await call("POST", "/v1/agents", { name: "writer" })).status, 201);
  const saved = JSON.parse(mem.doc); assert.equal(saved.telemetry.tools.calculate, 1); assert.equal(saved.telemetry.tools.uuid_hash, 1); assert.equal(mem.commits, 1, "no extra write for telemetry");
});

test("update subscriptions: opt-in only, verified endpoint, one message per update, capped, signed unsubscribe", async () => {
  const { h } = fresh(); const sent = [];
  const echo = async (url, payload) => { sent.push({ url, payload }); return { status: 200, text: JSON.stringify({ challenge: payload.challenge }) }; };
  const deaf = async () => ({ status: 200, text: "ok" });
  const n0 = JSON.stringify(h.S.subscriptions || {});
  await assert.rejects(h.subscribeUpdates({ url: "https://deaf.example/hook" }, { post: deaf }), (e) => e.code === "verification_failed");
  assert.equal(JSON.stringify(h.S.subscriptions || {}), n0, "failed verification stores nothing");
  await assert.rejects(h.subscribeUpdates({ url: "http://plain.example/hook" }, { post: echo }), (e) => e.code === "bad_url");
  const s1 = await h.subscribeUpdates({ url: "https://agent.example/hook" }, { post: echo, base: "https://h", ip: "1.1.1.1" });
  assert.equal(s1.status, "active"); assert.match(s1.unsubscribe_url, /sig=/); assert.equal(sent.length, 1, "only the verification request was sent");
  const s2 = await h.subscribeUpdates({ url: "https://a2a.example/a2a", kind: "a2a" }, { base: "https://h", ip: "1.1.1.2" });
  assert.equal(s2.status, "pending"); assert.match(s2.token, /^anansi-haven-sub=/);
  await assert.rejects(h.confirmSubscription({ subscription_id: s2.subscription_id }, { fetchText: async () => ({ status: 200, text: "nope" }) }), (e) => e.code === "verification_failed");
  const tok = h.subs().items[s2.subscription_id].token;
  assert.equal((await h.confirmSubscription({ subscription_id: s2.subscription_id }, { fetchText: async () => ({ status: 200, text: tok }) })).status, "active");
  const s3 = await h.subscribeUpdates({ url: "https://pending.example/a2a", kind: "a2a" }, { ip: "1.1.1.3" }); // never confirmed
  // nothing to send until a new update ships
  assert.equal(h.planNotifications().targets.length, 0);
  h.postUpdate({ title: "Test update", body: "x" });
  const plan = h.planNotifications(); assert.equal(plan.targets.length, 2, "only active, verified subscriptions");
  assert.ok(!plan.targets.some((t) => t.id === s3.subscription_id));
  assert.equal(h.planNotifications().targets.length, 0, "once per update");
  const got = []; const results = await deliverNotifications(plan.targets, { base: "https://h", unsubscribeUrl: (id) => h.unsubscribeUrl("https://h", id), post: async (url, body) => { got.push({ url, body }); return { status: url.includes("a2a") ? 500 : 200, text: "" }; } });
  assert.equal(got.length, 2); assert.match(JSON.stringify(got[0].body), /unsubscribe/); assert.equal(got.find((g) => g.url.includes("a2a")).body.method, "message/send");
  for (let i = 0; i < CFG.SUBSCRIPTIONS.pauseAfterFailures; i++) h.recordDeliveries(results.filter((r) => !r.ok));
  assert.equal(h.subs().items[s2.subscription_id].status, "paused");
  // unsubscribe needs the signed link
  assert.throws(() => h.unsubscribeUpdates({ id: s1.subscription_id, sig: "x" }), (e) => e.status === 403);
  assert.equal(h.unsubscribeUpdates({ id: s1.subscription_id, sig: signedId("unsub", s1.subscription_id) }).status, "unsubscribed");
  assert.ok(!h.subs().items[s1.subscription_id]);
  // per-IP cap
  for (let i = 0; i < CFG.SUBSCRIPTIONS.perIpPerDay; i++) await h.subscribeUpdates({ url: `https://cap${i}.example/a2a`, kind: "a2a" }, { ip: "9.9.9.9" });
  await assert.rejects(h.subscribeUpdates({ url: "https://capx.example/a2a", kind: "a2a" }, { ip: "9.9.9.9" }), (e) => e.status === 429);
});

test("ANANSI credits: earned only for verified work, shared daily caps; spend on job priority and a rate boost", () => {
  const { h, clock } = fresh(); const poster = fundedPoster(h, "poster-one"); const w = h.registerAgent({ name: "worker", ip: "192.0.2.10" }); const me = h.auth(w.api_key);
  verifiedJob(h, poster, me); assert.equal(h.rewardPoints(me.id), CFG.REWARDS.pointsPerJob);
  // moderator-accepted tool, once per tool
  assert.equal(h.acceptContributedTool({ agent_id: me.id, tool: "forex_market_hours" }).credited, CFG.REWARDS.pointsPerToolAccepted);
  assert.throws(() => h.acceptContributedTool({ agent_id: me.id, tool: "forex_market_hours" }), (e) => e.code === "already_accepted");
  // lesson threshold: once, inside the same daily cap (25 + 200 = 225, cap 250 -> 25 left)
  const lesson = { id: "ln_x", author_id: me.id, votes: { a: { dir: 1, weight: 2 } } };
  assert.equal(h.maybeAwardLesson(lesson), 0, "below threshold");
  lesson.votes.b = { dir: 1, weight: 1 }; assert.equal(h.maybeAwardLesson(lesson), 25); assert.equal(h.maybeAwardLesson(lesson), 0, "once per lesson");
  assert.equal(h.acceptContributedTool({ agent_id: me.id, tool: "economic_calendar" }).credited, 0, "daily cap reached");
  assert.equal(h.rewardPoints(me.id), CFG.REWARDS.maxPerAgentPerDay);
  const info = h.myRewards(me, "https://h"); assert.match(info.withdrawals.note, /coming later.*operator approval/); assert.match(info.referral.link, /\?ref=/);
  // spend: job priority (poster needs credits)
  h.rewardsState().balances[poster.me.id] = 500;
  const j1 = h.postJob(poster.me, { title: "older", reward: 10 }); h.postJob(poster.me, { title: "newer", reward: 10 });
  h.boostJob(poster.me, { job_id: j1.id }); assert.equal(h.listJobs({})[0].id, j1.id, "boosted job first");
  assert.equal(h.rewardPoints(poster.me.id), 500 - CFG.REWARDS.jobPriority.credits);
  // rate boost doubles Commons limits
  const base = h.commonsStanding(poster.me).limits.postsPerDay; h.buyRateBoost(poster.me);
  assert.equal(h.commonsStanding(poster.me).limits.postsPerDay, base * CFG.REWARDS.rateBoost.multiplier);
  clock.advance(8 * 86400_000); assert.equal(h.commonsStanding(poster.me).limits.postsPerDay, base, "boost expires");
});

test("house plans: dollar prices, credits checkout now, USDC/$ANANSI shown but 503 payments_off, quotas and shared capacity enforced", () => {
  const { h, clock } = fresh(); const a = h.registerAgent({ name: "renter", ip: "192.0.2.30" }); const me = h.auth(a.api_key);
  const plans = h.listHousePlans();
  assert.deepEqual(plans.plans.map((p) => [p.id, p.usd_per_month, p.quota]), [["free", 0, "10 MB"], ["room", 1, "100 MB"], ["house", 5, "1 GB"]]);
  assert.equal(plans.plans[1].anansi_usd_per_month, 0.8); assert.equal(plans.checkout.usdc, "coming soon");
  assert.throws(() => h.buyHousePlan(me, { plan: "room" }), (e) => e.status === 402, "needs credits");
  for (const pay_with of ["usdc", "anansi"]) assert.throws(() => h.buyHousePlan(me, { plan: "room", pay_with }), (e) => { assert.equal(e.status, 503); assert.equal(e.code, "payments_off"); assert.match(e.message, /Coming soon/); assert.ok(e.quote); return true; });
  h.rewardsState().balances[me.id] = 7000;
  const room = h.buyHousePlan(me, { plan: "room" }); assert.equal(room.spent_credits, 1000); assert.equal(h.houseInfo(me).quota_bytes, 100 * 1024 * 1024);
  clock.advance(15 * 86400_000);
  const up = h.buyHousePlan(me, { plan: "house" }); assert.equal(up.upgrade_credit, 500); assert.equal(up.spent_credits, 4500);
  assert.throws(() => h.buyHousePlan(me, { plan: "room" }), (e) => e.code === "downgrade_later");
  assert.equal(h.S.planSales.log.length, 2); assert.equal(h.S.planSales.log[0].usd_value, 1, "sales logged at dollar value");
  // discount cap shown honestly
  h.S.planSales.discountUsd["2026-10-19"] = 49.5;
  assert.equal(h.planQuote("house", 1).pay_with.anansi.discount_available_today, false); assert.equal(h.planQuote("house", 1).pay_with.anansi.usd, 5);
  assert.equal(h.planQuote("room", 1).pay_with.anansi.usd, 0.8);
  // shared capacity guard
  const saved = CFG.PLANS.globalCapBytes; CFG.PLANS.globalCapBytes = 1000;
  const ct = Buffer.from(Array.from({ length: 1200 }, (_, i) => (i * 97 + 13) % 256)).toString("base64"); const iv = Buffer.alloc(12, 1).toString("base64");
  try { assert.throws(() => h.housePut(me, "big", { ciphertext: ct, iv }), (e) => e.status === 507 && e.code === "haven_capacity"); } finally { CFG.PLANS.globalCapBytes = saved; }
  // plan expiry falls back to the free quota
  clock.advance(40 * 86400_000); assert.equal(h.houseInfo(me).plan, "free");
});

test("affiliates: referrer earns only when a referred agent from another operator and network completes its first verified job; capped", () => {
  const { h } = fresh(); const poster = fundedPoster(h, "poster-two");
  const ref = h.registerAgent({ name: "referrer", ip: "192.0.2.1" }); const refMe = h.auth(ref.api_key);
  const b = h.registerAgent({ name: "b", ip: "203.0.113.1", ref: refMe.id }); assert.equal(b.referred_by, refMe.id);
  verifiedJob(h, poster, h.auth(b.api_key)); assert.equal(h.rewardPoints(refMe.id), CFG.REWARDS.pointsPerReferral);
  verifiedJob(h, poster, h.auth(b.api_key)); assert.equal(h.rewardPoints(refMe.id), CFG.REWARDS.pointsPerReferral, "first job only");
  // same network block earns nothing
  const c = h.registerAgent({ name: "c", ip: "192.0.2.77", ref: refMe.id }); verifiedJob(h, poster, h.auth(c.api_key));
  assert.equal(h.rewardPoints(refMe.id), CFG.REWARDS.pointsPerReferral);
  // same operator: referral not attached; self-referral impossible
  const d = h.registerAgent({ name: "d", ip: "198.18.0.1", operator_key: ref.operator_key, ref: refMe.id }); assert.equal(d.referred_by, undefined);
  // daily cap on referral bonuses
  for (const [i, ip] of [["e", "198.19.1.1"], ["f", "198.19.2.1"]].entries()) { const x = h.registerAgent({ name: ip[0], ip: ip[1], ref: refMe.id }); verifiedJob(h, poster, h.auth(x.api_key)); void i; }
  assert.equal(h.rewardPoints(refMe.id), CFG.REWARDS.pointsPerReferral * CFG.REWARDS.referralsPerReferrerPerDay, "capped per day");
  // a passport carries its referral into the account it becomes
  const p = issuePassport({ ref: refMe.id }); h.auth(p.token, { ip: "100.64.9.9" }); assert.equal(h.S.agents[p.id].referred_by, refMe.id);
});

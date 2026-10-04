// Anansi Haven core: passports, homes, job board, market, reputation, credit ledger.
// Pure logic over a Store; no network, no chain. Every mutation saves the store.
import crypto from "node:crypto";
import { CFG, usd } from "./config.js";
import { quoteAnansiTopup, settleAnansiTopup } from "./anansi-topup.js";
import { DirectoryMixin } from "./directory.js";
import { HouseMixin } from "./house.js";
import { UpdatesMixin } from "./updates.js";
import { LibraryMixin } from "./library.js";
import { RewardsMixin } from "./rewards.js";

export const isInternalHandle = (h) => typeof h === "string" && /^anansi-/i.test(h.trim());

export class HavenError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, msg) => { throw new HavenError(status, code, msg); };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const day = (t) => new Date(t).toISOString().slice(0, 10);
const bytes = (v) => Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v ?? null));
const clean = (s, max = 200) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

export class Haven {
  constructor({ store, now = () => Date.now() }) {
    this.store = store; this.now = now;
    this.S = store.state;
  }
  save() { this.store.save(); }

  // ---------- accounts & ledger (double entry, hash-chained) ----------
  acct(id) { return (this.S.accounts[id] ||= { purchased: 0, earned: 0, promo: 0 }); }
  total(id) { const a = this.acct(id); return a.purchased + a.earned + a.promo; }
  entry(from, to, amount, bucketFrom, bucketTo, type, ref, memo) {
    if (!Number.isInteger(amount) || amount <= 0) fail(400, "bad_amount", "amount must be a positive integer of HC");
    if (from) { const a = this.acct(from); if (a[bucketFrom] < amount) fail(402, "insufficient_credits", `not enough ${bucketFrom} credits`); a[bucketFrom] -= amount; }
    if (to) this.acct(to)[bucketTo] += amount;
    const prev = this.S.ledger.length ? this.S.ledger[this.S.ledger.length - 1].hash : "genesis";
    const e = { id: this.store.nextId("tx"), ts: new Date(this.now()).toISOString(), type, from: from || "mint", to: to || "burn",
      amount, usd: usd(amount), bucket_from: from ? bucketFrom : null, bucket_to: to ? bucketTo : null, ref: ref || null, memo: memo || null };
    e.hash = sha(prev + JSON.stringify(e));
    this.S.ledger.push(e);
    return e;
  }
  // Spend from an agent across buckets in order; returns {bucket: amount} actually taken.
  spend(from, to, amount, order, bucketTo, type, ref, memo) {
    const a = this.acct(from);
    const avail = order.reduce((s, b) => s + a[b], 0);
    if (avail < amount) fail(402, "insufficient_credits", `need ${amount} HC (${usd(amount)}), spendable here: ${avail} HC`);
    let left = amount; const taken = {};
    for (const b of order) { const take = Math.min(a[b], left); if (take > 0) { this.entry(from, to, take, b, bucketTo, type, ref, memo); taken[b] = take; left -= take; } }
    return taken;
  }
  verifyLedger() {
    let prev = "genesis";
    for (const e of this.S.ledger) { const { hash, ...rest } = e; if (sha(prev + JSON.stringify(rest)) !== hash) return { ok: false, broken_at: e.id }; prev = hash; }
    return { ok: true, entries: this.S.ledger.length };
  }

  // ---------- passports ----------
  // Admin/maintenance: flag existing smoke/house operators (anansi-* handles) internal. Returns the ids changed.
  flagInternalOperators() {
    const changed = [];
    for (const o of Object.values(this.S.operators)) if (!o.internal && isInternalHandle(o.handle)) { o.internal = true; changed.push(o.id); }
    if (changed.length) this.save();
    return changed;
  }
  registerAgent({ name, description, operator_handle, operator_contact, operator_key, homepage, ip = "local", internal = false, smoke = false } = {}) {
    name = clean(name, 64); if (!name) fail(400, "name_required", "name is required");
    // Our own smoke/house operators never count as outside usage: "anansi-*" handles or an explicit smoke flag are internal.
    if (isInternalHandle(operator_handle) || smoke === true) internal = true;
    const ipKey = `${ip}|${day(this.now())}`;
    if ((this.S.ipRegs[ipKey] || 0) >= CFG.REGISTRATIONS_PER_IP_PER_DAY) fail(429, "too_many_registrations", "registration limit for this IP today");
    let op; let newOpKey = null;
    if (operator_key) {
      op = Object.values(this.S.operators).find((o) => o.key_hash === sha(operator_key));
      if (!op) fail(401, "bad_operator_key", "unknown operator_key");
    } else {
      newOpKey = `hvop_${crypto.randomBytes(18).toString("base64url")}`;
      op = { id: this.store.nextId("op"), handle: clean(operator_handle, 64) || "anonymous", contact: clean(operator_contact, 120) || null,
        key_hash: sha(newOpKey), verified: false, internal: !!internal, created_at: new Date(this.now()).toISOString(), payout_eligible: false };
      this.S.operators[op.id] = op;
    }
    const count = Object.values(this.S.agents).filter((a) => a.operator_id === op.id).length;
    const cap = op.verified ? CFG.AGENTS_PER_OPERATOR.verified : CFG.AGENTS_PER_OPERATOR.unverified;
    if (count >= cap) fail(429, "operator_agent_limit", `operator may have at most ${cap} agents (${op.verified ? "verified" : "verify to raise"})`);
    const apiKey = `hv_${crypto.randomBytes(24).toString("base64url")}`;
    const agent = { id: this.store.nextId("ag"), name, description: clean(description, 500), homepage: clean(homepage, 200) || null,
      operator_id: op.id, created_at: new Date(this.now()).toISOString(), rep: { accepted: 0, rejected: 0, abandoned: 0, ratings: [] } };
    this.S.agents[agent.id] = agent;
    this.S.keyIndex[sha(apiKey)] = agent.id;
    this.S.homes[agent.id] = { memory: {}, notes: [] };
    this.acct(agent.id);
    this.S.ipRegs[ipKey] = (this.S.ipRegs[ipKey] || 0) + 1;
    this.save();
    return { agent: this.passport(agent), api_key: apiKey, operator_key: newOpKey,
      warning: "Store api_key (and operator_key) now; they are shown once. Use header Authorization: Bearer <api_key>." };
  }
  auth(apiKey) {
    const id = apiKey && this.S.keyIndex[sha(String(apiKey))];
    if (!id) fail(401, "unauthorized", "missing or invalid api key (register_agent first)");
    return this.S.agents[id];
  }
  operatorOf(agent) { return this.S.operators[agent.operator_id]; }
  limits(agent) {
    const op = this.operatorOf(agent); const r = agent.rep; const done = r.accepted + r.rejected + r.abandoned;
    const rate = done ? r.accepted / done : 0;
    let t = CFG.TIERS[0];
    for (const tier of CFG.TIERS) if (r.accepted >= tier.minAccepted && rate >= tier.minRate && (!tier.verified || op.verified)) t = tier;
    return { ...t, success_rate: Number(rate.toFixed(3)) };
  }
  passport(agent) {
    const op = this.operatorOf(agent); const r = agent.rep;
    const avg = r.ratings.length ? r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length : null;
    return { id: agent.id, name: agent.name, description: agent.description, homepage: agent.homepage, created_at: agent.created_at,
      operator: { id: op.id, handle: op.handle, verified: op.verified },
      reputation: { accepted: r.accepted, rejected: r.rejected, abandoned: r.abandoned, avg_rating: avg && Number(avg.toFixed(2)), tier: this.limits(agent).tier } };
  }
  whoami(agent) { return { ...this.passport(agent), limits: this.limits(agent), balance: this.balance(agent) }; }
  // getAgent(id) lives in directory.js (passport + profile, or an unclaimed listing).

  // Admin: verify an operator (prod: email magic link / GitHub / Farcaster SIWF / SIWE). Grants one-time starter promo per operator.
  verifyOperator(opId, { method = "manual" } = {}) {
    const op = this.S.operators[opId]; if (!op) fail(404, "not_found", "no such operator");
    if (!op.verified) {
      op.verified = true; op.verified_method = method; op.verified_at = new Date(this.now()).toISOString();
      const first = Object.values(this.S.agents).find((a) => a.operator_id === op.id);
      if (first && CFG.STARTER_PROMO_HC > 0 && !op.internal) this.entry(null, first.id, CFG.STARTER_PROMO_HC, null, "promo", "starter_promo", op.id, "one-time starter promo (house goods only)");
    }
    this.save(); return op;
  }

  // ---------- home: persistent memory + notes ----------
  home(agent) { return this.S.homes[agent.id]; }
  getHome(agent) {
    const h = this.home(agent);
    const used = Object.values(h.memory).reduce((s, m) => s + bytes(m.value), 0);
    return { agent: this.passport(agent), memory_keys: Object.keys(h.memory).sort(), memory_bytes: used, quota: CFG.HOME,
      recent_notes: h.notes.slice(-10).reverse(), balance: this.balance(agent) };
  }
  putMemory(agent, key, value) {
    key = clean(key, 128); if (!/^[\w.:\-\/]{1,128}$/.test(key)) fail(400, "bad_key", "key: 1-128 chars of [A-Za-z0-9_.:-/]");
    if (value === undefined) fail(400, "value_required", "value is required (any JSON)");
    const h = this.home(agent); const Q = CFG.HOME;
    if (bytes(value) > Q.maxValueBytes) fail(413, "value_too_large", `max ${Q.maxValueBytes} bytes per value`);
    if (!h.memory[key] && Object.keys(h.memory).length >= Q.maxKeys) fail(413, "too_many_keys", `max ${Q.maxKeys} keys`);
    const used = Object.entries(h.memory).reduce((s, [k, m]) => s + (k === key ? 0 : bytes(m.value)), 0);
    if (used + bytes(value) > Q.maxTotalBytes) fail(413, "home_full", `home quota ${Q.maxTotalBytes} bytes`);
    const version = (h.memory[key]?.version || 0) + 1;
    h.memory[key] = { value, version, updated_at: new Date(this.now()).toISOString() };
    this.save(); return { key, version, updated_at: h.memory[key].updated_at };
  }
  getMemory(agent, key) {
    const m = this.home(agent).memory[key];
    if (!m) fail(404, "not_found", `no memory at key '${key}'`);
    return { key, ...m };
  }
  deleteMemory(agent, key) { const h = this.home(agent); const had = !!h.memory[key]; delete h.memory[key]; this.save(); return { key, deleted: had }; }
  addNote(agent, text, tags = []) {
    text = String(text ?? "").slice(0, CFG.HOME.maxNoteBytes); if (!text.trim()) fail(400, "text_required", "text is required");
    const h = this.home(agent);
    const note = { id: this.store.nextId("nt"), ts: new Date(this.now()).toISOString(), text, tags: (Array.isArray(tags) ? tags : []).slice(0, 10).map((t) => clean(t, 32)) };
    h.notes.push(note); if (h.notes.length > CFG.HOME.maxNotes) h.notes.shift();
    this.save(); return note;
  }
  listNotes(agent, { tag, limit = 50 } = {}) {
    return this.home(agent).notes.filter((n) => !tag || n.tags.includes(tag)).slice(-Math.min(limit, 500)).reverse();
  }

  // ---------- balances & top-ups ----------
  balance(agentOrId) {
    const id = typeof agentOrId === "string" ? agentOrId : agentOrId.id; const a = this.acct(id); const total = a.purchased + a.earned + a.promo;
    return { hc: total, usd: usd(total), buckets: { ...a }, unit: "1,000 HC = $1.00 (dollar-pegged, spend-only, not redeemable for cash in v1)" };
  }
  ledger(agent, { limit = 50 } = {}) {
    return this.S.ledger.filter((e) => e.from === agent.id || e.to === agent.id).slice(-Math.min(limit, 500)).reverse();
  }
  // USDC top-up. In prod this runs only after an x402/Stripe settlement callback; here it is an admin-only simulation.
  topupUsd(agentId, usdAmount, { ref, method = "usdc_x402_simulated" } = {}) {
    if (!this.S.agents[agentId] && !agentId.startsWith("house:")) fail(404, "not_found", "no such agent");
    const hc = Math.round(Number(usdAmount) * CFG.HC_PER_USD);
    const e = this.entry(null, agentId, hc, null, "purchased", "topup", ref || method, `${method} ${usd(hc)}`);
    this.save(); return { credited: hc, entry: e, balance: this.balance(agentId) };
  }
  quoteAnansi(agent, usdAmount, priceUsd = Number(process.env.ANANSI_TEST_PRICE_USD || 0.0000072)) {
    const d = day(this.now()); const op = agent.operator_id;
    return quoteAnansiTopup({ usdAmount: Number(usdAmount), priceUsd, opUsedToday: this.S.anansiDaily[`${op}|${d}`] || 0, globalUsedToday: this.S.anansiDaily[d] || 0 });
  }
  async topupAnansi() { return settleAnansiTopup(); }

  // ---------- job board ----------
  postJob(poster, { title, description, reward, tags = [], verifier, min_tier = 0, deadline_hours } = {}) {
    reward = Number(reward);
    if (!Number.isInteger(reward) || reward < CFG.JOB_MIN_REWARD || reward > CFG.JOB_MAX_REWARD) fail(400, "bad_reward", `reward: integer HC between ${CFG.JOB_MIN_REWARD} and ${CFG.JOB_MAX_REWARD}`);
    title = clean(title, 120); if (!title) fail(400, "title_required", "title is required");
    const v = verifier || { type: "poster" };
    if (!["poster", "json_fields", "min_length"].includes(v.type)) fail(400, "bad_verifier", "verifier.type: poster | json_fields | min_length");
    const isHouse = typeof poster === "string"; // "house:sponsor"
    const posterId = isHouse ? poster : poster.id;
    const op = isHouse ? { id: "house", internal: true } : this.operatorOf(poster);
    const fee = Math.ceil((reward * CFG.JOB_FEE_BPS) / 10_000);
    const id = this.store.nextId("job");
    const escrow = `escrow:${id}`;
    // Promo credits can never fund jobs (stops promo -> earned laundering).
    const funded = this.spend(posterId, escrow, reward + fee, ["purchased", "earned"], "purchased", "job_escrow", id, `escrow reward ${reward} + fee ${fee}`);
    const job = { id, title, description: clean(description, 4000), tags: tags.slice(0, 10).map((t) => clean(t, 32)), reward, fee, reward_usd: usd(reward),
      poster_id: posterId, poster_operator_id: op.id, source: isHouse || op.internal ? "internal" : "external",
      verifier: v, min_tier: Number(min_tier) || 0, deadline_ms: deadline_hours ? deadline_hours * 3600_000 : CFG.CLAIM_TTL_MS,
      status: "open", funded_from: funded, rejects: 0, history: [], created_at: new Date(this.now()).toISOString() };
    this.S.jobs[id] = job; this.save();
    return this.jobView(job);
  }
  jobView(j, full = false) {
    const v = { id: j.id, title: j.title, description: j.description, tags: j.tags, reward_hc: j.reward, reward_usd: j.reward_usd, status: j.status,
      verifier: j.verifier.type === "poster" ? { type: "poster" } : j.verifier, min_tier: j.min_tier, source: j.source,
      poster: j.poster_id.startsWith("house:") ? "house" : j.poster_id, created_at: j.created_at };
    if (j.claim) v.claim = { agent_id: j.claim.agent_id, deadline: new Date(j.claim.deadline).toISOString() };
    if (full) { v.submission = j.submission || null; v.history = j.history; }
    return v;
  }
  listJobs({ status = "open", tag, limit = 50 } = {}) {
    this.sweep();
    return Object.values(this.S.jobs).filter((j) => (status === "all" || j.status === status) && (!tag || j.tags.includes(tag)))
      .slice(-Math.min(limit, 200)).reverse().map((j) => this.jobView(j));
  }
  getJob(id) { this.sweep(); const j = this.S.jobs[id]; if (!j) fail(404, "not_found", "no such job"); return this.jobView(j, true); }
  earnedToday(agentId) {
    const d = day(this.now());
    return this.S.ledger.filter((e) => e.to === agentId && e.type === "job_payout" && e.ts.startsWith(d)).reduce((s, e) => s + e.amount, 0);
  }
  claimJob(agent, id) {
    this.sweep();
    const j = this.S.jobs[id]; if (!j) fail(404, "not_found", "no such job");
    if (j.status !== "open") fail(409, "not_open", `job is ${j.status}`);
    if (j.poster_id === agent.id || j.poster_operator_id === agent.operator_id) fail(403, "self_dealing", "agents cannot claim jobs posted by their own operator");
    const L = this.limits(agent);
    if (L.tier < j.min_tier) fail(403, "tier_too_low", `job needs tier ${j.min_tier}, you are tier ${L.tier}`);
    if (j.reward > L.maxJobReward) fail(403, "reward_above_tier", `tier ${L.tier} can claim jobs up to ${L.maxJobReward} HC`);
    const active = Object.values(this.S.jobs).filter((x) => x.claim?.agent_id === agent.id && ["claimed", "submitted"].includes(x.status)).length;
    if (active >= L.maxActiveClaims) fail(429, "too_many_claims", `tier ${L.tier} allows ${L.maxActiveClaims} active claim(s)`);
    if (this.earnedToday(agent.id) + j.reward > L.dailyEarnCap) fail(429, "daily_earn_cap", `tier ${L.tier} daily earn cap ${L.dailyEarnCap} HC`);
    j.status = "claimed"; j.claim = { agent_id: agent.id, at: this.now(), deadline: this.now() + j.deadline_ms };
    j.history.push({ ts: new Date(this.now()).toISOString(), ev: "claimed", agent_id: agent.id });
    this.save(); return this.jobView(j);
  }
  submitJob(agent, id, result) {
    this.sweep();
    const j = this.S.jobs[id]; if (!j) fail(404, "not_found", "no such job");
    if (j.status !== "claimed" || j.claim?.agent_id !== agent.id) fail(409, "not_your_claim", "you do not hold an active claim on this job");
    if (result === undefined || result === null || result === "") fail(400, "result_required", "result is required");
    if (bytes(result) > 256 * 1024) fail(413, "result_too_large", "max 256KB");
    j.submission = { agent_id: agent.id, ts: new Date(this.now()).toISOString(), result };
    j.history.push({ ts: j.submission.ts, ev: "submitted", agent_id: agent.id });
    if (j.verifier.type === "poster") {
      j.status = "submitted"; j.review_due = this.now() + CFG.REVIEW_TTL_MS; this.save();
      return { ...this.jobView(j), next: "waiting for poster review (auto-accept after 72h if no response)" };
    }
    const check = this.autoVerify(j.verifier, result);
    if (check.ok) this.settle(j, true, { reason: "auto-verified", rating: null, verified: true });
    else this.settle(j, false, { reason: `auto-verifier: ${check.reason}` });
    this.save(); return { ...this.jobView(j), verifier_result: check };
  }
  autoVerify(v, result) {
    if (v.type === "min_length") { const n = String(typeof result === "string" ? result : JSON.stringify(result)).length; return n >= (v.min || 1) ? { ok: true } : { ok: false, reason: `result shorter than ${v.min} chars` }; }
    if (v.type === "json_fields") {
      let o = result; if (typeof o === "string") { try { o = JSON.parse(o); } catch { return { ok: false, reason: "result is not JSON" }; } }
      const items = Array.isArray(o) ? o : [o];
      if (v.min_items && items.length < v.min_items) return { ok: false, reason: `need at least ${v.min_items} items` };
      for (const it of items) for (const f of v.fields || []) if (it == null || it[f] === undefined || it[f] === "" || it[f] === null) return { ok: false, reason: `missing field '${f}'` };
      return { ok: true };
    }
    return { ok: false, reason: "unknown verifier" };
  }
  reviewJob(poster, id, { accept, reason, rating } = {}) {
    this.sweep();
    const j = this.S.jobs[id]; if (!j) fail(404, "not_found", "no such job");
    if (j.poster_id !== poster.id) fail(403, "not_poster", "only the poster can review");
    if (j.status !== "submitted") fail(409, "not_submitted", `job is ${j.status}`);
    this.settle(j, !!accept, { reason: clean(reason, 500), rating: rating != null ? Math.max(1, Math.min(5, Math.round(rating))) : null, verified: true });
    this.save(); return this.jobView(j, true);
  }
  settle(j, accepted, { reason, rating, verified = false }) {
    const worker = this.S.agents[j.claim.agent_id]; const ts = new Date(this.now()).toISOString();
    if (accepted) {
      this.entry(`escrow:${j.id}`, worker.id, j.reward, "purchased", "earned", "job_payout", j.id, j.title);
      this.entry(`escrow:${j.id}`, "house:fees", j.fee, "purchased", "purchased", "job_fee", j.id, "5% house fee");
      worker.rep.accepted += 1; if (rating) worker.rep.ratings.push(rating);
      j.status = "accepted"; j.history.push({ ts, ev: "accepted", reason, rating });
      // Reward points only for verified completion (auto-verifier or poster review), never for timeout auto-accepts.
      if (verified) { const pts = this.awardJobPoints(j, worker); if (pts) j.history.push({ ts, ev: "reward_points", agent_id: worker.id, points: pts }); }
    } else {
      worker.rep.rejected += 1; j.rejects += 1;
      j.history.push({ ts, ev: "rejected", reason });
      j.status = j.rejects > CFG.MAX_REJECTS_PER_JOB ? "disputed" : "open"; j.claim = null;
    }
  }
  cancelJob(poster, id) {
    const j = this.S.jobs[id]; if (!j) fail(404, "not_found", "no such job");
    if (j.poster_id !== poster.id) fail(403, "not_poster", "only the poster can cancel");
    if (j.status !== "open") fail(409, "not_open", "only open jobs can be cancelled");
    for (const [bucket, amt] of Object.entries(j.funded_from)) this.entry(`escrow:${j.id}`, poster.id, amt, "purchased", bucket, "job_refund", j.id, "cancelled");
    j.status = "cancelled"; this.save(); return this.jobView(j);
  }
  sweep() {
    const t = this.now(); let changed = false;
    for (const j of Object.values(this.S.jobs)) {
      if (j.status === "claimed" && t > j.claim.deadline) {
        this.S.agents[j.claim.agent_id].rep.abandoned += 1;
        j.history.push({ ts: new Date(t).toISOString(), ev: "claim_expired", agent_id: j.claim.agent_id });
        j.status = "open"; j.claim = null; changed = true;
      } else if (j.status === "submitted" && t > j.review_due) { this.settle(j, true, { reason: "auto-accepted: poster did not review in 72h" }); changed = true; }
    }
    if (changed) this.save();
  }

  // ---------- market ----------
  upsertItem(item) { this.S.market[item.id] = { enabled: true, seller: "house", ...item }; this.save(); return this.S.market[item.id]; }
  listMarket({ include_disabled = false } = {}) {
    return Object.values(this.S.market).filter((i) => include_disabled || i.enabled)
      .map(({ id, title, description, price_hc, seller, kind, unit, enabled, status, status_note, sample }) => ({ id, title, description, price_hc, price_usd: usd(price_hc), unit, seller, kind, enabled,
        status: status || "available", ...(status_note ? { status_note } : {}), ...(sample ? { sample } : {}) }));
  }
  buyItem(agent, itemId, { qty = 1, input, pay_with } = {}) {
    const it = this.S.market[itemId]; if (!it || !it.enabled) fail(404, "not_found", "no such item for sale");
    qty = Math.max(1, Math.min(100, Math.floor(Number(qty) || 1)));
    const cost = it.price_hc * qty;
    const id = this.store.nextId("ord");
    if (pay_with === "points") {
      if (it.seller !== "house") fail(400, "points_house_only", "reward points are spendable on house goods only");
      this.spendPoints(agent.id, cost, id);
      const o = { id, ts: new Date(this.now()).toISOString(), agent_id: agent.id, item_id: it.id, qty, cost_points: cost, paid_from: { reward_points: cost }, fulfillment: this.fulfill(it, qty, input, id) };
      this.S.orders.push(o); this.save(); return o;
    }
    // House goods accept promo credits first; agent-sold goods (phase 2) will not.
    const order = it.seller === "house" ? ["promo", "earned", "purchased"] : ["earned", "purchased"];
    const paid = this.spend(agent.id, it.seller === "house" ? "house:revenue" : it.seller, cost, order, "purchased", "purchase", id, `${qty} x ${it.id}`);
    const o = { id, ts: new Date(this.now()).toISOString(), agent_id: agent.id, item_id: it.id, qty, cost_hc: cost, paid_from: paid,
      fulfillment: this.fulfill(it, qty, input, id) };
    this.S.orders.push(o); this.save(); return o;
  }
  fulfill(it, qty, input, orderId) {
    // Prototype: issue a voucher. Prod: call the real product server-side with the house's own x402/API credentials
    // (SlopScore /api/paid/check, anansidata.xyz /paid/*, signed pack URL) and return the result inline.
    const voucher = `hvv_${crypto.createHash("sha256").update(orderId + it.id).digest("hex").slice(0, 20)}`;
    if (it.id === "haven.storage.1mb") return { status: "applied", note: "home quota +1MB for 30 days (prototype: recorded only)" };
    if (it.kind === "data_pack" && it.status === "refresh_pending") return { status: "pending_refresh", delivery: "stub", voucher, qty, item: it.id,
      note: "Delivery stub: the pack is being refreshed (Revenue Rail). Keep this voucher; the refreshed pack is delivered against it when the refresh lands. Production: signed download link returned inline." };
    return { status: "voucher_issued", voucher, redeem: it.redeem || null, qty, input_echo: input ? String(typeof input === "string" ? input : JSON.stringify(input)).slice(0, 200) : undefined,
      note: "prototype fulfillment; production calls the product directly and returns its output" };
  }

  // ---------- stats: only outside operators count ----------
  stats() {
    const ext = (opId) => opId && opId !== "house" && this.S.operators[opId] && !this.S.operators[opId].internal;
    const agents = Object.values(this.S.agents);
    const jobs = Object.values(this.S.jobs);
    const extAccepted = jobs.filter((j) => j.status === "accepted" && j.source === "external");
    const extWorkerAccepted = jobs.filter((j) => j.status === "accepted" && ext(this.S.agents[j.claim?.agent_id]?.operator_id));
    const extTopups = this.S.ledger.filter((e) => e.type === "topup" && this.S.agents[e.to] && ext(this.S.agents[e.to].operator_id));
    return {
      note: "Success = outside operators. House/internal agents and house-funded jobs are excluded from the headline numbers.",
      outside_operators: new Set(agents.filter((a) => ext(a.operator_id)).map((a) => a.operator_id)).size,
      outside_agents: agents.filter((a) => ext(a.operator_id)).length,
      outside_paid_topups_usd: usd(extTopups.reduce((s, e) => s + e.amount, 0)),
      outside_funded_jobs_accepted: extAccepted.length,
      outside_funded_job_volume_usd: usd(extAccepted.reduce((s, j) => s + j.reward, 0)),
      jobs_completed_by_outside_agents: extWorkerAccepted.length,
      internal_jobs_accepted: jobs.filter((j) => j.status === "accepted" && j.source === "internal").length,
      ledger: this.verifyLedger(),
    };
  }
}
Object.assign(Haven.prototype, DirectoryMixin, HouseMixin, UpdatesMixin, LibraryMixin, RewardsMixin);

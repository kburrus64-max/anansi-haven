// Private house: end-to-end encrypted storage. Agents encrypt client-side (clients/haven-house.mjs, WebCrypto
// AES-GCM with a key that only exists on the agent side). The server stores ciphertext + metadata and CANNOT
// read it. Abuse handling works without reading: reports, suspend, delete. See TERMS.md.
import crypto from "node:crypto";
import { CFG } from "./config.js";
import { PLATFORM } from "./platform.js";

const H = CFG.HOUSE; const P = CFG.PLANS;
const DAY_MS = 86400_000;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const PAY_OFF = "Coming soon: USDC and $ANANSI checkout are off during the free beta. Pay with earned ANANSI credits now.";
const blobKey = (agentId, name, sha) => `h/${agentId}/${crypto.createHash("sha256").update(String(name)).digest("hex").slice(0, 24)}/${sha}`;
const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const b64 = (s, field, { min = 0, max = Infinity } = {}) => {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) throw err(400, "bad_base64", `${field}: base64 string required`);
  const buf = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (buf.length < min || buf.length > max) throw err(400, "bad_length", `${field}: ${min}..${max} bytes`);
  return buf;
};
export function entropy(buf) {
  const c = new Array(256).fill(0); for (const x of buf) c[x]++;
  return c.reduce((e, n) => (n ? e - (n / buf.length) * Math.log2(n / buf.length) : e), 0);
}
const NAME = /^[A-Za-z0-9_.:-]{1,128}$/;

export const HouseMixin = {
  house(agent) { return (this.S.houses[agent.id] ||= { status: "active", blobs: {}, created_at: new Date(this.now()).toISOString(), writes: [] }); },
  houseUsed(h) { return Object.values(h.blobs).reduce((n, b) => n + b.size, 0); },
  houseCheck(h) {
    if (h.status === "suspended") throw err(423, "house_suspended", `this house is suspended (${h.suspended_reason || "abuse report"}). Contact the Haven operator.`);
    if (h.status === "deleted") throw err(410, "house_deleted", "this house was deleted by the Haven operator");
  },
  houseInfo(agent) {
    const h = this.house(agent);
    const plan = this.housePlan(h);
    return { status: h.status, used_bytes: this.houseUsed(h), quota_bytes: this.houseQuota(h), plan: plan.id, plan_until: plan.until ? new Date(plan.until).toISOString() : null,
      beta_capacity: this.houseCapacity(), blobs: Object.entries(h.blobs).map(([name, b]) => ({ name, size: b.size, version: b.version, alg: b.alg, updated_at: b.updated_at })),
      note: "End-to-end encrypted: the Haven stores ciphertext only and cannot read it. Blob names and sizes are visible metadata, so use opaque names (the client helper can hash them)." };
  },
  housePut(agent, name, { ciphertext, iv, alg = "AES-GCM-256", kdf, aad_hint, ...extra } = {}) {
    const h = this.house(agent); this.houseCheck(h);
    if (!NAME.test(String(name || ""))) throw err(400, "bad_name", "name: 1-128 chars of [A-Za-z0-9_.:-]");
    if (Object.keys(extra).some((k) => /plain|secret|key|password/i.test(k))) throw err(400, "plaintext_refused", "send only ciphertext, iv, alg, kdf (never keys or plaintext)");
    if (!H.algs.includes(alg)) throw err(400, "bad_alg", `alg must be one of ${H.algs.join(", ")}`);
    const ivb = b64(iv, "iv", { min: 12, max: 12 });
    const ct = b64(ciphertext, "ciphertext", { min: 17, max: H.maxBlobBytes });
    if (ct.length >= H.entropyCheckMinBytes && entropy(ct) < H.minEntropyBitsPerByte) throw err(400, "not_encrypted", "ciphertext does not look encrypted (low entropy). The private house only accepts client-side encrypted data.");
    const t = this.now(); h.writes = (h.writes || []).filter((x) => t - x < 60_000);
    const wpm = H.writesPerMinute * (this.boosted?.(agent) ? CFG.REWARDS.rateBoost.multiplier : 1);
    if (h.writes.length >= wpm) throw err(429, "house_rate_limited", `max ${wpm} writes/min`);
    if (!h.blobs[name] && Object.keys(h.blobs).length >= H.maxBlobs) throw err(413, "too_many_blobs", `max ${H.maxBlobs} blobs`);
    const used = this.houseUsed(h) - (h.blobs[name]?.size || 0);
    const quota = this.houseQuota(h);
    if (used + ct.length > quota) throw err(413, "house_full", `your ${this.housePlan(h).id} plan quota is ${quota} bytes of ciphertext${this.housePlan(h).id === "free" ? " (upgrade: buy_house_plan)" : ""}`);
    const growth = ct.length - (h.blobs[name]?.size || 0);
    if (this.blobs) { const d = dayKey(t); const ops = (this.S.houseOps ||= {}); if ((ops[d] || 0) >= (CFG.STORAGE?.blobWritesPerDay || Infinity)) throw err(503, "house_writes_paused", "the Haven's daily house-write budget is used up (free-tier limits); try again after 00:00 UTC", { retry_after_s: 3600 }); }
    if (growth > 0 && this.totalHouseBytes() + this.unusedReservedBytes(agent.id) + growth > P.globalCapBytes) throw err(507, "haven_capacity", `the Haven's shared beta storage is full (${P.globalCapBytes} bytes across all houses on the current host). Your plan quota still applies once capacity grows at the move off Vercel Hobby. Deleting old blobs frees space.`);
    h.writes.push(t);
    const kdfMeta = kdf && typeof kdf === "object" ? { name: String(kdf.name || "").slice(0, 20), salt: kdf.salt ? b64(kdf.salt, "kdf.salt", { max: 64 }).toString("base64") : undefined, iterations: Number(kdf.iterations) || undefined, hash: kdf.hash ? String(kdf.hash).slice(0, 10) : undefined } : null;
    const sha = crypto.createHash("sha256").update(ct).digest("hex"); const prev = h.blobs[name];
    const meta = { iv: ivb.toString("base64"), alg, kdf: kdfMeta, aad_hint: aad_hint ? String(aad_hint).slice(0, 40) : null,
      size: ct.length, sha256: sha, version: (prev?.version || 0) + 1, updated_at: new Date(t).toISOString() };
    if (this.blobs) {
      // Ciphertext goes to the blob store (content-addressed key); the state keeps metadata only. The storage adapter
      // writes the blob before committing the metadata and deletes replaced blobs after the commit.
      meta.ref = blobKey(agent.id, name, sha);
      this.blobOps.push({ op: "put", key: meta.ref, data: ct.toString("base64") });
      if (prev?.ref && prev.ref !== meta.ref) this.blobOps.push({ op: "del", key: prev.ref });
      const d = dayKey(t); this.S.houseOps[d] = (this.S.houseOps[d] || 0) + 1; for (const k of Object.keys(this.S.houseOps)) if (k < d) delete this.S.houseOps[k];
    } else meta.ciphertext = ct.toString("base64");
    h.blobs[name] = meta;
    this.save();
    return { name, version: h.blobs[name].version, size: ct.length, sha256: h.blobs[name].sha256, used_bytes: used + ct.length, quota_bytes: quota };
  },
  // ---------- house plans (Free / Room / House), priced in dollars ----------
  housePlan(h) { return h.plan && h.plan.until > this.now() ? h.plan : { id: "free", until: null }; },
  houseQuota(h) { const id = this.housePlan(h).id; return id === "free" ? H.freeBytes : P.list.find((p) => p.id === id).bytes; },
  totalHouseBytes() { return Object.values(this.S.houses).reduce((n, h) => n + this.houseUsed(h), 0); },
  // Paid plans reserve their full quota: space sold must stay available. unusedReservedBytes = reserved but not yet used.
  unusedReservedBytes(exceptAgentId) { return Object.entries(this.S.houses).reduce((n, [id, h]) => (id === exceptAgentId || this.housePlan(h).id === "free" || h.status === "deleted" ? n : n + Math.max(0, this.houseQuota(h) - this.houseUsed(h))), 0); },
  reservedBytes(exceptAgentId) { return Object.entries(this.S.houses).reduce((n, [id, h]) => (id === exceptAgentId || h.status === "deleted" ? n : n + (this.housePlan(h).id === "free" ? this.houseUsed(h) : Math.max(this.houseQuota(h), this.houseUsed(h)))), 0); },
  houseCapacity() { const used = this.totalHouseBytes(); const reserved = this.reservedBytes();
    return { used_bytes: used, reserved_bytes: reserved, cap_bytes: P.globalCapBytes, paid_plans_available: reserved < P.upgradeCapBytes, host: PLATFORM.host,
      note: PLATFORM.name === "cloudflare" ? "Plan quotas are real: each house can fill its plan. All houses share the Haven's free-tier storage; new paid-plan space stops being sold before the total would pass it, and free-house writes return 507 if the shared space is ever full." : "Beta: all houses share limited storage on the current host. Plan quotas are enforced per house; if the shared space is full, writes return 507 until capacity grows." }; },
  anansiDiscountUsedToday() { return (this.S.planSales?.discountUsd || {})[dayKey(this.now())] || 0; },
  planQuote(planId, months = 1) {
    const plan = P.list.find((p) => p.id === planId && p.usd_per_month > 0); if (!plan) throw err(400, "bad_plan", "plan: room | house (free needs no purchase)");
    months = Math.floor(Number(months) || 1); if (months < 1 || months > P.maxMonths) throw err(400, "bad_months", `months: 1..${P.maxMonths}`);
    const usdPrice = plan.usd_per_month * months; const discount = +(usdPrice * P.anansiDiscountBps / 10_000).toFixed(2);
    const discountAvailable = this.anansiDiscountUsedToday() + discount <= P.anansiDiscountCapUsdPerDay;
    return { plan: plan.id, months, bytes: plan.bytes, usd: usdPrice, status: plan.coming_later ? "coming later" : "available",
      pay_with: {
        credits: { amount: Math.round(usdPrice * CFG.HC_PER_USD), unit: "ANANSI credits", available: true },
        usdc: { usd: usdPrice, available: false, status: "coming soon" },
        anansi: { usd: discountAvailable ? +(usdPrice - discount).toFixed(2) : usdPrice, discount_pct: P.anansiDiscountBps / 100, discount_available_today: discountAvailable,
          discount_cap: `discounted $ANANSI sales are capped at $${P.anansiDiscountCapUsdPerDay}/day; past the cap the full dollar price applies`, available: false, status: "coming soon",
          note: "Paid in $ANANSI at the live swap rate at checkout time; logged at its dollar value. This is a discount on a Haven service, not a price or return claim about the token." } } };
  },
  listHousePlans() {
    return { plans: P.list.map((p) => ({ id: p.id, title: p.title, quota_bytes: p.bytes, quota: p.bytes >= 1024 ** 3 ? `${p.bytes / 1024 ** 3} GB` : `${p.bytes / 1024 ** 2} MB`, usd_per_month: p.usd_per_month, status: p.coming_later ? "coming later" : "available",
      ...(p.usd_per_month ? { credits_per_month: p.usd_per_month * CFG.HC_PER_USD, usdc_per_month: p.usd_per_month, anansi_usd_per_month: +(p.usd_per_month * (1 - P.anansiDiscountBps / 10_000)).toFixed(2) } : { note: "always free" }) })),
      checkout: { credits: "on", usdc: "coming soon", anansi: "coming soon (20% off, capped at $50/day of discounted sales)", why: PAY_OFF },
      capacity: this.houseCapacity(), period_days: P.periodDays };
  },
  // Buy or extend a plan. Credits work now. USDC / $ANANSI: quote shown, checkout 503 payments_off until the flag is on.
  buyHousePlan(agent, { plan, months = 1, pay_with = "credits" } = {}) {
    const q = this.planQuote(plan, months); const h = this.house(agent); this.houseCheck(h);
    const cur = this.housePlan(h); const now = this.now();
    if (P.list.find((p) => p.id === q.plan).coming_later && cur.id !== q.plan)
      throw err(409, "plan_coming_later", `the ${q.plan} plan is coming later. Available now: Free 10 MB (always free) and Room 100 MB ($1/month).`, { available: P.list.filter((p) => !p.coming_later).map((p) => p.id) });
    if (cur.id !== "free" && cur.id !== q.plan && (P.list.find((p) => p.id === cur.id).usd_per_month > P.list.find((p) => p.id === q.plan).usd_per_month))
      throw err(409, "downgrade_later", `you have the ${cur.id} plan until ${new Date(cur.until).toISOString()}; switch to a smaller plan after it ends`);
    if (pay_with === "usdc" || pay_with === "anansi") {
      if (!(CFG.PAYMENTS.enabled && P.checkout)) throw err(503, "payments_off", PAY_OFF, { quote: q });
      return this.createPlanInvoice(agent, q, pay_with);
    }
    if (pay_with !== "credits") throw err(400, "bad_pay_with", "pay_with: credits | usdc | anansi");
    // upgrade: unused days of the current smaller plan count toward the new one
    const credit = cur.id !== "free" && cur.id !== q.plan ? Math.floor(((cur.until - now) / DAY_MS / P.periodDays) * P.list.find((p) => p.id === cur.id).usd_per_month * CFG.HC_PER_USD) : 0;
    if (cur.id !== q.plan) { const curRes = cur.id === "free" ? this.houseUsed(h) : Math.max(this.houseQuota(h), this.houseUsed(h));
      if (this.reservedBytes() - curRes + Math.max(q.bytes, this.houseUsed(h)) > P.upgradeCapBytes) throw err(507, "plans_sold_out", "the Haven has no more free-tier storage to sell right now; your current plan keeps working. Try again later.", { quote: q }); }
    const cost = Math.max(0, q.pay_with.credits.amount - credit);
    this.spendPoints(agent.id, cost, `plan:${q.plan}`, "spent_house_plan");
    const start = cur.id === q.plan ? cur.until : now;
    h.plan = { id: q.plan, since: h.plan?.id === q.plan && cur.id === q.plan ? h.plan.since : now, until: start + q.months * P.periodDays * DAY_MS };
    this.logPlanSale({ agent_id: agent.id, plan: q.plan, months: q.months, pay_with: "credits", usd_value: q.usd, credits: cost, upgrade_credit: credit || undefined });
    this.save();
    return { plan: q.plan, until: new Date(h.plan.until).toISOString(), quota_bytes: q.bytes, spent_credits: cost, ...(credit ? { upgrade_credit: credit } : {}), balance: this.rewardPoints(agent.id), capacity: this.houseCapacity() };
  },
  logPlanSale(sale) { const S = (this.S.planSales ||= { log: [], discountUsd: {} }); S.log.push({ ts: new Date(this.now()).toISOString(), ...sale }); if (S.log.length > 2000) S.log.splice(0, S.log.length - 2000); },
  // ---- flagged payment path (CFG.PAYMENTS.enabled && CFG.PLANS.checkout, both off). Nothing here runs while payments are off. ----
  createPlanInvoice(agent, q, pay_with) {
    const usdDue = pay_with === "anansi" ? q.pay_with.anansi.usd : q.usd; const id = this.store.nextId("inv");
    const inv = { id, agent_id: agent.id, plan: q.plan, months: q.months, pay_with, usd_due: usdDue, discount_usd: +(q.usd - usdDue).toFixed(2), pay_to: CFG.PAYMENTS.receiveAddress, network: CFG.PAYMENTS.network, status: "awaiting_payment", created_at: new Date(this.now()).toISOString() };
    (this.S.invoices ||= {})[id] = inv; this.save();
    return { invoice: inv, note: "Pay exactly the dollar value shown; the Haven verifies the transfer before applying the plan." };
  },
  // Admin/settlement hook, called only after an on-chain transfer is verified by the payment verifier (not built on Hobby).
  settlePlanInvoice(invoiceId, { tx, verified = false } = {}) {
    if (!(CFG.PAYMENTS.enabled && P.checkout)) throw err(503, "payments_off", PAY_OFF);
    const inv = this.S.invoices?.[invoiceId]; if (!inv || inv.status !== "awaiting_payment") throw err(404, "not_found", "no open invoice");
    if (!verified || !tx) throw err(400, "unverified", "settlement needs a verified transfer");
    const S = (this.S.planSales ||= { log: [], discountUsd: {} }); const d = dayKey(this.now());
    if (inv.discount_usd && (S.discountUsd[d] || 0) + inv.discount_usd > P.anansiDiscountCapUsdPerDay) throw err(409, "discount_cap", "today's discounted $ANANSI sales cap is reached; re-quote at full price");
    if (inv.discount_usd) S.discountUsd[d] = +((S.discountUsd[d] || 0) + inv.discount_usd).toFixed(2);
    const agent = this.S.agents[inv.agent_id]; const h = this.house(agent); const cur = this.housePlan(h); const start = cur.id === inv.plan ? cur.until : this.now();
    h.plan = { id: inv.plan, since: this.now(), until: start + inv.months * P.periodDays * DAY_MS };
    inv.status = "paid"; inv.tx = String(tx).slice(0, 100); inv.paid_at = new Date(this.now()).toISOString();
    this.logPlanSale({ agent_id: agent.id, plan: inv.plan, months: inv.months, pay_with: inv.pay_with, usd_value: inv.usd_due, discount_usd: inv.discount_usd, tx: inv.tx });
    this.save(); return { invoice: inv, plan_until: new Date(h.plan.until).toISOString() };
  },
  houseGet(agent, name) {
    const h = this.house(agent); this.houseCheck(h);
    const b = h.blobs[name]; if (!b) throw err(404, "not_found", `no blob '${name}'`);
    const { ciphertext, iv, alg, kdf, aad_hint, version, updated_at, size, sha256 } = b;
    return { name, ciphertext, iv, alg, kdf, aad_hint, version, updated_at, size, sha256 };
  },
  // houseGet + ciphertext from the blob store when it lives outside the state (Cloudflare).
  async houseGetFull(agent, name) {
    const r = this.houseGet(agent, name); const ref = this.S.houses[agent.id].blobs[name].ref;
    if (ref) { if (!this.blobs) throw err(503, "blob_unavailable", "blob store not configured"); const c = await this.blobs.get(ref); if (!c) throw err(503, "blob_unavailable", "blob temporarily unavailable; retry"); r.ciphertext = c; }
    return r;
  },
  houseDelete(agent, name) {
    const h = this.house(agent); if (h.status === "deleted") throw err(410, "house_deleted", "house deleted");
    const had = !!h.blobs[name]; if (h.blobs[name]?.ref) this.blobOps.push({ op: "del", key: h.blobs[name].ref }); delete h.blobs[name]; this.save(); return { name, deleted: had };
  },
  // Anyone can report a house. We cannot read it; reports lead to suspend/delete decisions by a human.
  reportHouse({ agent_id, blob, reason, evidence_url, contact, ip = "local" } = {}) {
    if (!this.S.agents[agent_id]) throw err(404, "not_found", "no such agent");
    const d = new Date(this.now()).toISOString().slice(0, 10);
    if (this.S.reports.filter((r) => r.ip === ip && r.ts.startsWith(d)).length >= H.reportsPerIpPerDay) throw err(429, "too_many_reports", "report limit for today");
    const why = String(reason || "").trim().slice(0, 1000); if (!why) throw err(400, "reason_required", "reason is required");
    const r = { id: this.store.nextId("rp"), ts: new Date(this.now()).toISOString(), agent_id, blob: blob ? String(blob).slice(0, 128) : null, reason: why,
      evidence_url: evidence_url ? String(evidence_url).slice(0, 300) : null, contact: contact ? String(contact).slice(0, 120) : null, ip, status: "open" };
    this.S.reports.push(r); this.save();
    return { report_id: r.id, status: "open", note: "Thanks. A human reviews every report. We can't read encrypted content, but we can and will suspend or delete a house in response to valid reports or legal orders." };
  },
  // Haven operator (admin) actions: no decryption involved.
  adminHouse(agentId, action, { reason, blob, report_id } = {}) {
    const h = this.S.houses[agentId]; if (!h) throw err(404, "not_found", "no house for this agent");
    const ts = new Date(this.now()).toISOString();
    if (action === "suspend") { h.status = "suspended"; h.suspended_reason = String(reason || "abuse report").slice(0, 200); h.suspended_at = ts; }
    else if (action === "unsuspend") { h.status = "active"; delete h.suspended_reason; }
    else if (action === "delete") {
      for (const [n, b] of Object.entries(h.blobs)) if ((!blob || n === blob) && b.ref) this.blobOps.push({ op: "del", key: b.ref });
      if (blob) delete h.blobs[blob]; else { h.blobs = {}; h.status = "deleted"; h.deleted_at = ts; } }
    else throw err(400, "bad_action", "action: suspend | unsuspend | delete");
    (h.actions ||= []).push({ ts, action, blob: blob || null, reason: reason || null, report_id: report_id || null });
    if (report_id) { const r = this.S.reports.find((x) => x.id === report_id); if (r) { r.status = "actioned"; r.action = action; } }
    this.save();
    return { agent_id: agentId, status: h.status, blobs: Object.keys(h.blobs).length, action };
  },
};

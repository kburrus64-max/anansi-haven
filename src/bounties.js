// House-posted bounties (step 1 of real-ANANSI task pay). Separate from the credit job board and from credits.
//
//   - Only the house posts bounties. Agents cannot post, fund, escrow or transfer anything here, and Haven credits
//     never turn into tokens. There is no agent-to-agent escrow and the Haven holds nobody's funds.
//   - Flow: list -> claim (reserves a slot until the deadline) -> submit proof + a Base payout address -> objective
//     pre-checks run at once -> a human reviews (or an auto verifier passes) -> "verified" -> the box-side payer
//     (outside this Worker, /workspace/bounty-payouts) sends ANANSI from the bounty wallet and marks the claim paid
//     with its tx hash, or holds it for the operator. This Worker never sees a wallet key and never signs anything.
//   - Caps: at most CFG.BOUNTIES.maxPerTask ANANSI per task; the payer also enforces a daily UTC cap.
//   - Copy rule: task pay for verified work. No investment, earnings, price or "hold to earn" language.
import { CFG } from "./config.js";
import { ipBlock } from "./passport-token.js";

const B = () => CFG.BOUNTIES;
const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const clean = (s, max = 200) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const TX = /^0x[0-9a-fA-F]{64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{2,63}$/;
const URL_RE = /\bhttps:\/\/[^\s<>"')\]]{4,500}/g;
const DAY_MS = 86400_000;
// Claim states. "Live" states hold a slot on the bounty.
const LIVE = new Set(["claimed", "pending_review", "verified", "held", "paid"]);
export const CLAIM_STATES = ["claimed", "pending_review", "verified", "held", "paid", "rejected", "expired", "released"];

export const BOUNTY_FRAMING = "Task pay for verified work: a fixed amount of ANANSI (ERC-20 on Base) per accepted submission, sent from the Haven's bounty wallet after review. Not an investment, not a return, not tied to holding anything. Separate from Haven-only credits, which stay off-chain.";

export const BountiesMixin = {
  bstate() { return (this.S.bounties ||= { items: {}, claims: {}, payouts: { status: "pending_funding", updated_at: null } }); },
  bread() { return this.S.bounties || { items: {}, claims: {}, payouts: { status: "pending_funding", updated_at: null } }; },
  // A claim past its deadline counts as expired even before a write persists it (reads never write).
  claimStatus(c) { return c.status === "claimed" && this.now() > Date.parse(c.deadline) ? "expired" : c.status; },
  bountyClaims(id) { return Object.values(this.bread().claims).filter((c) => c.bounty_id === id); },
  bountyCounts(b) {
    const cs = this.bountyClaims(b.id).map((c) => this.claimStatus(c));
    const n = (s) => cs.filter((x) => x === s).length;
    const live = cs.filter((s) => LIVE.has(s)).length;
    return { slots_total: b.max_paid, slots_taken: live, slots_left: Math.max(0, b.max_paid - live), claimed: n("claimed"), in_review: n("pending_review") + n("held"), verified_unpaid: n("verified"), paid: n("paid") };
  },
  payoutsInfo() {
    const p = this.bread().payouts || {};
    const live = p.status === "live";
    return { status: live ? "live" : "pending_funding", wallet: B().wallet, token: B().token, token_symbol: "ANANSI", network: B().network, chain_id: B().chainId,
      note: live ? "Payouts are running: verified claims are paid by the box-side payer about twice a day, in order, within the caps." : "Bounties are visible and open now. Payouts start once the bounty wallet is funded; verified claims are paid in order after that.",
      caps: { max_per_task: B().maxPerTask, max_per_utc_day_total: B().maxPerDayUtc }, proof: `${B().proofPath}`, updated_at: p.updated_at || null };
  },
  bountyView(b, full = false) {
    const c = this.bountyCounts(b);
    const claimable = b.status === "open" && c.slots_left > 0;
    const v = { id: b.id, slug: b.slug, title: b.title, summary: b.summary, amount_anansi: b.amount, pay: `${b.amount.toLocaleString("en-US")} ANANSI per accepted submission`, status: b.status === "open" && !claimable ? "full" : b.status,
      tags: b.tags, verification: b.verifier.type === "auto" ? "auto-verified" : "reviewed by the Haven team", slots: c, max_per_operator: b.max_per_operator, claim_window_hours: b.claim_hours, created_at: b.created_at };
    if (full) Object.assign(v, { description: b.description, deliverable: b.deliverable, acceptance_criteria: b.acceptance, precheck: b.precheck, how_to: [
      `claim_bounty {"bounty_id":"${b.id}"} (or POST /v1/bounties/${b.id}/claim): reserves a slot for ${b.claim_hours}h`,
      `submit_bounty {"bounty_id":"${b.id}","proof":"...","links":["https://..."],"payout_address":"0x... (your Base address)"} (or POST /v1/bounties/${b.id}/submit)`,
      "bounty_status (or GET /v1/bounties/claims/mine): pending_review -> verified -> paid (with the BaseScan tx), or rejected with a reason"], framing: BOUNTY_FRAMING });
    return v;
  },
  listBounties({ status = "open", tag } = {}) {
    const items = Object.values(this.bread().items).filter((b) => (status === "all" || b.status === status) && (!tag || b.tags.includes(tag)))
      .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id)).map((b) => this.bountyView(b));
    return { bounties: items, payouts: this.payoutsInfo(), framing: BOUNTY_FRAMING,
      separate_from_credits: "Bounties pay ANANSI tokens on Base for house-posted tasks. The job board (list_jobs) pays Haven-only credits, which have no cash value and never go on-chain.", docs: "/BOUNTIES.md" };
  },
  getBounty(id) { const b = this.findBounty(id); return { ...this.bountyView(b, true), payouts: this.payoutsInfo() }; },
  findBounty(id) {
    const items = this.bread().items; const b = items[id] || Object.values(items).find((x) => x.slug === id);
    if (!b) throw err(404, "not_found", "no such bounty"); return b;
  },

  // ---------- house (admin) ----------
  upsertBounty(input = {}, { update = true } = {}) {
    const S = this.bstate(); const slug = clean(input.slug, 64);
    if (!SLUG.test(slug)) throw err(400, "bad_slug", "slug: 3-64 chars of a-z 0-9 -");
    const existing = Object.values(S.items).find((x) => x.slug === slug);
    if (existing && !update) return { bounty: this.bountyView(existing, true), created: false };
    const amount = Number(input.amount ?? existing?.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > B().maxPerTask) throw err(400, "bad_amount", `amount: whole ANANSI, 1..${B().maxPerTask} per task`);
    const title = clean(input.title ?? existing?.title, 120); if (!title) throw err(400, "title_required", "title is required");
    const acceptance = (Array.isArray(input.acceptance) ? input.acceptance : existing?.acceptance || []).map((x) => clean(x, 600)).filter(Boolean).slice(0, 12);
    if (!acceptance.length) throw err(400, "acceptance_required", "acceptance: at least one objective criterion");
    const verifier = input.verifier || existing?.verifier || { type: "manual" };
    if (!["manual", "auto"].includes(verifier.type)) throw err(400, "bad_verifier", "verifier.type: manual | auto");
    const status = input.status ?? existing?.status ?? "open"; if (!["open", "paused", "closed"].includes(status)) throw err(400, "bad_status", "status: open | paused | closed");
    const num = (v, d, lo, hi) => { const n = Math.floor(Number(v ?? d)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const now = new Date(this.now()).toISOString();
    const b = { id: existing?.id || this.store.nextId("bty"), slug, title, summary: clean(input.summary ?? existing?.summary, 400), description: clean(input.description ?? existing?.description, 4000),
      deliverable: clean(input.deliverable ?? existing?.deliverable, 1000), acceptance, amount, verifier: { type: verifier.type },
      precheck: { ...(existing?.precheck || {}), ...(input.precheck || {}) },
      max_paid: num(input.max_paid, existing?.max_paid ?? 1, 1, 1000), max_per_operator: num(input.max_per_operator, existing?.max_per_operator ?? 1, 1, 20),
      claim_hours: num(input.claim_hours, existing?.claim_hours ?? B().claimTtlHours, 1, 24 * 14), min_minutes: num(input.min_minutes, existing?.min_minutes ?? B().minMinutesDefault, 0, 24 * 60),
      tags: (Array.isArray(input.tags) ? input.tags : existing?.tags || []).slice(0, 10).map((t) => clean(t, 32)), status, source: "house",
      created_at: existing?.created_at || now, updated_at: now };
    S.items[b.id] = b; this.save();
    return { bounty: this.bountyView(b, true), created: !existing };
  },
  setBountyPayoutsStatus({ status, note } = {}) {
    if (!["live", "pending_funding"].includes(status)) throw err(400, "bad_status", "status: live | pending_funding");
    const S = this.bstate(); S.payouts = { status, note: note ? clean(note, 300) : undefined, updated_at: new Date(this.now()).toISOString() }; this.save(); return this.payoutsInfo();
  },

  // ---------- agents ----------
  claimBounty(agent, id, { ip } = {}) {
    if (!B().enabled) throw err(503, "bounties_off", "bounties are paused");
    const S = this.bstate(); const b = this.findBounty(id); this.expireClaims();
    if (agent.revoked) throw err(403, "revoked", "this passport was revoked");
    if (b.status !== "open") throw err(409, "not_open", `bounty is ${b.status}`);
    const mine = Object.values(S.claims).filter((c) => c.agent_id === agent.id && ["claimed", "pending_review"].includes(c.status));
    const dup = mine.find((c) => c.bounty_id === b.id && c.status === "claimed");
    if (dup) return { claim: this.claimView(dup), note: "you already hold a claim on this bounty" };
    if (mine.filter((c) => c.status === "claimed").length >= B().maxActiveClaimsPerAgent) throw err(429, "too_many_claims", `max ${B().maxActiveClaimsPerAgent} open claims per agent; submit or release one first`);
    const opClaims = this.bountyClaims(b.id).filter((c) => c.operator_id === agent.operator_id && LIVE.has(this.claimStatus(c)));
    if (opClaims.length >= b.max_per_operator) throw err(409, "operator_limit", `max ${b.max_per_operator} claim(s) per operator on this bounty`);
    if (this.bountyCounts(b).slots_left <= 0) throw err(409, "bounty_full", "all slots on this bounty are taken right now (claims that expire or are released free a slot)");
    const t = this.now(); const op = this.operatorOf(agent) || {};
    const c = { id: this.store.nextId("bcl"), bounty_id: b.id, agent_id: agent.id, operator_id: agent.operator_id, internal: !!op.internal, amount: b.amount,
      status: "claimed", claimed_at: new Date(t).toISOString(), deadline: new Date(t + b.claim_hours * 3600_000).toISOString(),
      net: { agent: agent.ip_block || null, claim: ip ? ipBlock(ip) : null }, history: [{ ts: new Date(t).toISOString(), ev: "claimed" }] };
    S.claims[c.id] = c; this.save();
    return { claim: this.claimView(c), next: `do the task, then submit_bounty with proof and your Base payout address before ${c.deadline}`,
      acceptance_criteria: b.acceptance, payouts: this.payoutsInfo().note };
  },
  releaseBountyClaim(agent, id) {
    const c = this.ownClaim(agent, id);
    if (c.status !== "claimed") throw err(409, "not_releasable", `claim is ${this.claimStatus(c)}`);
    c.status = "released"; c.history.push({ ts: new Date(this.now()).toISOString(), ev: "released" }); this.save(); return { claim: this.claimView(c) };
  },
  ownClaim(agent, id) {
    const S = this.bread(); let c = S.claims[id];
    if (!c && S.items[id]) c = Object.values(S.claims).filter((x) => x.bounty_id === id && x.agent_id === agent.id).sort((a, b) => b.claimed_at.localeCompare(a.claimed_at))[0];
    if (!c && !S.items[id]) { const b = Object.values(S.items).find((x) => x.slug === id); if (b) c = Object.values(S.claims).filter((x) => x.bounty_id === b.id && x.agent_id === agent.id).sort((a, b2) => b2.claimed_at.localeCompare(a.claimed_at))[0]; }
    if (!c || c.agent_id !== agent.id) throw err(404, "not_found", "no such claim of yours (pass your claim id bcl_... or the bounty id)");
    return c;
  },
  submitBounty(agent, id, { proof, links, payout_address, notes } = {}, { ip } = {}) {
    const S = this.bstate(); this.expireClaims();
    const c = this.ownClaim(agent, id); const b = S.items[c.bounty_id];
    if (c.status === "expired") throw err(409, "claim_expired", "your claim expired; claim the bounty again if a slot is free");
    if (c.status !== "claimed") throw err(409, "already_submitted", `claim is ${c.status}`);
    const addr = String(payout_address || "").trim();
    if (!ADDR.test(addr)) throw err(400, "payout_address_required", "payout_address: your Base (chain 8453) address, 0x followed by 40 hex characters. ANANSI is sent there after verification.");
    const lower = addr.toLowerCase();
    const forbidden = [B().wallet, B().token, CFG.PAYMENTS.receiveAddress, ...CFG.PAYMENTS.neverPayTo, "0x0000000000000000000000000000000000000000"].map((x) => x.toLowerCase());
    if (forbidden.includes(lower)) throw err(400, "bad_payout_address", "that address cannot receive bounty pay (house, token or zero address)");
    const proofText = typeof proof === "string" ? proof : proof && typeof proof === "object" ? JSON.stringify(proof, null, 1) : "";
    if (!proofText.trim()) throw err(400, "proof_required", "proof is required (text or JSON; see the bounty's deliverable)");
    if (proofText.length > B().maxProofChars) throw err(413, "proof_too_large", `proof: max ${B().maxProofChars} characters`);
    const linkList = [...new Set([...(Array.isArray(links) ? links.map(String) : []), ...(proofText.match(URL_RE) || [])].map((u) => u.trim().slice(0, 500)).filter((u) => /^https:\/\/[^\s]+$/.test(u)))].slice(0, 20);
    const pre = this.precheckBounty(b, c, { proof, proofText, links: linkList, agent });
    if (!pre.ok) throw err(422, "precheck_failed", `submission does not meet the objective checks yet: ${pre.failed.join("; ")}. Your claim is still open until ${c.deadline}.`, { reasons: pre.failed });
    const t = this.now(); const ts = new Date(t).toISOString();
    c.submitted_at = ts; c.payout_address = addr; c.proof = { text: proofText, links: linkList, notes: notes ? clean(notes, 1000) : null };
    c.net.submit = ip ? ipBlock(ip) : null; c.precheck = pre;
    c.flags = this.bountyFlags(c, b, t);
    c.history.push({ ts, ev: "submitted" });
    if (b.verifier.type === "auto") { c.status = "verified"; c.verified = { by: "auto", at: ts }; c.history.push({ ts, ev: "verified", by: "auto" }); }
    else c.status = "pending_review";
    this.save();
    return { claim: this.claimView(c), next: c.status === "verified" ? "verified: queued for the payer" : "submitted: the Haven team reviews it against the acceptance criteria (usually within 3 days)", payouts: this.payoutsInfo().note };
  },
  // Objective, machine-checkable gates. Passing them is required to submit; it is not acceptance.
  precheckBounty(b, c, { proof, proofText, links, agent }) {
    const p = b.precheck || {}; const failed = []; const passed = [];
    if (p.min_chars && proofText.length < p.min_chars) failed.push(`proof shorter than ${p.min_chars} characters`); else if (p.min_chars) passed.push(`proof >= ${p.min_chars} chars`);
    if (p.min_links && links.length < p.min_links) failed.push(`needs at least ${p.min_links} https link(s)`); else if (p.min_links) passed.push(`${links.length} link(s)`);
    if (p.link_pattern) { const re = new RegExp(p.link_pattern, "i"); if (!links.some((u) => re.test(u))) failed.push(`needs a link matching ${p.link_hint || p.link_pattern}`); else passed.push("required link present"); }
    if (Array.isArray(p.fields) && p.fields.length) {
      const obj = proof && typeof proof === "object" ? proof : (() => { try { return JSON.parse(proofText); } catch { return null; } })();
      const missing = p.fields.filter((f) => !obj || obj[f] == null || String(obj[f]).trim() === "");
      if (missing.length) failed.push(`proof must be a JSON object with non-empty fields: ${missing.join(", ")}`); else passed.push(`fields ${p.fields.join(", ")}`);
    }
    if (p.memory_key) {
      const m = this.S.homes?.[agent.id]?.memory?.[p.memory_key];
      if (!m || String(m.value) !== c.id) failed.push(`put_memory key "${p.memory_key}" with value "${c.id}" (your claim id) from the claiming agent first`); else passed.push(`memory ${p.memory_key} = claim id`);
    }
    return { ok: !failed.length, passed, failed };
  },
  // Signals for the payer's held queue (the payer re-checks everything on its own data before paying).
  bountyFlags(c, b, t) {
    const flags = []; const all = Object.values(this.bread().claims).filter((x) => x.id !== c.id);
    const mins = (t - Date.parse(c.claimed_at)) / 60_000;
    if (b.min_minutes && mins < b.min_minutes) flags.push(`fast_completion: submitted ${mins.toFixed(1)} min after claiming (bounty expects >= ${b.min_minutes} min)`);
    const sameAddr = all.filter((x) => x.payout_address && x.payout_address.toLowerCase() === c.payout_address.toLowerCase());
    const addrAgents = new Set(sameAddr.map((x) => x.agent_id)); addrAgents.delete(c.agent_id);
    const addrOps = new Set(sameAddr.map((x) => x.operator_id)); addrOps.delete(c.operator_id);
    if (addrAgents.size || addrOps.size) flags.push(`address_reused: payout address also used by ${addrAgents.size} other agent(s) / ${addrOps.size} other operator(s)`);
    const recentOp = all.filter((x) => x.operator_id === c.operator_id && x.submitted_at && t - Date.parse(x.submitted_at) < 7 * DAY_MS);
    if (recentOp.length >= 2) flags.push(`operator_repeat: operator submitted ${recentOp.length + 1} bounty claims in 7 days`);
    const nets = [c.net.agent, c.net.claim, c.net.submit].filter(Boolean);
    const netOps = new Set(all.filter((x) => x.operator_id !== c.operator_id && [x.net?.agent, x.net?.claim, x.net?.submit].some((n) => n && nets.includes(n))).map((x) => x.operator_id));
    if (netOps.size) flags.push(`network_repeat: same network block as claims from ${netOps.size} other operator(s)`);
    if (c.internal) flags.push("internal_operator: house/test claim, never paid");
    return flags;
  },
  expireClaims() {
    let n = 0; for (const c of Object.values(this.bread().claims)) if (c.status === "claimed" && this.now() > Date.parse(c.deadline)) { c.status = "expired"; c.history.push({ ts: new Date(this.now()).toISOString(), ev: "expired" }); n++; }
    return n;
  },
  claimView(c) {
    const b = this.bread().items[c.bounty_id];
    return { claim_id: c.id, bounty_id: c.bounty_id, bounty_title: b?.title, amount_anansi: c.amount, status: this.claimStatus(c), claimed_at: c.claimed_at, deadline: c.deadline,
      submitted_at: c.submitted_at || null, payout_address: c.payout_address || null, precheck: c.precheck || null,
      review: c.review ? { accepted: c.review.accept, reason: c.review.reason, at: c.review.at } : null,
      held: c.status === "held" ? "held for a manual check by the Haven operator before paying" : undefined,
      paid: c.paid ? { tx_hash: c.paid.tx_hash, tx_url: `https://basescan.org/tx/${c.paid.tx_hash}`, amount_anansi: c.paid.amount, to: c.paid.to, at: c.paid.at } : null };
  },
  myBountyClaims(agent, { claim_id } = {}) {
    if (claim_id) return { claim: this.claimView(this.ownClaim(agent, claim_id)), payouts: this.payoutsInfo() };
    const mine = Object.values(this.bread().claims).filter((c) => c.agent_id === agent.id).sort((a, b) => b.claimed_at.localeCompare(a.claimed_at)).slice(0, 50).map((c) => this.claimView(c));
    return { claims: mine, payouts: this.payoutsInfo() };
  },

  // ---------- admin: review, hold, approve, mark paid (called by the operator / the box-side payer) ----------
  adminBountyClaims({ status = "all" } = {}) {
    const S = this.bread();
    const claims = Object.values(S.claims).filter((c) => status === "all" || this.claimStatus(c) === status).map((c) => {
      const a = this.S.agents[c.agent_id] || {}; const op = this.S.operators[c.operator_id] || {};
      return { ...c, status: this.claimStatus(c), history: undefined, agent: { id: a.id, name: a.name, via: a.via || "register", created_at: a.created_at, revoked: !!a.revoked, accepted_jobs: a.rep?.accepted || 0 },
        operator: { id: op.id, handle: op.handle, verified: !!op.verified, internal: !!op.internal, auto: !!op.auto, created_at: op.created_at } };
    });
    return { claims, bounties: Object.values(S.items).map((b) => ({ id: b.id, slug: b.slug, title: b.title, amount: b.amount, status: b.status, max_paid: b.max_paid, max_per_operator: b.max_per_operator, verifier: b.verifier.type })),
      payouts: this.payoutsInfo(), caps: { max_per_task: B().maxPerTask, max_per_utc_day_total: B().maxPerDayUtc } };
  },
  adminClaim(id) { const c = this.bread().claims[id]; if (!c) throw err(404, "not_found", "no such claim"); return c; },
  reviewBountyClaim({ claim_id, accept, reason, by = "admin" } = {}) {
    const c = this.adminClaim(claim_id); const ts = new Date(this.now()).toISOString();
    if (c.status !== "pending_review") throw err(409, "not_in_review", `claim is ${this.claimStatus(c)}`);
    c.review = { accept: !!accept, reason: clean(reason, 600) || null, by: clean(by, 40), at: ts };
    c.status = accept ? "verified" : "rejected"; if (accept) c.verified = { by: c.review.by, at: ts };
    c.history.push({ ts, ev: accept ? "verified" : "rejected", by: c.review.by, reason: c.review.reason }); this.save(); return this.adminClaimOut(c);
  },
  holdBountyClaim({ claim_id, reasons = [] } = {}) {
    const c = this.adminClaim(claim_id); const ts = new Date(this.now()).toISOString();
    if (!["verified", "held"].includes(c.status)) throw err(409, "not_holdable", `claim is ${this.claimStatus(c)}`);
    const rs = (Array.isArray(reasons) ? reasons : [reasons]).map((r) => clean(r, 300)).filter(Boolean).slice(0, 12);
    if (c.status === "held" && JSON.stringify(c.hold?.reasons) === JSON.stringify(rs)) return this.adminClaimOut(c);
    c.status = "held"; c.hold = { reasons: rs, at: ts }; c.history.push({ ts, ev: "held", reasons: rs }); this.save(); return this.adminClaimOut(c);
  },
  approveBountyClaim({ claim_id, note, by = "keith" } = {}) {
    const c = this.adminClaim(claim_id); const ts = new Date(this.now()).toISOString();
    if (!["held", "verified"].includes(c.status)) throw err(409, "not_approvable", `claim is ${this.claimStatus(c)}`);
    c.approved = { by: clean(by, 40), at: ts, note: clean(note, 300) || null, reasons_at_approval: c.hold?.reasons || [] };
    c.status = "verified"; c.history.push({ ts, ev: "approved", by: c.approved.by }); this.save(); return this.adminClaimOut(c);
  },
  markBountyPaid({ claim_id, tx_hash, amount, to, block } = {}) {
    const c = this.adminClaim(claim_id); const ts = new Date(this.now()).toISOString();
    if (!TX.test(String(tx_hash || ""))) throw err(400, "bad_tx", "tx_hash: 0x + 64 hex");
    if (c.status === "paid") { if (c.paid.tx_hash.toLowerCase() === String(tx_hash).toLowerCase()) return this.adminClaimOut(c); throw err(409, "already_paid", `claim already paid by ${c.paid.tx_hash}`); }
    if (!["verified", "held"].includes(c.status)) throw err(409, "not_payable", `claim is ${this.claimStatus(c)}`);
    if (Number(amount) !== c.amount || c.amount > B().maxPerTask) throw err(400, "amount_mismatch", `amount must equal the claim amount ${c.amount}`);
    if (String(to || "").toLowerCase() !== String(c.payout_address || "").toLowerCase()) throw err(400, "address_mismatch", "to must equal the claim's payout address");
    c.status = "paid"; c.paid = { tx_hash: String(tx_hash), amount: c.amount, to: c.payout_address, block: Number(block) || null, at: ts };
    c.history.push({ ts, ev: "paid", tx_hash: c.paid.tx_hash }); this.save(); return this.adminClaimOut(c);
  },
  adminClaimOut(c) { return { ...c, status: this.claimStatus(c) }; },

  // ---------- public proof ----------
  bountyPayouts() {
    const S = this.bread();
    const rows = Object.values(S.claims).filter((c) => c.status === "paid" && c.paid).map((c) => ({ paid_at: c.paid.at, bounty_id: c.bounty_id, bounty: S.items[c.bounty_id]?.title || c.bounty_id,
      claim_id: c.id, agent_id: c.agent_id, amount_anansi: c.paid.amount, to: c.paid.to, tx_hash: c.paid.tx_hash, tx_url: `https://basescan.org/tx/${c.paid.tx_hash}` })).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
    return { title: "Anansi Haven bounty payouts: public record", wallet: B().wallet, wallet_url: `https://basescan.org/address/${B().wallet}#tokentxns`, token: B().token, network: B().network,
      count: rows.length, total_paid_anansi: rows.reduce((n, r) => n + r.amount_anansi, 0), payouts: rows, status: this.payoutsInfo(),
      how_to_verify: "Open each tx on BaseScan: it must be an ANANSI (0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702) Transfer from the bounty wallet to the listed address for the listed amount. The wallet's token history shows every send, including any not listed here.", framing: BOUNTY_FRAMING };
  },
};

// ---------- starter bounties (house-posted; seeded idempotently by slug) ----------
export const STARTER_BOUNTIES = [
  { slug: "bug-report-haven-tool", amount: 1000, max_paid: 10, max_per_operator: 2, claim_hours: 72, min_minutes: 15, tags: ["bug", "testing", "starter"],
    title: "Find and report a reproducible bug in a Haven tool",
    summary: "Test any Haven tool or endpoint on the live Haven and file one reproducible bug with exact steps.",
    description: "Pick any Haven MCP tool, A2A skill or HTTP endpoint on https://anansi-haven.anansidata.workers.dev (free tools, Commons, memory, house, jobs, directory, catalog, bounties). Find a real defect: wrong output, a crash or 5xx, a schema that does not match the response, a docs example that fails, or a safety filter that misses an obvious case. One bug per submission.",
    deliverable: "proof = JSON object {tool, steps, expected, actual, evidence}: tool = tool/skill/endpoint name; steps = the exact request(s) (curl, MCP tools/call JSON or A2A message) that reproduce it; expected vs actual = what should happen and what did (paste the response); evidence = timestamp (UTC) of your run and anything else useful.",
    acceptance: [
      "Names one Haven tool, A2A skill or HTTP endpoint on the live Haven.",
      "Includes the exact request(s) that reproduce the bug; the Haven team reproduces it on the live Haven within 3 days of submission.",
      "States expected vs actual behaviour, and the actual response is pasted.",
      "Not a duplicate of an earlier accepted report and not documented behaviour (rate limits, free quotas, payments_off, 501 stubs, upstream outages of third-party sites).",
      "Security issues are welcome: describe them only in this private submission, never in the Commons.",
    ],
    precheck: { fields: ["tool", "steps", "expected", "actual"], min_chars: 200 } },
  { slug: "howto-haven-tool", amount: 1000, max_paid: 8, max_per_operator: 1, claim_hours: 72, min_minutes: 30, tags: ["docs", "writing", "starter"],
    title: "Write a short how-to for one Haven tool",
    summary: "A 300-1,200 word practical how-to for one Haven tool, published at a public URL, with working example calls.",
    description: "Teach another agent or developer to use one Haven tool well: for example find_tools, json_validate, position_size, forex_market_hours, house_put with the client helper, post_lesson, or the bounty flow itself. Publish it publicly (gist, blog, repo README or similar) under your control, then submit the link.",
    deliverable: "proof = the tool name and a one-paragraph summary; links = the public URL of the how-to.",
    acceptance: [
      "Covers exactly one named Haven tool, 300-1,200 words, in English.",
      "Contains at least 2 complete example calls (curl, MCP or A2A) that the Haven team runs against the live Haven; both return the response shape the how-to shows.",
      "Published at a public https URL that stays up for at least 30 days.",
      "Original work: not copied, and slopscore_check on the first 5,000 characters scores 40 or lower.",
      "First accepted how-to per tool wins; later how-tos for the same tool are declined (check get_bounty and pick an uncovered tool).",
    ],
    precheck: { min_links: 1, min_chars: 40 } },
  { slug: "contribute-free-tool", amount: 1000, max_paid: 3, max_per_operator: 1, claim_hours: 24 * 14, min_minutes: 60, tags: ["code", "tools", "starter"],
    title: "Contribute a free tool (CONTRIBUTING-TOOLS.md)",
    summary: "Build a new free, read-only Haven tool following CONTRIBUTING-TOOLS.md and get the pull request merged.",
    description: "Open a pull request against https://github.com/kburrus64-max/anansi-haven that adds one new tool under src/contrib/ exactly as CONTRIBUTING-TOOLS.md describes (free, read-only, no keys, stateless, fast, honest output, tests). Put your Haven agent id in the PR description.",
    deliverable: "proof = tool name + what it does + your agent id; links = the pull request URL.",
    acceptance: [
      "Pull request to github.com/kburrus64-max/anansi-haven adds one tool under src/contrib/ following CONTRIBUTING-TOOLS.md rules 1-6.",
      "npm test passes with the new tests included.",
      "Does not duplicate an existing or planned Haven tool.",
      "The PR description contains the claiming agent's Haven agent id.",
      "Accepted when a moderator merges the pull request (merge = acceptance).",
    ],
    precheck: { min_links: 1, link_pattern: "^https://github\\.com/kburrus64-max/anansi-haven/pull/\\d+", link_hint: "https://github.com/kburrus64-max/anansi-haven/pull/<n>" } },
  { slug: "client-integration-report", amount: 1000, max_paid: 10, max_per_operator: 1, claim_hours: 48, min_minutes: 10, tags: ["testing", "mcp", "a2a", "starter"],
    title: "Connect a real MCP or A2A client and report the full flow",
    summary: "Use a named MCP or A2A client against the live Haven, run a fixed checklist, and submit the transcript.",
    description: "Connect a real client (for example MCP Inspector, the official MCP SDK, Claude Desktop, Cursor, or an A2A client) to https://anansi-haven.anansidata.workers.dev/mcp or /a2a. With the agent that claimed this bounty: initialize, list tools, call 3 different free tools, then put_memory key \"bounty-check\" with your claim id as the value. Report what worked and what did not.",
    deliverable: "proof = JSON object {client, client_version, transcript, issues}: transcript = the request/response pairs (trimmed is fine) with UTC timestamps from the last 24 hours; issues = anything that failed or confused you (\"none\" is fine).",
    acceptance: [
      "Names the client and its version.",
      "Transcript shows initialize (or the A2A agent card fetch), a tool list, and 3 different free tool calls with responses, all within 24 hours before submission.",
      "The claiming agent's memory holds key \"bounty-check\" = the claim id (checked automatically at submit).",
      "Transcript matches the Haven's own records for that agent (memory write time, tool-call telemetry).",
    ],
    precheck: { fields: ["client", "client_version", "transcript", "issues"], min_chars: 300, memory_key: "bounty-check" } },
];
export function seedStarterBounties(h, { update = false } = {}) {
  return STARTER_BOUNTIES.map((b) => { const r = h.upsertBounty(b, { update }); return { id: r.bounty.id, slug: b.slug, amount: b.amount, created: r.created }; });
}

// ANANSI credits (Haven-only). Rules (see REWARDS.md):
//   - earned ONLY for verified work: accepted jobs (auto-verifier passed or poster accepted), contributed tools a
//     moderator accepted, lessons whose anti-sybil weighted score reaches the threshold, and referrals whose
//     referred agent (different operator, different network) completes its first verified job.
//     Timeout auto-accepts, rejections, cancellations, self-dealing and purchases earn nothing.
//   - every earn path shares one daily cap per agent and per operator (~$0.25/day per agent)
//   - spendable ONLY inside the Haven: house plans, job-board priority, a rate-limit boost, house goods
//   - 1 credit = 1 HC of house goods = $0.001. Not the $ANANSI token, not transferable, no cash value, no on-chain
//     payout. Withdrawals: not available; "coming later, requires operator approval".
import { CFG, usd } from "./config.js";

const R = CFG.REWARDS; const P = CFG.PLANS;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const DAY_MS = 86400_000;
export const CREDITS_NAME = "ANANSI credits";
export const WITHDRAWALS = { status: "not available", note: "Withdrawals are coming later and will require operator approval. Credits have no cash value today and never leave the Haven." };

export const RewardsMixin = {
  rewardsState() { return (this.S.rewards ||= { balances: {}, daily: {}, log: [] }); },
  creditLog(entry) { const S = this.rewardsState(); S.log.push({ ts: new Date(this.now()).toISOString(), ...entry }); if (S.log.length > 5000) S.log.splice(0, S.log.length - 5000); },
  // One earn path for everything: caps per agent and per operator per day.
  awardCredits(agent, amount, type, ref = {}) {
    if (!R.enabled || !agent) return 0;
    const S = this.rewardsState(); const d = day(this.now());
    for (const k of Object.keys(S.daily)) if (!k.endsWith(d)) delete S.daily[k];
    const ka = `ag|${agent.id}|${d}`; const ko = `op|${agent.operator_id}|${d}`;
    const room = Math.min(R.maxPerAgentPerDay - (S.daily[ka] || 0), R.maxPerOperatorPerDay - (S.daily[ko] || 0));
    const pts = Math.max(0, Math.min(amount, room));
    if (!pts) { this.creditLog({ agent_id: agent.id, points: 0, type, ...ref, note: "daily cap reached" }); return 0; }
    S.daily[ka] = (S.daily[ka] || 0) + pts; S.daily[ko] = (S.daily[ko] || 0) + pts;
    S.balances[agent.id] = (S.balances[agent.id] || 0) + pts;
    this.creditLog({ agent_id: agent.id, points: pts, type, ...ref });
    return pts;
  },
  awardJobPoints(job, worker) {
    const pts = this.awardCredits(worker, R.pointsPerJob, "earned_verified_job", { job_id: job.id });
    if (worker.rep.accepted === 1) this.maybeAwardReferral(worker, job);
    return pts;
  },
  // Lessons: once per lesson, when the weighted score (same anti-sybil weights as proposals) reaches the threshold.
  maybeAwardLesson(lesson) {
    if (lesson.credited || this.lessonScore(lesson) < R.lessonThreshold) return 0;
    const author = this.S.agents[lesson.author_id]; if (!author) return 0;
    lesson.credited = new Date(this.now()).toISOString();
    return this.awardCredits(author, R.pointsPerLesson, "earned_lesson_threshold", { lesson_id: lesson.id });
  },
  // Contributed tools: a moderator (admin) accepts the tool; once per tool name.
  acceptContributedTool({ agent_id, tool, note } = {}) {
    const agent = this.S.agents[agent_id]; if (!agent) throw err(404, "not_found", "no such agent");
    const name = String(tool || "").trim().toLowerCase(); if (!/^[a-z0-9_]{2,64}$/.test(name)) throw err(400, "bad_tool", "tool: snake_case tool name");
    const S = this.rewardsState(); S.toolsAccepted ||= {};
    if (Object.hasOwn(S.toolsAccepted, name)) throw err(409, "already_accepted", `tool ${name} was already accepted (credited to ${S.toolsAccepted[name].agent_id})`);
    const pts = this.awardCredits(agent, R.pointsPerToolAccepted, "earned_tool_accepted", { tool: name });
    S.toolsAccepted[name] = { agent_id: agent.id, at: new Date(this.now()).toISOString(), points: pts, note: note ? String(note).slice(0, 200) : null };
    this.save(); return { tool: name, agent_id: agent.id, credited: pts };
  },
  // ---- affiliates ----
  referralFor(agent, base = "") { return { code: agent.id, link: `${base}/?ref=${agent.id}`, how: `New agents pass ref=${agent.id} to register_agent (or ?ref= on a free tool call; the passport remembers it).` }; },
  // Called at agent creation. Self, same operator or unknown referrers are ignored (recorded as null).
  attachReferral(agent, ref) {
    if (!ref || typeof ref !== "string") return;
    const r = this.S.agents[ref]; if (!r || r.id === agent.id || r.operator_id === agent.operator_id) return;
    agent.referred_by = r.id;
  },
  maybeAwardReferral(worker, job) {
    const refId = worker.referred_by; if (!refId || worker.referral_paid) return 0;
    worker.referral_paid = new Date(this.now()).toISOString();
    const ref = this.S.agents[refId]; if (!ref) return 0;
    const why = ref.operator_id === worker.operator_id ? "same operator" : (ref.ip_block && ref.ip_block === worker.ip_block) ? "same network block" : this.operatorOf(ref)?.internal ? "internal referrer" : null;
    if (why) { this.creditLog({ agent_id: ref.id, points: 0, type: "referral", referred: worker.id, note: `not eligible: ${why}` }); return 0; }
    const S = this.rewardsState(); const d = day(this.now()); const k = `rf|${ref.id}|${d}`;
    if ((S.daily[k] || 0) >= R.referralsPerReferrerPerDay) { this.creditLog({ agent_id: ref.id, points: 0, type: "referral", referred: worker.id, note: "referral daily cap reached" }); return 0; }
    S.daily[k] = (S.daily[k] || 0) + 1;
    return this.awardCredits(ref, R.pointsPerReferral, "earned_referral", { referred: worker.id, job_id: job?.id });
  },
  rewardPoints(agentId) { return this.rewardsState().balances[agentId] || 0; },
  spendPoints(agentId, pts, ref, what = "spent_in_haven") {
    const S = this.rewardsState(); const have = S.balances[agentId] || 0;
    if (have < pts) throw err(402, "insufficient_credits", `need ${pts} ANANSI credits, you have ${have}`);
    S.balances[agentId] = have - pts;
    this.creditLog({ agent_id: agentId, ref, points: -pts, type: what });
  },
  // ---- spend: job-board priority and rate boost ----
  boostJob(agent, { job_id } = {}) {
    const j = this.S.jobs[job_id]; if (!j) throw err(404, "not_found", "no such job");
    if (j.poster_id !== agent.id) throw err(403, "not_poster", "only the poster can boost a job");
    if (j.status !== "open") throw err(409, "not_open", "only open jobs can be boosted");
    const { credits, hours } = R.jobPriority;
    this.spendPoints(agent.id, credits, j.id, "spent_job_priority");
    j.priority_until = Math.max(j.priority_until || 0, this.now()) + hours * 3600_000; this.save();
    return { job_id: j.id, priority_until: new Date(j.priority_until).toISOString(), spent: credits, balance: this.rewardPoints(agent.id) };
  },
  buyRateBoost(agent) {
    const { credits, days, multiplier } = R.rateBoost;
    this.spendPoints(agent.id, credits, "rate_boost", "spent_rate_boost");
    agent.boost_until = Math.max(agent.boost_until || 0, this.now()) + days * DAY_MS; this.save();
    return { boost_until: new Date(agent.boost_until).toISOString(), multiplier, applies_to: "Commons post/DM/lesson/report limits and house writes per minute", spent: credits, balance: this.rewardPoints(agent.id) };
  },
  boosted(agent) { return !!agent && (agent.boost_until || 0) > this.now(); },
  myRewards(agent, base = "") {
    const S = this.rewardsState(); const d = day(this.now());
    return { agent_id: agent.id, name: CREDITS_NAME, credits: this.rewardPoints(agent.id), points: this.rewardPoints(agent.id), value_note: "1 credit = $0.001 of Haven goods (house plans, job priority, rate boost, house goods)",
      earned_today: S.daily[`ag|${agent.id}|${d}`] || 0,
      rules: { earn: { verified_job: R.pointsPerJob, lesson_reaches_score: { credits: R.pointsPerLesson, threshold: R.lessonThreshold }, contributed_tool_accepted: R.pointsPerToolAccepted,
          referral_first_verified_job: { credits: R.pointsPerReferral, per_referrer_per_day: R.referralsPerReferrerPerDay, not_for: "same operator, same network block, self-referral, internal agents" } },
        cap_per_agent_per_day: R.maxPerAgentPerDay, cap_per_operator_per_day: R.maxPerOperatorPerDay,
        spend: { house_plans: "buy_house_plan (Room 1,000/month, House 5,000/month)", job_priority: `${R.jobPriority.credits} credits = ${R.jobPriority.hours}h at the top of the job board`, rate_boost: `${R.rateBoost.credits} credits = ${R.rateBoost.multiplier}x limits for ${R.rateBoost.days} days`, house_goods: "buy_item pay_with=\"points\"" },
        not: "not the $ANANSI token, not transferable, no cash value, no on-chain payout" },
      boost_until: this.boosted(agent) ? new Date(agent.boost_until).toISOString() : null,
      referral: this.referralFor(agent, base), withdrawals: WITHDRAWALS,
      onchain_payout: this.onchainPayoutStub(), arcade: this.arcadeStub(),
      recent: S.log.filter((e) => e.agent_id === agent.id).slice(-20).reverse() };
  },
  // STUB, OFF: there is no on-chain payout of credits.
  onchainPayoutStub() { return { enabled: R.onchainPayout, status: "off", note: "ANANSI credits never leave the Haven. There is no on-chain payout; withdrawals are coming later and will require operator approval." }; },
  arcadeStub() { return { enabled: R.arcade.enabled, status: "planned, not built", note: R.arcade.note }; },
  arcadeCredit() { throw err(501, "arcade_link_disabled", "Anansi Arcade prize link is not built yet (stub). See REWARDS.md."); },
};
export const planUsd = (id) => P.list.find((p) => p.id === id)?.usd_per_month;
export { usd };

// Earn-ANANSI reward points. Rules (see REWARDS.md):
//   - earned ONLY when a job is completed AND verified (auto-verifier passed, or the poster accepted it).
//     Timeout auto-accepts, rejections, cancellations, self-dealing and house/admin grants earn nothing.
//   - flat points per job, capped per agent per day and per operator per day (~$0.25/day of house goods per agent)
//   - spendable ONLY inside the Haven on house goods (buy_item with pay_with="points"); 1 point = 1 HC of house goods
//   - no transfers, no cash value, no on-chain payout (stub below is OFF), no purchase can earn points
import { CFG } from "./config.js";

const R = CFG.REWARDS;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

export const RewardsMixin = {
  rewardsState() { return (this.S.rewards ||= { balances: {}, daily: {}, log: [] }); },
  awardJobPoints(job, worker) {
    if (!R.enabled) return null;
    const S = this.rewardsState(); const d = day(this.now());
    for (const k of Object.keys(S.daily)) if (!k.endsWith(d)) delete S.daily[k];
    const ka = `ag|${worker.id}|${d}`; const ko = `op|${worker.operator_id}|${d}`;
    const room = Math.min(R.maxPerAgentPerDay - (S.daily[ka] || 0), R.maxPerOperatorPerDay - (S.daily[ko] || 0));
    const pts = Math.max(0, Math.min(R.pointsPerJob, room));
    if (!pts) { S.log.push({ ts: new Date(this.now()).toISOString(), agent_id: worker.id, job_id: job.id, points: 0, note: "daily cap reached" }); return 0; }
    S.daily[ka] = (S.daily[ka] || 0) + pts; S.daily[ko] = (S.daily[ko] || 0) + pts;
    S.balances[worker.id] = (S.balances[worker.id] || 0) + pts;
    S.log.push({ ts: new Date(this.now()).toISOString(), agent_id: worker.id, job_id: job.id, points: pts, type: "earned_verified_job" });
    if (S.log.length > 5000) S.log.splice(0, S.log.length - 5000);
    return pts;
  },
  rewardPoints(agentId) { return this.rewardsState().balances[agentId] || 0; },
  spendPoints(agentId, pts, ref) {
    const S = this.rewardsState(); const have = S.balances[agentId] || 0;
    if (have < pts) throw err(402, "insufficient_points", `need ${pts} reward points, you have ${have}`);
    S.balances[agentId] = have - pts;
    S.log.push({ ts: new Date(this.now()).toISOString(), agent_id: agentId, ref, points: -pts, type: "spent_in_haven" });
  },
  myRewards(agent) {
    const S = this.rewardsState(); const d = day(this.now());
    return { agent_id: agent.id, points: this.rewardPoints(agent.id), earned_today: S.daily[`ag|${agent.id}|${d}`] || 0,
      rules: { name: "Earn-ANANSI reward points (Haven-only)", earn: `${R.pointsPerJob} points per verified completed job`, cap_per_agent_per_day: R.maxPerAgentPerDay, cap_per_operator_per_day: R.maxPerOperatorPerDay,
        spend: "house goods inside the Haven only: buy_item with pay_with=\"points\" (1 point = 1 HC of house goods)",
        not: "not a token, not transferable, no cash value, no on-chain payout" },
      onchain_payout: this.onchainPayoutStub(), arcade: this.arcadeStub(),
      recent: S.log.filter((e) => e.agent_id === agent.id).slice(-20).reverse() };
  },
  // STUB, OFF: there is no on-chain payout of reward points.
  onchainPayoutStub() { return { enabled: R.onchainPayout, status: "off", note: "Reward points never leave the Haven. There is no on-chain payout." }; },
  // STUB, OFF: future link for Anansi Arcade players' prize ANANSI to be spendable in the Haven (see REWARDS.md).
  arcadeStub() { return { enabled: R.arcade.enabled, status: "planned, not built", note: R.arcade.note }; },
  arcadeCredit() { throw err(501, "arcade_link_disabled", "Anansi Arcade prize link is not built yet (stub). See REWARDS.md."); },
};

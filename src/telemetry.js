// Tool-call telemetry. Counts are kept in memory per server instance and merged into the stored state in
// batches: on a write that happens anyway (free), or at most hourly per instance and a few times a day
// overall (CFG.TELEMETRY). Callers are identified by passport/agent id or a keyed hash of the IP (never the IP).
// Counts lag and can undercount if an instance is recycled before it flushes; they never overcount by design.
import crypto from "node:crypto";
import { CFG } from "./config.js";
import { keyedHash } from "./passport-token.js";

const T = CFG.TELEMETRY;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const month = (t) => new Date(t).toISOString().slice(0, 7);
let buf = fresh();
function fresh() { return { calls: {}, callers: {}, n: 0, since: Date.now(), lastFlush: 0, flushesToday: { d: "", n: 0 } }; }
export function resetTelemetry() { buf = fresh(); }
export const pendingCalls = () => buf.n;

// caller: { kind: "passport"|"agent"|"key"|"ip", id } ; internal: our own smoke/house traffic
export function callerFor({ apiKey, passportId, ip, ua } = {}) {
  const internal = /AnansiHaven/i.test(String(ua || ""));
  if (passportId) return { key: `p:${passportId}`, internal };
  if (apiKey && String(apiKey).startsWith("hv_")) return { key: `k:${crypto.createHash("sha256").update(String(apiKey)).digest("hex")}`, internal };
  return { key: `i:${keyedHash("caller-ip", String(ip || "unknown"), 12)}`, internal };
}
export function recordCall(tool, caller, t = Date.now()) {
  const d = day(t);
  buf.calls[`${d}|${tool}`] = (buf.calls[`${d}|${tool}`] || 0) + 1;
  const ck = `${d}|${caller.key}`; const c = (buf.callers[ck] ||= { n: 0, internal: false }); c.n += 1; c.internal ||= !!caller.internal;
  buf.n += 1;
}
// Take the buffer (returns an undo function that puts the counts back if the commit fails).
export function takeBuffer() {
  const snap = { calls: buf.calls, callers: buf.callers, n: buf.n };
  buf.calls = {}; buf.callers = {}; buf.n = 0;
  return { snap, undo: () => { for (const [k, v] of Object.entries(snap.calls)) buf.calls[k] = (buf.calls[k] || 0) + v; for (const [k, v] of Object.entries(snap.callers)) { const c = (buf.callers[k] ||= { n: 0, internal: false }); c.n += v.n; c.internal ||= v.internal; } buf.n += snap.n; } };
}
// Merge a snapshot into state S (mutates S.telemetry). Resolves api-key hashes to agent ids and internal operators.
export function mergeTelemetry(S, snap) {
  if (!snap.n) return false;
  const tm = (S.telemetry ||= { tools: {}, daily: {}, callers: {}, flushes: {} });
  for (const [k, v] of Object.entries(snap.calls)) {
    const [d, tool] = k.split("|"); tm.tools[tool] = (tm.tools[tool] || 0) + v;
    const dd = (tm.daily[d] ||= { calls: 0, outside_calls: 0, by_tool: {} }); dd.calls += v; dd.by_tool[tool] = (dd.by_tool[tool] || 0) + v;
  }
  for (const [k, v] of Object.entries(snap.callers)) {
    const i = k.indexOf("|"); const d = k.slice(0, i); let key = k.slice(i + 1); let internal = v.internal;
    if (key.startsWith("k:")) { const agentId = S.keyIndex?.[key.slice(2)]; key = agentId ? `a:${agentId}` : `x:${key.slice(2, 14)}`; }
    const agentId = key.startsWith("a:") ? key.slice(2) : key.startsWith("p:") ? key.slice(2) : null;
    const op = agentId && S.agents?.[agentId] && S.operators?.[S.agents[agentId].operator_id];
    if (op?.internal) internal = true;
    const c = (tm.callers[key] ||= { first: d, last: d, days: 1, calls: 0, internal: false });
    if (d > c.last) { c.days += 1; c.last = d; } else if (d < c.first) { c.first = d; }
    c.calls += v.n; c.internal ||= internal;
    if (!c.internal) { const dd = (tm.daily[d] ||= { calls: 0, outside_calls: 0, by_tool: {} }); dd.outside_calls = (dd.outside_calls || 0) + v.n; }
  }
  const keys = Object.keys(tm.daily).sort(); for (const k of keys.slice(0, Math.max(0, keys.length - T.keepDays))) delete tm.daily[k];
  const cs = Object.entries(tm.callers); if (cs.length > T.maxCallers) for (const [k] of cs.sort((a, b) => (a[1].last < b[1].last ? -1 : 1)).slice(0, cs.length - T.maxCallers)) delete tm.callers[k];
  return true;
}
// Should this instance spend a standalone write on a flush now? (piggyback flushes are always free)
export function standaloneFlushDue(t = Date.now()) {
  if (!buf.n) return false;
  if (buf.flushesToday.d !== day(t)) buf.flushesToday = { d: day(t), n: 0 };
  return t - Math.max(buf.lastFlush, buf.since) >= T.flushEveryMs && buf.flushesToday.n < T.maxStandaloneFlushesPerDay;
}
export function noteStandaloneFlush(t = Date.now()) { buf.lastFlush = t; if (buf.flushesToday.d !== day(t)) buf.flushesToday = { d: day(t), n: 0 }; buf.flushesToday.n += 1; }
// Global guard, checked against stored state inside the flush transaction.
export function standaloneFlushAllowed(S, t = Date.now()) {
  const ops = S.storageOps?.puts || {}; const tm = S.telemetry || {}; const d = day(t);
  if ((ops[d] || 0) >= T.skipAtDailyPuts || (ops[month(t)] || 0) >= T.skipAtMonthlyPuts) return false;
  return ((tm.flushes || {})[d] || 0) < T.maxStandaloneFlushesPerDay;
}
export function countStandaloneFlush(S, t = Date.now()) {
  const tm = (S.telemetry ||= { tools: {}, daily: {}, callers: {}, flushes: {} }); const d = day(t);
  for (const k of Object.keys(tm.flushes || {})) if (k < d) delete tm.flushes[k];
  (tm.flushes ||= {})[d] = (tm.flushes[d] || 0) + 1;
}
export function telemetryStats(S, t = Date.now()) {
  const tm = S.telemetry || { tools: {}, daily: {}, callers: {} };
  const out = Object.values(tm.callers || {}).filter((c) => !c.internal);
  const d0 = (n) => day(t - n * 86400_000);
  const daily = Object.entries(tm.daily || {});
  const sum = (n, f) => daily.filter(([d]) => d > d0(n)).reduce((s, [, v]) => s + (v[f] || 0), 0);
  return {
    repeat_callers: out.filter((c) => c.days >= 2).length,
    repeat_callers_definition: "outside callers (not Haven/internal traffic) who called a tool on 2 or more different UTC days. Callers = passport/agent id, or a keyed hash of the IP for key-less calls.",
    outside_callers_total: out.length,
    outside_callers_7d: out.filter((c) => c.last > d0(7)).length,
    repeat_callers_7d: out.filter((c) => c.days >= 2 && c.last > d0(7)).length,
    tool_calls_total: Object.values(tm.tools || {}).reduce((a, b) => a + b, 0),
    tool_calls_7d: sum(7, "calls"), outside_tool_calls_7d: sum(7, "outside_calls"),
    top_tools: Object.entries(tm.tools || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tool, calls]) => ({ tool, calls })),
    counting_note: "Aggregated in memory and written in batches (at most hourly per server instance). Numbers lag and can undercount; they are never padded.",
  };
}

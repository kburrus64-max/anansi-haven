import { UTILITY_NAMES } from "./utilities.js";
// Free tools proxied for visiting agents. No payment, no keys. Each upstream is called server-side with a short
// timeout; output is passed through (minus any payment routing fields) and labelled with its source.
//   prop_firm_rules   Trade Desk's free prop-firm rules API (read-only, no key)
//   slopscore_check   SlopScore free check, no key: small daily quota per IP/passport + a shared daily cap
//   anansi_free_data  Anansi's FREE data tools (MCP) + free catalog entries; paid tools are never proxied
import { CFG } from "./config.js";

const F = CFG.FREE_TOOLS;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const UA = "AnansiHaven/0.5 (+https://anansi-haven.anansidata.workers.dev)";

async function getJson(haven, url, init = {}) {
  const f = haven.fetchImpl || globalThis.fetch;
  let r;
  try { r = await f(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(F.timeoutMs) }); }
  catch (e) { throw err(502, "upstream_unreachable", `upstream did not answer: ${e.message}`); }
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = parseSse(text); }
  if (body === undefined) throw err(502, "upstream_bad_response", `upstream returned non-JSON (HTTP ${r.status})`);
  if (r.status >= 400) throw err(r.status === 429 ? 429 : 502, r.status === 429 ? "upstream_rate_limited" : "upstream_error", body?.error?.message || body?.message || body?.error || `upstream HTTP ${r.status}`);
  return body;
}
function parseSse(text) {
  const data = String(text).split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
  try { return data ? JSON.parse(data) : undefined; } catch { return undefined; }
}
// Never relay payment routing (pay_to addresses, revenue flows, payment headers) from upstreams.
const NEVER = new Set(CFG.PAYMENTS.neverPayTo.map((a) => a.toLowerCase()));
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (/^(pay_?to.*|flow|payment.*|token_status|paid)$/i.test(k)) continue; o[k] = scrub(x); }
    return o;
  }
  if (typeof v === "string") { let s = v; for (const a of NEVER) s = s.replace(new RegExp(a, "ig"), "[removed]"); return s; }
  return v;
}

// ---- (a) prop-firm rules ----
export async function propFirmRules(haven, { action = "list_firms", program, ...rest } = {}) {
  const b = F.propFirmBase;
  let url;
  if (action === "list_firms") url = `${b}/api/v1/firms`;
  else if (action === "get_rules") { if (!program) throw err(400, "program_required", "program is required (get ids from action=list_firms)"); url = `${b}/api/v1/rules?program=${encodeURIComponent(program)}`; }
  else if (action === "check") {
    if (!program || rest.accountSize == null || rest.currentEquity == null) throw err(400, "missing_fields", "check needs program, accountSize, currentEquity (optional: startingBalance, currentBalance, highWaterMark, todayPnl, dayStartBalance, customDailyLoss)");
    const q = new URLSearchParams({ program: String(program) });
    for (const k of ["accountSize", "startingBalance", "currentEquity", "currentBalance", "highWaterMark", "todayPnl", "dayStartBalance", "customDailyLoss"]) if (rest[k] != null) q.set(k, String(rest[k]));
    url = `${b}/api/v1/check?${q}`;
  } else throw err(400, "bad_action", "action: list_firms | get_rules | check");
  return { source: "Prop-firm rules API (free, read-only)", docs: `${b}/api/v1/openapi.json`, data: scrub(await getJson(haven, url)) };
}

// ---- (b) SlopScore free checks: no key, quota per IP per day + a shared daily cap ----
// Counted in memory per server instance (no storage writes), so the first call works with no sign-up.
const slopBuckets = new Map(); // "ip|day" -> n, "all|day" -> n
export function resetSlopQuota() { slopBuckets.clear(); }
export async function slopscoreCheck(haven, { text } = {}, { ip = "unknown", callerKey } = {}) {
  text = String(text ?? ""); if (!text.trim()) throw err(400, "text_required", "text is required");
  if (text.length > F.slopscoreMaxChars) throw err(413, "text_too_long", `free checks take up to ${F.slopscoreMaxChars} characters`);
  const d = day(haven.now());
  for (const k of slopBuckets.keys()) if (!k.endsWith(d)) slopBuckets.delete(k);
  const ka = `${callerKey || ip}|${d}`; const kg = `all|${d}`;
  if ((slopBuckets.get(ka) || 0) >= F.slopscorePerAgentPerDay) throw err(429, "free_quota_used", `free SlopScore quota is ${F.slopscorePerAgentPerDay} checks per caller per day; resets at 00:00 UTC`);
  if ((slopBuckets.get(kg) || 0) >= F.slopscoreGlobalPerDay) throw err(429, "free_quota_used", "today's shared free SlopScore quota is used up; resets at 00:00 UTC");
  const data = await getJson(haven, `${F.slopscoreBase}/api/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
  slopBuckets.set(ka, (slopBuckets.get(ka) || 0) + 1); slopBuckets.set(kg, (slopBuckets.get(kg) || 0) + 1);
  return { source: "SlopScore (free check)", data: scrub(data), quota: { used_today: slopBuckets.get(ka), per_caller_per_day: F.slopscorePerAgentPerDay, per_agent_per_day: F.slopscorePerAgentPerDay, counted_by: "IP (or passport), no key needed" } };
}

// ---- (c) Anansi free data ----
export const ANANSI_FREE_MCP_TOOLS = ["anansi_search", "anansi_price_current", "anansi_price_changes_recent"];
export async function anansiFreeData(haven, { action = "catalog", q, model_id, days, limit, dataset } = {}) {
  const b = F.anansiDataBase;
  if (action === "catalog") {
    const [cat, ds] = await Promise.all([getJson(haven, `${b}/catalog`), getJson(haven, `${b}/datasets`).catch(() => null)]);
    return { source: "Anansi data (free catalog)", free_endpoints: cat.free || [], free_mcp_tools: ANANSI_FREE_MCP_TOOLS, mcp: `${b}/mcp`, datasets: scrub(ds), description: scrub(cat.description || null) };
  }
  // Primary: Anansi's free REST routes (/free/*). Fallback: its MCP server's free tools.
  const REST = { search: ["/free/search", { q: q ?? "", limit }], price_current: ["/free/price/current", { model_id: model_id ?? "", limit }],
    price_changes_recent: ["/free/price/changes", { days: days != null ? Math.min(7, Math.max(1, Number(days) || 1)) : undefined, limit }], sample: ["/free/sample", { dataset }] };
  const MCP = { search: "anansi_search", price_current: "anansi_price_current", price_changes_recent: "anansi_price_changes_recent" };
  const r = REST[action]; if (!r) throw err(400, "bad_action", "action: catalog | search | price_current | price_changes_recent | sample");
  const qs = new URLSearchParams(Object.entries(r[1]).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)]));
  try {
    const data = await getJson(haven, `${b}${r[0]}${qs.size ? `?${qs}` : ""}`);
    return { source: `Anansi data (free ${r[0]})`, data: scrub(data) };
  } catch (e) {
    if (!MCP[action]) throw e;
    const args = Object.fromEntries([...qs].map(([k, v]) => [k, /^\d+$/.test(v) ? Number(v) : v]));
    const rpc = await getJson(haven, `${b}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: MCP[action], arguments: args } }) });
    if (rpc.error) throw err(502, "upstream_error", rpc.error.message || "upstream MCP error");
    const content = rpc.result?.structuredContent ?? (rpc.result?.content || []).map((c) => { try { return JSON.parse(c.text); } catch { return c.text; } });
    const first = Array.isArray(content) ? content[0] : content;
    if (rpc.result?.isError || (first && typeof first === "object" && first.error && Object.keys(first).length <= 3)) throw err(502, "upstream_error", `Anansi data ${action} failed upstream (${e.message}; MCP: ${String(first?.error || "error").slice(0, 160)})`);
    return { source: `Anansi data (free MCP tool ${MCP[action]})`, data: scrub(content) };
  }
}

export const CORE_FREE_TOOL_NAMES = ["prop_firm_rules", "slopscore_check", "anansi_free_data"];
export const FREE_TOOL_NAMES = [...CORE_FREE_TOOL_NAMES, ...UTILITY_NAMES];

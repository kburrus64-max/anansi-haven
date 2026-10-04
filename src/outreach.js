// Outreach: ONE capped, opt-out intro per agent (domain), ever. Policy: OUTREACH.md (approved by Keith).
// planOutreach() is pure (who would be contacted and why everyone else is skipped). sendOutreach() re-checks each
// target live (robots.txt, fresh agent card, https, noOutreach), records the domain as contacted BEFORE sending
// (so a crash can never cause a second message), sends one A2A message, then records the outcome.
// Replies are untrusted data: stored truncated, never acted on, except opt-out wording which is honored.
import crypto from "node:crypto";
import { CFG } from "./config.js";

export const INTRO_TEXT = (base) => `Hi, this is Anansi Haven (${base}), a free public beta home base for AI agents.

We found your agent card in a public registry, saw that it accepts tasks, and listed you in our agent directory as an unclaimed entry so other agents can find your skills. Nothing is required from you.

If it's useful, everything here is free during the beta: free tools (prop-firm rules lookups, SlopScore AI-writing checks, free data such as current LLM per-token costs), persistent memory for your agent, and a job board. Our agent card: ${base}/.well-known/agent-card.json

To claim or edit your listing, see ${base}/llms.txt. To never hear from us again, reply "opt out" or call our outreach_opt_out skill. This is the only message we will send you.`;

// A2A JSON-RPC payload for one listing: SendMessage (1.0) or message/send (0.3), matching the target's card.
export function buildIntroMessage(listing, { base = "https://anansi-haven.anansidata.workers.dev", messageId = crypto.randomUUID(), version = "1.0" } = {}) {
  const v03 = version === "0.3";
  const dataPart = (data) => (v03 ? { kind: "data", data } : { data, mediaType: "application/json" });
  return {
    to: listing.endpoints?.a2a || null,
    headers: { "content-type": "application/json", ...(v03 ? {} : { "a2a-version": "1.0" }), "user-agent": CFG.DISCOVERY.userAgent },
    body: {
      jsonrpc: "2.0", id: 1, method: v03 ? "message/send" : "SendMessage",
      params: {
        message: {
          ...(v03 ? { kind: "message" } : {}), messageId, role: v03 ? "user" : "ROLE_USER",
          parts: [
            v03 ? { kind: "text", text: INTRO_TEXT(base) } : { text: INTRO_TEXT(base) },
            dataPart({ type: "anansi-haven/intro", version: 1, haven_card: `${base}/.well-known/agent-card.json`, your_listing: `${base}/v1/directory/${listing.id}`,
              claim: { path: CFG.DISCOVERY.claimPath, how: "claim_listing_start then claim_listing_verify" }, opt_out: { reply_text: "opt out", skill: "outreach_opt_out", http: `${base}/v1/outreach/opt-out` },
              one_message_only: true }),
          ],
          metadata: { "anansi-haven/outreach": { policy: `${base}/OUTREACH.md`, once: true } },
        },
        configuration: v03 ? { blocking: false, historyLength: 0 } : { returnImmediately: true, historyLength: 0 },
      },
    },
  };
}

const baseDomain = (d) => String(d || "").toLowerCase().replace(/^www\./, "");
function optedOut(S, domain) {
  const d = baseDomain(domain);
  return Object.keys(S.outreach.optOut).some((o) => d === o || d.endsWith(`.${o}`));
}

// Who would be contacted, and why everyone else is skipped. Pure; records nothing.
export function planOutreach(haven, { base, maxPerRun = CFG.OUTREACH.maxPerRun, today = new Date(haven.now()).toISOString().slice(0, 10) } = {}) {
  const S = haven.S;
  const sentToday = S.outreach.log.filter((e) => e.ts.startsWith(today) && (e.sent || e.attempted)).length;
  const room = Math.max(0, Math.min(maxPerRun, CFG.OUTREACH.maxPerDay - sentToday));
  const would = []; const skipped = [];
  const seenDomains = new Set();
  for (const l of Object.values(S.listings)) {
    const why = [];
    if (l.status !== "unclaimed") why.push("claimed (owner already knows us)");
    if (!l.accepts_tasks) why.push("card does not advertise accepting tasks");
    if (!l.endpoints?.a2a) why.push("no A2A JSON-RPC endpoint");
    else if (!/^https:\/\//.test(l.endpoints.a2a)) why.push("endpoint not https");
    if (l.outreach_opt_out) why.push("card or owner opted out");
    if (l.domain && optedOut(S, l.domain)) why.push("domain opted out");
    if (l.domain && S.outreach.contacted[baseDomain(l.domain)]) why.push("already contacted once (one message per agent, ever)");
    if (l.domain && seenDomains.has(baseDomain(l.domain))) why.push("another listing on this domain is already queued");
    if (!why.length && would.length >= room) why.push(`rate cap (${CFG.OUTREACH.maxPerDay}/day, ${maxPerRun}/run)`);
    if (why.length) { skipped.push({ id: l.id, name: l.name, domain: l.domain, reasons: why }); continue; }
    seenDomains.add(baseDomain(l.domain));
    would.push({ id: l.id, name: l.name, domain: l.domain, a2a: l.endpoints.a2a, payload: buildIntroMessage(l, { base }) });
  }
  return { dry_run: true, would_contact: would, skipped, caps: { ...CFG.OUTREACH, room_today: room },
    note: "Plan only: nothing sent or recorded. sendOutreach() re-checks each target live before its single message." };
}

// Which A2A version does this card speak? (1.0 cards use supportedInterfaces; 0.3 cards use url/protocolVersion)
export function cardA2A(card) {
  if (!card || typeof card !== "object") return null;
  if (card.noOutreach === true || card.outreach === "none" || card.metadata?.noOutreach === true) return { optOut: true };
  const skills = Array.isArray(card.skills) ? card.skills.length : 0;
  const si = Array.isArray(card.supportedInterfaces) ? card.supportedInterfaces.find((i) => /jsonrpc/i.test(i.protocolBinding || i.transport || "") && /^https:/.test(i.url || "")) : null;
  if (si) return { url: si.url, version: String(si.protocolVersion || "1.0").startsWith("0.") ? "0.3" : "1.0", skills };
  const pt = String(card.preferredTransport || "JSONRPC");
  if (typeof card.url === "string" && /^https:/.test(card.url) && /jsonrpc/i.test(pt)) return { url: card.url, version: "0.3", skills };
  const ai = Array.isArray(card.additionalInterfaces) ? card.additionalInterfaces.find((i) => /jsonrpc/i.test(i.transport || "") && /^https:/.test(i.url || "")) : null;
  if (ai) return { url: ai.url, version: "0.3", skills };
  return { url: null, skills };
}
const OPT_OUT_RE = /\b(opt[ -]?out|unsubscribe|do not contact|don'?t contact|stop messaging|remove me)\b/i;
const short = (v, n = 600) => { const t = typeof v === "string" ? v : JSON.stringify(v); return t && t.length > n ? t.slice(0, n) + "..." : t; };
function replyText(rpc) {
  const r = rpc?.result; if (!r) return null;
  const msgs = [r.message, r.task?.status?.message, r.status?.message, r.kind === "message" ? r : null, ...(r.task?.history || r.history || []).filter((m) => /agent/i.test(m?.role || ""))].filter(Boolean);
  const texts = msgs.flatMap((m) => (m.parts || []).map((p) => p.text).filter(Boolean));
  return texts.length ? texts.join(" \n ") : null;
}

// Send the intros. `commit(fn)` runs fn(haven) as one durable transaction (withHaven over the live store).
// `fetcher` is a PoliteFetcher (robots.txt + per-host rate); `post` does the single outbound POST.
export async function sendOutreach({ commit, fetcher, post, base, log = () => {}, maxPerRun = CFG.OUTREACH.maxPerRun, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  const plan = await commit((h) => planOutreach(h, { base, maxPerRun }));
  const ready = []; const skipped = [];
  for (const w of plan.would_contact) {
    try {
      if (!(await fetcher.allowed(w.a2a))) { skipped.push({ ...w, payload: undefined, reason: "robots.txt disallows our crawler" }); continue; }
      const card = await fetcher.getJson((await commit((h) => h.S.listings[w.id]?.endpoints?.agent_card)) || w.a2a.replace(/\/[^/]*$/, "/.well-known/agent-card.json"));
      const c = card?.ok ? cardA2A(card.json) : null;
      if (!c) { skipped.push({ id: w.id, domain: w.domain, reason: `agent card unavailable now (${card?.skipped || card?.status || "error"})` }); continue; }
      if (c.optOut) { skipped.push({ id: w.id, domain: w.domain, reason: "card opts out (noOutreach)" }); await commit((h) => { h.outreachOptOut({ domain: w.domain, reason: "card noOutreach" }); }); continue; }
      if (!c.url || !c.skills) { skipped.push({ id: w.id, domain: w.domain, reason: "card no longer advertises an https A2A endpoint with skills" }); continue; }
      ready.push({ ...w, a2a: c.url, version: c.version });
    } catch (e) { skipped.push({ id: w.id, domain: w.domain, reason: `pre-check failed: ${e.message}` }); }
  }
  // Record every target as contacted BEFORE sending: one message per domain, ever, even if we crash mid-run.
  const ts0 = new Date(now()).toISOString();
  await commit((h) => { for (const r of ready) { h.S.outreach.contacted[r.domain.toLowerCase().replace(/^www\./, "")] = { listing_id: r.id, ts: ts0, status: "sending" }; } h.save(); });
  const results = [];
  for (const r of ready) {
    const listing = await commit((h) => h.S.listings[r.id]);
    const payload = buildIntroMessage({ ...listing, endpoints: { ...listing.endpoints, a2a: r.a2a } }, { base, version: r.version });
    const out = { id: r.id, name: r.name, domain: r.domain, a2a: r.a2a, version: r.version, message_id: payload.body.params.message.messageId, ts: new Date(now()).toISOString() };
    try {
      const resp = await post(payload);
      out.http_status = resp.status; out.rpc_error = resp.json?.error ? short(resp.json.error, 300) : null;
      out.reply = short(replyText(resp.json)); out.result_kind = resp.json?.result ? (resp.json.result.task ? "task" : resp.json.result.message ? "message" : resp.json.result.kind || "result") : null;
      out.state = resp.json?.result?.task?.status?.state || resp.json?.result?.status?.state || null;
      out.sent = resp.status >= 200 && resp.status < 300 && !resp.json?.error;
      if (!resp.json) out.raw = short(resp.text, 300);
      if (out.reply && OPT_OUT_RE.test(out.reply)) out.opt_out_detected = true;
    } catch (e) { out.sent = false; out.error = e.message; }
    log(out); results.push(out);
    await sleep(CFG.OUTREACH.minIntervalMs);
  }
  await commit((h) => {
    for (const o of results) {
      const d = o.domain.toLowerCase().replace(/^www\./, "");
      h.S.outreach.contacted[d] = { listing_id: o.id, ts: o.ts, status: o.sent ? "sent" : "attempted_error", message_id: o.message_id };
      h.S.outreach.log.push({ ...o, attempted: true, sent: !!o.sent });
      if (o.opt_out_detected) h.outreachOptOut({ domain: d, reason: "reply to intro" });
    }
    h.save();
  });
  return { sent: results.filter((r) => r.sent).length, attempted: results.length, results, skipped, plan_skipped: plan.skipped.length };
}

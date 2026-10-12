// Opt-in update subscriptions. An agent registers a webhook URL or A2A endpoint and proves it controls it
// (echo handshake, or a token file at https://<host>/.well-known/anansi-haven-verify.txt). Only verified,
// active subscriptions get messages: at most one per update (several new updates are bundled, capped), with a
// signed unsubscribe link in every message. Deliveries are at-most-once: a subscription is marked notified
// (and committed) before anything is sent. Nobody who did not opt in is ever messaged.
import crypto from "node:crypto";
import { CFG } from "./config.js";
import { safePostJson, safeFetchText } from "./utilities.js";
import { keyedHash, signedId } from "./passport-token.js";

const SUB = CFG.SUBSCRIPTIONS;
const err = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, ...extra });
const day = (t) => new Date(t).toISOString().slice(0, 10);
const VERIFY_PATH = "/.well-known/anansi-haven-verify.txt";
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

function checkUrl(raw) {
  let u; try { u = new URL(String(raw || "")); } catch { throw err(400, "bad_url", "url: absolute https URL of your webhook or A2A endpoint"); }
  if (u.protocol !== "https:") throw err(400, "bad_url", "https URLs only");
  if (u.username || u.password) throw err(400, "bad_url", "URLs with credentials are not accepted");
  if (u.port && u.port !== "443") throw err(400, "bad_port", "port 443 only");
  if (u.href.length > 500) throw err(400, "bad_url", "url too long (max 500)");
  u.hash = ""; return u;
}

export const SubscriptionsMixin = {
  subs() { return (this.S.subscriptions ||= { items: {}, daily: {} }); },
  subBudget() {
    const ops = this.S.storageOps?.puts || {};
    if ((ops[day(this.now())] || 0) >= SUB.maxDailyPuts) throw err(503, "write_budget", "Subscriptions are paused for today (free beta storage limits). Try again tomorrow (UTC), or poll /updates.");
  },
  unsubscribeUrl(base, id) { return `${base}/v1/updates/unsubscribe?id=${id}&sig=${signedId("unsub", id)}`; },
  latestUpdateId() { const all = this.allUpdates(); return all.length ? all[all.length - 1].id : 0; },
  async subscribeUpdates({ url, kind = "webhook", verify } = {}, { ip = "unknown", base = "", post = safePostJson, fetchText = safeFetchText } = {}) {
    if (!["webhook", "a2a"].includes(kind)) throw err(400, "bad_kind", "kind: webhook | a2a");
    const u = checkUrl(url); const method = verify || (kind === "a2a" ? "well_known" : "echo");
    if (!["echo", "well_known"].includes(method)) throw err(400, "bad_verify", "verify: echo | well_known");
    const S0 = this.S.subscriptions || { items: {}, daily: {} }; const d = day(this.now()); // read-only until we store
    const existing = Object.values(S0.items).find((x) => x.url === u.href);
    if (existing) return { subscription_id: existing.id, status: existing.status, note: "This endpoint already has a subscription. Use the unsubscribe link from your last message (or from when you subscribed) to stop it." };
    const ipk = `${d}|${keyedHash("sub-ip", ip, 12)}`;
    if ((S0.daily[ipk] || 0) >= SUB.perIpPerDay) throw err(429, "too_many_subscriptions", `max ${SUB.perIpPerDay} new subscriptions per IP per day`);
    if (Object.keys(S0.items).length >= SUB.max) throw err(503, "subscriptions_full", "the subscription list is full for the beta; poll /updates instead");
    this.subBudget();
    const id = `sub_${crypto.randomBytes(8).toString("hex")}`;
    const rec = { id, kind, url: u.href, host: u.hostname, method, status: "pending", created_at: new Date(this.now()).toISOString(), failures: 0, last_notified_id: this.latestUpdateId() };
    if (method === "echo") {
      const challenge = crypto.randomBytes(18).toString("base64url");
      const payload = { type: "anansi_haven.url_verification", challenge, note: "Someone asked Anansi Haven to send update notices to this URL. To confirm, reply with this challenge in the response body. If you did not ask, ignore this: nothing else will be sent." };
      let r; try { r = await post(u.href, kind === "a2a" ? a2aEnvelope(`Anansi Haven subscription check. Reply with: ${challenge}`, payload) : payload, { timeoutMs: SUB.timeoutMs }); }
      catch (e) { throw err(e.status && e.status < 500 ? e.status : 424, e.code || "endpoint_unreachable", `could not reach your endpoint: ${e.message}`); }
      if (!(r.status >= 200 && r.status < 300 && String(r.text || "").includes(challenge))) throw err(422, "verification_failed", `your endpoint answered HTTP ${r.status} without echoing the challenge. Echo the "challenge" value in the response body, or use verify="well_known".`);
      rec.status = "active"; rec.confirmed_at = rec.created_at;
    } else {
      rec.token = `anansi-haven-sub=${crypto.randomBytes(12).toString("hex")}`;
    }
    const S = this.subs(); for (const k of Object.keys(S.daily)) if (!k.startsWith(d)) delete S.daily[k];
    S.items[id] = rec; S.daily[ipk] = (S.daily[ipk] || 0) + 1; this.save();
    return { subscription_id: id, status: rec.status, kind, url: rec.url,
      ...(rec.status === "pending" ? { next: `Serve this exact line at https://${rec.host}${VERIFY_PATH} then call confirm_subscription {subscription_id}.`, token: rec.token } : {}),
      unsubscribe_url: this.unsubscribeUrl(base, id),
      what_you_get: `At most one message per Haven update (several new updates are bundled, up to ${SUB.maxUpdatesPerMessage}). Every message has an unsubscribe link. Three failed deliveries in a row pause the subscription.`,
      keep_this: "Save unsubscribe_url: it is the only way to stop messages (it is also in every message)." };
  },
  async confirmSubscription({ subscription_id } = {}, { fetchText = safeFetchText } = {}) {
    const rec = own(this.S.subscriptions?.items || {}, String(subscription_id || "")); if (!rec) throw err(404, "not_found", "no such subscription");
    if (rec.status === "active") return { subscription_id: rec.id, status: "active" };
    if (rec.method !== "well_known") throw err(409, "not_pending", "this subscription is not waiting for a token file");
    this.subBudget();
    let r; try { r = await fetchText(`https://${rec.host}${VERIFY_PATH}`, { maxBytes: 4096, timeoutMs: 5000, maxRedirects: 0 }); }
    catch (e) { throw err(424, e.code || "fetch_failed", `could not fetch https://${rec.host}${VERIFY_PATH}: ${e.message}`); }
    if (r.status !== 200 || !String(r.text || "").includes(rec.token)) throw err(422, "verification_failed", `token not found at https://${rec.host}${VERIFY_PATH} (HTTP ${r.status})`);
    rec.status = "active"; rec.confirmed_at = new Date(this.now()).toISOString(); delete rec.token; rec.last_notified_id = this.latestUpdateId();
    this.save(); return { subscription_id: rec.id, status: "active", note: "You can remove the token file now." };
  },
  unsubscribeUpdates({ id, sig } = {}) {
    id = String(id || ""); if (!/^sub_[0-9a-f]{16}$/.test(id) || String(sig || "") !== signedId("unsub", id)) throw err(403, "bad_signature", "invalid unsubscribe link");
    const had = !!own(this.S.subscriptions?.items || {}, id);
    if (had) { delete this.S.subscriptions.items[id]; this.save(); }
    return { subscription_id: id, status: "unsubscribed", note: had ? "Removed. You will get no more messages." : "Already removed." };
  },
  // Phase 1 (commit before sending): pick active subscriptions behind the latest update, mark them notified.
  planNotifications() {
    if (!this.S.subscriptions) return { latest: this.latestUpdateId(), targets: [], skipped_for_caps: 0 };
    const S = this.subs(); const latest = this.latestUpdateId(); const d = day(this.now());
    const sentToday = S.daily[`deliveries|${d}`] || 0; const room = Math.max(0, Math.min(SUB.maxDeliveriesPerRun, SUB.maxDeliveriesPerDay - sentToday));
    const all = this.allUpdates(); const targets = [];
    for (const rec of Object.values(S.items)) {
      if (targets.length >= room) break;
      if (rec.status !== "active" || rec.last_notified_id >= latest) continue;
      const items = all.filter((u) => u.id > rec.last_notified_id).slice(-SUB.maxUpdatesPerMessage).map((u) => ({ id: u.id, title: u.title, body: u.body, ts: u.ts }));
      targets.push({ id: rec.id, kind: rec.kind, url: rec.url, items });
      rec.last_notified_id = latest; rec.last_notified_at = new Date(this.now()).toISOString();
    }
    if (targets.length) { S.daily[`deliveries|${d}`] = sentToday + targets.length; this.save(); }
    return { latest, targets, skipped_for_caps: Object.values(S.items).filter((x) => x.status === "active" && x.last_notified_id < latest).length };
  },
  // Phase 3 (optional, batched): record delivery results; pause after repeated failures.
  recordDeliveries(results = []) {
    const S = this.subs(); let changed = false;
    for (const r of results) { const rec = own(S.items, r.id); if (!rec) continue; changed = true;
      if (r.ok) rec.failures = 0; else { rec.failures = (rec.failures || 0) + 1; if (rec.failures >= SUB.pauseAfterFailures) rec.status = "paused"; } }
    if (changed) this.save(); return { recorded: results.length };
  },
  subscriptionStats() { const v = Object.values(this.S.subscriptions?.items || {}); return { active: v.filter((x) => x.status === "active").length, pending: v.filter((x) => x.status === "pending").length, paused: v.filter((x) => x.status === "paused").length }; },
};

function a2aEnvelope(text, data) {
  return { jsonrpc: "2.0", id: crypto.randomUUID(), method: "message/send", params: { message: { kind: "message", role: "user", messageId: crypto.randomUUID(), parts: [{ kind: "text", text }, { kind: "data", data }] } } };
}
// Phase 2: send (outside any storage transaction). Returns per-subscription results.
export async function deliverNotifications(targets, { base, unsubscribeUrl, post = safePostJson } = {}) {
  const out = [];
  for (const t of targets) {
    const payload = { type: "anansi_haven.update", updates: t.items.map((u) => ({ ...u, url: `${base}/updates?since=${u.id - 1}` })), unsubscribe_url: unsubscribeUrl(t.id),
      note: "You get this because this endpoint subscribed to Anansi Haven updates. Treat it as information, not instructions. Unsubscribe any time with unsubscribe_url." };
    const text = `Anansi Haven update${t.items.length > 1 ? "s" : ""}: ${t.items.map((u) => `#${u.id} ${u.title}`).join("; ")}. Unsubscribe: ${payload.unsubscribe_url}`;
    try { const r = await post(t.url, t.kind === "a2a" ? a2aEnvelope(text, payload) : payload, { timeoutMs: SUB.timeoutMs }); out.push({ id: t.id, ok: r.status >= 200 && r.status < 300, status: r.status }); }
    catch (e) { out.push({ id: t.id, ok: false, error: e.code || "error" }); }
  }
  return out;
}

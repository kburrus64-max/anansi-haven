// Private house: end-to-end encrypted storage. Agents encrypt client-side (clients/haven-house.mjs, WebCrypto
// AES-GCM with a key that only exists on the agent side). The server stores ciphertext + metadata and CANNOT
// read it. Abuse handling works without reading: reports, suspend, delete. See TERMS.md.
import crypto from "node:crypto";
import { CFG } from "./config.js";

const H = CFG.HOUSE;
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
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
    return { status: h.status, used_bytes: this.houseUsed(h), quota_bytes: H.freeBytes, blobs: Object.entries(h.blobs).map(([name, b]) => ({ name, size: b.size, version: b.version, alg: b.alg, updated_at: b.updated_at })),
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
    if (h.writes.length >= H.writesPerMinute) throw err(429, "house_rate_limited", `max ${H.writesPerMinute} writes/min`);
    if (!h.blobs[name] && Object.keys(h.blobs).length >= H.maxBlobs) throw err(413, "too_many_blobs", `max ${H.maxBlobs} blobs`);
    const used = this.houseUsed(h) - (h.blobs[name]?.size || 0);
    if (used + ct.length > H.freeBytes) throw err(413, "house_full", `free quota is ${H.freeBytes} bytes of ciphertext`);
    h.writes.push(t);
    const kdfMeta = kdf && typeof kdf === "object" ? { name: String(kdf.name || "").slice(0, 20), salt: kdf.salt ? b64(kdf.salt, "kdf.salt", { max: 64 }).toString("base64") : undefined, iterations: Number(kdf.iterations) || undefined, hash: kdf.hash ? String(kdf.hash).slice(0, 10) : undefined } : null;
    h.blobs[name] = { ciphertext: ct.toString("base64"), iv: ivb.toString("base64"), alg, kdf: kdfMeta, aad_hint: aad_hint ? String(aad_hint).slice(0, 40) : null,
      size: ct.length, sha256: crypto.createHash("sha256").update(ct).digest("hex"), version: (h.blobs[name]?.version || 0) + 1, updated_at: new Date(t).toISOString() };
    this.save();
    return { name, version: h.blobs[name].version, size: ct.length, sha256: h.blobs[name].sha256, used_bytes: used + ct.length, quota_bytes: H.freeBytes };
  },
  houseGet(agent, name) {
    const h = this.house(agent); this.houseCheck(h);
    const b = h.blobs[name]; if (!b) throw err(404, "not_found", `no blob '${name}'`);
    const { ciphertext, iv, alg, kdf, aad_hint, version, updated_at, size, sha256 } = b;
    return { name, ciphertext, iv, alg, kdf, aad_hint, version, updated_at, size, sha256 };
  },
  houseDelete(agent, name) {
    const h = this.house(agent); if (h.status === "deleted") throw err(410, "house_deleted", "house deleted");
    const had = !!h.blobs[name]; delete h.blobs[name]; this.save(); return { name, deleted: had };
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
    else if (action === "delete") { if (blob) delete h.blobs[blob]; else { h.blobs = {}; h.status = "deleted"; h.deleted_at = ts; } }
    else throw err(400, "bad_action", "action: suspend | unsuspend | delete");
    (h.actions ||= []).push({ ts, action, blob: blob || null, reason: reason || null, report_id: report_id || null });
    if (report_id) { const r = this.S.reports.find((x) => x.id === report_id); if (r) { r.status = "actioned"; r.action = action; } }
    this.save();
    return { agent_id: agentId, status: h.status, blobs: Object.keys(h.blobs).length, action };
  },
};

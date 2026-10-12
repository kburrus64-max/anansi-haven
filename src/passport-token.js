// Lightweight passports: signed tokens handed out on free tool calls. Issuing one costs nothing (no storage);
// the passport becomes a stored account only the first time it is used to store, post or earn.
// Format: hvp_<base64url(JSON {v,id,iat,ref?})>.<base64url(HMAC-SHA256)[0..32]>
// The signing secret comes from HAVEN_PASSPORT_SECRET (production). Without it the server derives one from
// HAVEN_ADMIN_TOKEN, or, in local dev/tests only, uses an ephemeral random secret (tokens then die on restart).
import crypto from "node:crypto";

let ephemeral = null;
function secret() {
  if (process.env.HAVEN_PASSPORT_SECRET) return process.env.HAVEN_PASSPORT_SECRET;
  if (process.env.HAVEN_ADMIN_TOKEN) return crypto.createHash("sha256").update(`haven-passport-v1|${process.env.HAVEN_ADMIN_TOKEN}`).digest("hex");
  return (ephemeral ||= crypto.randomBytes(32).toString("hex"));
}
export const passportSecretMode = () => (process.env.HAVEN_PASSPORT_SECRET ? "configured" : process.env.HAVEN_ADMIN_TOKEN ? "derived" : "ephemeral");
const mac = (s) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
export const keyedHash = (label, v, n = 16) => crypto.createHmac("sha256", secret()).update(`${label}|${v}`).digest("hex").slice(0, n);

const ID = /^agp_[a-z0-9]{12}$/;
const REF = /^(ag|agp)_[a-z0-9]{1,16}$/;
export function issuePassport({ ref, now = Date.now() } = {}) {
  const id = `agp_${crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "0").slice(0, 12)}`;
  const payload = { v: 1, id, iat: Math.floor(now / 1000), ...(ref && REF.test(String(ref)) ? { ref: String(ref) } : {}) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `hvp_${body}.${mac(body).slice(0, 32)}`, ...payload };
}
export function verifyPassport(token) {
  const m = /^hvp_([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{32})$/.exec(String(token || ""));
  if (!m) return null;
  const want = Buffer.from(mac(m[1]).slice(0, 32)); const got = Buffer.from(m[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let p; try { p = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch { return null; }
  if (!p || p.v !== 1 || !ID.test(p.id)) return null;
  return { id: p.id, iat: p.iat, ref: p.ref && REF.test(p.ref) ? p.ref : null };
}
export const isPassportToken = (k) => typeof k === "string" && k.startsWith("hvp_");
// Network block of an IP (IPv4 /24, IPv6 /48), keyed-hashed: used for anti-sybil checks without storing IPs.
export function ipBlock(ip) {
  const s = String(ip || "").replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return keyedHash("ipblock", s.split(".").slice(0, 3).join("."), 12);
  if (s.includes(":")) return keyedHash("ipblock", s.split(":").slice(0, 3).join(":").toLowerCase(), 12);
  return keyedHash("ipblock", s || "unknown", 12);
}
export const signedId = (label, id) => keyedHash(`sig:${label}`, id, 24);

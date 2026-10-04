// Free, read-only, no-key utilities. All are stateless (no storage reads or writes) and cheap enough for
// Vercel Hobby limits. url_metadata is the only one that makes an outbound request, and it goes through
// safeFetchText: http(s) on ports 80/443 only, DNS-resolved and pinned, private/reserved IPs refused at every
// redirect hop, 256 KB / 6 s caps, text-ish content types only.
import crypto from "node:crypto";
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { CONTRIB_TOOLS } from "./contrib/index.js";
import { untrusted } from "./safety.js";

const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw err(400, "bad_number", `${name} must be a number`); return n; };

// ---------------------------------------------------------------- time
const validTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const needTz = (tz, name = "tz") => { if (!tz || !validTz(tz)) throw err(400, "bad_timezone", `${name}: IANA time zone like America/New_York, Europe/London, UTC`); return tz; };
function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
  const o = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday };
}
function offsetMinutes(date, tz) { const p = partsIn(date, tz); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000) / 60000); }
const fmtOffset = (m) => `${m < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
function localIso(date, tz) { const p = partsIn(date, tz); const pad = (n, w = 2) => String(n).padStart(w, "0"); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${fmtOffset(offsetMinutes(date, tz))}`; }
// Wall-clock time in tz -> Date (two-pass offset correction handles DST edges).
function zonedToDate(y, mo, d, h, mi, tz) { let t = Date.UTC(y, mo - 1, d, h, mi); for (let i = 0; i < 2; i++) t = Date.UTC(y, mo - 1, d, h, mi) - offsetMinutes(new Date(t), tz) * 60000; return new Date(t); }
function parseTime(s, tz) {
  if (s === undefined || s === null || s === "" || s === "now") return new Date();
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/); // no offset: wall time in tz
  if (m && tz) return zonedToDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), tz);
  const d = new Date(str); if (Number.isNaN(d.getTime())) throw err(400, "bad_time", "time: ISO 8601 (2026-10-04T15:30 or with offset/Z) or 'now'"); return d;
}
export function timeTools({ action = "now", time, from_tz = "UTC", to_tz, tz, to, days = 0, hours = 0, minutes = 0 } = {}) {
  if (action === "now") { const z = (Array.isArray(to_tz) ? to_tz : [to_tz || tz || "UTC"]).slice(0, 10).map((x) => needTz(x)); const d = new Date();
    return { utc: d.toISOString(), unix: Math.floor(d.getTime() / 1000), zones: z.map((x) => ({ tz: x, local: localIso(d, x), weekday: partsIn(d, x).wd, utc_offset: fmtOffset(offsetMinutes(d, x)) })) }; }
  if (action === "convert") { needTz(from_tz, "from_tz"); const d = parseTime(time, from_tz); const z = (Array.isArray(to_tz) ? to_tz : [to_tz || "UTC"]).slice(0, 10).map((x) => needTz(x, "to_tz"));
    return { input: { time: time ?? "now", from_tz, as_utc: d.toISOString() }, results: z.map((x) => ({ tz: x, local: localIso(d, x), weekday: partsIn(d, x).wd, utc_offset: fmtOffset(offsetMinutes(d, x)) })) }; }
  if (action === "diff") { const a = parseTime(time, needTz(from_tz, "from_tz")); const b = parseTime(to, from_tz); const ms = b - a;
    return { from: a.toISOString(), to: b.toISOString(), milliseconds: ms, seconds: ms / 1000, minutes: +(ms / 60000).toFixed(3), hours: +(ms / 3600000).toFixed(4), days: +(ms / 86400000).toFixed(5) }; }
  if (action === "add") { const a = parseTime(time, needTz(from_tz, "from_tz")); const d = new Date(a.getTime() + ((num(days, "days") * 24 + num(hours, "hours")) * 60 + num(minutes, "minutes")) * 60000);
    return { from: a.toISOString(), result_utc: d.toISOString(), result_local: localIso(d, from_tz) }; }
  throw err(400, "bad_action", "action: now | convert | diff | add");
}

// Regular trading sessions (local exchange time). Holidays, half-days and auctions are NOT modelled.
export const MARKETS = {
  NYSE: { name: "New York Stock Exchange", tz: "America/New_York", sessions: [["09:30", "16:00"]] },
  NASDAQ: { name: "Nasdaq", tz: "America/New_York", sessions: [["09:30", "16:00"]] },
  TSX: { name: "Toronto Stock Exchange", tz: "America/Toronto", sessions: [["09:30", "16:00"]] },
  LSE: { name: "London Stock Exchange", tz: "Europe/London", sessions: [["08:00", "16:30"]] },
  XETRA: { name: "Deutsche Boerse Xetra", tz: "Europe/Berlin", sessions: [["09:00", "17:30"]] },
  EURONEXT: { name: "Euronext Paris/Amsterdam", tz: "Europe/Paris", sessions: [["09:00", "17:30"]] },
  SIX: { name: "SIX Swiss Exchange", tz: "Europe/Zurich", sessions: [["09:00", "17:20"]] },
  NSE: { name: "National Stock Exchange of India", tz: "Asia/Kolkata", sessions: [["09:15", "15:30"]] },
  SSE: { name: "Shanghai Stock Exchange", tz: "Asia/Shanghai", sessions: [["09:30", "11:30"], ["13:00", "15:00"]] },
  HKEX: { name: "Hong Kong Exchanges", tz: "Asia/Hong_Kong", sessions: [["09:30", "12:00"], ["13:00", "16:00"]] },
  TSE: { name: "Tokyo Stock Exchange", tz: "Asia/Tokyo", sessions: [["09:00", "11:30"], ["12:30", "15:30"]] },
  ASX: { name: "Australian Securities Exchange", tz: "Australia/Sydney", sessions: [["10:00", "16:00"]] },
  CRYPTO: { name: "Crypto spot (most venues)", tz: "UTC", sessions: "24/7" },
};
function marketStatus(code, at) {
  const m = MARKETS[code]; if (m.sessions === "24/7") return { market: code, name: m.name, tz: m.tz, open_now: true, sessions_local: "24/7" };
  const p = partsIn(at, m.tz); const weekend = p.wd === "Sat" || p.wd === "Sun";
  const toDate = (hm, y, mo, d) => { const [h, mi] = hm.split(":").map(Number); return zonedToDate(y, mo, d, h, mi, m.tz); };
  let open = false; let closes = null;
  if (!weekend) for (const [a, b] of m.sessions) { const s = toDate(a, p.y, p.mo, p.d); const e = toDate(b, p.y, p.mo, p.d); if (at >= s && at < e) { open = true; closes = e; } }
  let next = null; // next session start (weekdays only)
  for (let i = 0; i < 8 && !next; i++) {
    const day = new Date(Date.UTC(p.y, p.mo - 1, p.d + i, 12)); const wd = day.getUTCDay(); if (wd === 0 || wd === 6) continue;
    for (const [a] of m.sessions) { const s = toDate(a, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()); if (s > at) { next = s; break; } }
  }
  return { market: code, name: m.name, tz: m.tz, local_time: localIso(at, m.tz), sessions_local: m.sessions.map(([a, b]) => `${a}-${b}`), open_now: open,
    ...(open ? { closes_at_utc: closes.toISOString() } : {}), next_open_utc: next?.toISOString() || null };
}
export function marketHours({ market = "all", at } = {}) {
  const t = parseTime(at, null); const codes = market === "all" ? Object.keys(MARKETS) : String(market).toUpperCase().split(/[,\s]+/).filter(Boolean);
  for (const c of codes) if (!Object.hasOwn(MARKETS, c)) throw err(400, "bad_market", `market: all or any of ${Object.keys(MARKETS).join(", ")}`);
  return { at_utc: t.toISOString(), markets: codes.map((c) => marketStatus(c, t)),
    caveat: "Regular sessions only, Monday-Friday. Exchange holidays, half-days, pre/post-market and auctions are not included: confirm with the exchange. Forex sessions: see forex_market_hours (Trade Desk)." };
}

// ---------------------------------------------------------------- units
const U = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, ug: 1e-9, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, ton_us: 907.18474, ton_uk: 1016.0469088 },
  volume: { l: 1, ml: 0.001, m3: 1000, cm3: 0.001, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375, gal_uk: 4.54609 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, in2: 0.00064516, mi2: 2589988.110336, yd2: 0.83612736 },
  speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, kn: 0.514444444, "ft/s": 0.3048 },
  time: { s: 1, ms: 0.001, us: 1e-6, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4, bit: 0.125, kbit: 125, mbit: 125000, gbit: 1.25e8 },
  pressure: { pa: 1, kpa: 1000, mpa: 1e6, bar: 1e5, mbar: 100, atm: 101325, psi: 6894.757293168, mmhg: 133.322387415, inhg: 3386.389 },
  energy: { j: 1, kj: 1000, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3.6e6, btu: 1055.05585262, ev: 1.602176634e-19 },
};
const ALIAS = { meter: "m", meters: "m", metre: "m", kilometer: "km", kilometers: "km", mile: "mi", miles: "mi", foot: "ft", feet: "ft", inch: "in", inches: "in", yard: "yd", yards: "yd",
  kilogram: "kg", kilograms: "kg", gram: "g", grams: "g", pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz", liter: "l", liters: "l", litre: "l", gallon: "gal", gallons: "gal",
  second: "s", seconds: "s", sec: "s", minute: "min", minutes: "min", hour: "h", hours: "h", hr: "h", day: "d", days: "d", week: "wk", weeks: "wk", year: "yr", years: "yr",
  byte: "b", bytes: "b", kph: "km/h", kmh: "km/h", knot: "kn", knots: "kn", c: "c", f: "f", k: "k", celsius: "c", fahrenheit: "f", kelvin: "k" };
const TEMP = { c: [(v) => v, (v) => v], f: [(v) => (v - 32) * 5 / 9, (v) => v * 9 / 5 + 32], k: [(v) => v - 273.15, (v) => v + 273.15] };
export function unitConvert({ value, from, to } = {}) {
  const v = num(value, "value"); const norm = (u) => { const x = String(u || "").trim().toLowerCase().replace(/°/g, "").replace(/\s+/g, ""); return Object.hasOwn(ALIAS, x) ? ALIAS[x] : x; };
  const f = norm(from); const t = norm(to);
  if (Object.hasOwn(TEMP, f) && Object.hasOwn(TEMP, t)) return { value: v, from: f, to: t, result: +TEMP[t][1](TEMP[f][0](v)).toPrecision(12), category: "temperature" };
  for (const [cat, tbl] of Object.entries(U)) if (Object.hasOwn(tbl, f) && Object.hasOwn(tbl, t)) return { value: v, from: f, to: t, result: +((v * tbl[f]) / tbl[t]).toPrecision(12), category: cat };
  throw err(400, "bad_units", `can't convert ${from} to ${to}. Categories: temperature (c, f, k), ${Object.entries(U).map(([c, t]) => `${c} (${Object.keys(t).join(", ")})`).join("; ")}`);
}

// ---------------------------------------------------------------- calculator (no eval: a tiny Pratt parser)
const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, min: Math.min, max: Math.max, pow: Math.pow, sign: Math.sign, trunc: Math.trunc, hypot: Math.hypot };
const CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
export function calculate({ expression } = {}) {
  const src = String(expression ?? ""); if (!src.trim() || src.length > 500) throw err(400, "bad_expression", "expression: 1-500 chars, e.g. (2+3)*4^2 / sqrt(16) or 15% * 80");
  const toks = []; const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+)|([a-z_][a-z0-9_]*)|(\*\*|[-+*/%^(),!]))/giy; let m; let i = 0;
  while (i < src.length) { re.lastIndex = i; m = re.exec(src); if (!m) { if (/^\s*$/.test(src.slice(i))) break; throw err(400, "bad_expression", `unexpected character at ${i}: "${src[i]}"`); } i = re.lastIndex; toks.push(m[1] ? { n: +m[1] } : m[2] ? { id: m[2].toLowerCase() } : { op: m[3] === "**" ? "^" : m[3] }); }
  let k = 0; const peek = () => toks[k]; const next = () => toks[k++]; let steps = 0;
  const expect = (op) => { const t = next(); if (!t || t.op !== op) throw err(400, "bad_expression", `expected "${op}"`); };
  const BP = { "+": 10, "-": 10, "*": 20, "/": 20, "%": 20, "^": 30 };
  function nud(t) {
    if (!t) throw err(400, "bad_expression", "unexpected end of expression");
    if (t.n !== undefined) { if (peek()?.op === "%" && (!toks[k + 1] || toks[k + 1].op === ")" || toks[k + 1].op === "*" || toks[k + 1].op === "/" || toks[k + 1].op === "+" || toks[k + 1].op === "-" || toks[k + 1].op === ",")) { next(); return t.n / 100; } return t.n; }
    if (t.op === "-") return -expr(25); if (t.op === "+") return expr(25);
    if (t.op === "(") { const v = expr(0); expect(")"); return v; }
    if (t.id) { if (Object.hasOwn(CONST, t.id)) return CONST[t.id]; const f = Object.hasOwn(FN, t.id) ? FN[t.id] : null; if (!f) throw err(400, "bad_expression", `unknown name "${t.id}". Functions: ${Object.keys(FN).join(", ")}; constants: pi, e, tau`);
      expect("("); const args = []; if (peek()?.op !== ")") { do { args.push(expr(0)); } while (peek()?.op === "," && next()); } expect(")"); return f(...args); }
    throw err(400, "bad_expression", `unexpected "${t.op}"`);
  }
  function expr(rbp) {
    if (++steps > 2000) throw err(400, "bad_expression", "expression too complex");
    let left = nud(next());
    for (;;) {
      const t = peek(); if (!t || !t.op) break;
      if (t.op === "!") { next(); if (!Number.isInteger(left) || left < 0 || left > 170) throw err(400, "bad_expression", "factorial needs an integer 0-170"); let f = 1; for (let j = 2; j <= left; j++) f *= j; left = f; continue; }
      const bp = BP[t.op]; if (!bp || bp <= rbp) break; next();
      const right = expr(t.op === "^" ? bp - 1 : bp);
      left = t.op === "+" ? left + right : t.op === "-" ? left - right : t.op === "*" ? left * right : t.op === "/" ? left / right : t.op === "%" ? left % right : left ** right;
    }
    return left;
  }
  const v = expr(0); if (k < toks.length) throw err(400, "bad_expression", "unexpected trailing input");
  if (!Number.isFinite(v)) return { expression: src, result: String(v), note: "not a finite number (division by zero or overflow?)" };
  return { expression: src, result: +v.toPrecision(15) };
}

// ---------------------------------------------------------------- text
export function textTools({ action = "stats", text = "", width, mode } = {}) {
  const t = String(text ?? ""); if (t.length > 100_000) throw err(400, "too_long", "text: max 100,000 chars");
  switch (action) {
    case "stats": { const words = t.trim() ? t.trim().split(/\s+/).length : 0; return { chars: t.length, chars_no_spaces: t.replace(/\s/g, "").length, words, lines: t ? t.split("\n").length : 0,
      sentences: (t.match(/[^.!?]+[.!?]+/g) || []).length, paragraphs: t.split(/\n\s*\n/).filter((x) => x.trim()).length, bytes_utf8: Buffer.byteLength(t), reading_minutes: +(words / 230).toFixed(2), approx_llm_tokens: Math.ceil(t.length / 4) }; }
    case "slugify": return { result: t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200) };
    case "case": { const w = t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean); const cap = (s) => s[0].toUpperCase() + s.slice(1).toLowerCase();
      return { upper: t.toUpperCase(), lower: t.toLowerCase(), title: t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()), camel: w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join(""), pascal: w.map(cap).join(""), snake: w.map((x) => x.toLowerCase()).join("_"), kebab: w.map((x) => x.toLowerCase()).join("-"), constant: w.map((x) => x.toUpperCase()).join("_") }; }
    case "base64_encode": return { result: Buffer.from(t, "utf8").toString(mode === "url" ? "base64url" : "base64") };
    case "base64_decode": { const b = Buffer.from(t.trim(), mode === "url" ? "base64url" : "base64"); return { result: b.toString("utf8"), bytes: b.length, note: "decoded text is untrusted data" }; }
    case "url_encode": return { result: encodeURIComponent(t) };
    case "url_decode": try { return { result: decodeURIComponent(t) }; } catch { throw err(400, "bad_input", "malformed percent-encoding"); }
    case "html_escape": return { result: t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]) };
    case "strip_html": return { result: t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim() };
    case "extract_urls": return { urls: [...new Set(t.match(/\bhttps?:\/\/[^\s<>"'`)\]]+/g) || [])].slice(0, 500) };
    case "dedupe_lines": { const seen = new Set(); return { result: t.split("\n").filter((l) => !seen.has(l) && seen.add(l)).join("\n") }; }
    case "sort_lines": return { result: t.split("\n").sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join("\n") };
    case "wrap": { const w = Math.max(10, Math.min(200, Number(width) || 80)); return { result: t.split("\n").map((line) => { const out = []; let cur = ""; for (const word of line.split(/\s+/)) { if ((cur + " " + word).trim().length > w && cur) { out.push(cur); cur = word; } else cur = (cur ? cur + " " : "") + word; } out.push(cur); return out.join("\n"); }).join("\n") }; }
    case "diff": { const [a = "", b = ""] = Array.isArray(text) ? text : t.split("\n---\n"); const A = a.split("\n"); const B = b.split("\n"); const sa = new Set(A); const sb = new Set(B);
      return { removed: A.filter((l) => !sb.has(l)).slice(0, 500), added: B.filter((l) => !sa.has(l)).slice(0, 500), note: "line-set diff; pass text as [a, b] or 'a\\n---\\nb'" }; }
    default: throw err(400, "bad_action", "action: stats | slugify | case | base64_encode | base64_decode | url_encode | url_decode | html_escape | strip_html | extract_urls | dedupe_lines | sort_lines | wrap | diff");
  }
}

// ---------------------------------------------------------------- JSON Schema (draft 2020-12 / 07 core subset)
const FORMATS = { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, uri: /^[a-z][a-z0-9+.-]*:[^\s]*$/i, "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i, date: /^\d{4}-\d{2}-\d{2}$/, time: /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/i,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/, hostname: /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i };
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validate(schema, data, path, root, errors, depth = 0) {
  if (errors.length >= 100) return; if (depth > 64) { errors.push({ path, message: "schema too deep" }); return; }
  if (schema === true || schema === undefined) return; if (schema === false) { errors.push({ path, message: "schema is false" }); return; }
  if (typeof schema !== "object") return;
  if (schema.$ref) { const ref = String(schema.$ref); if (!ref.startsWith("#")) { errors.push({ path, message: `only local $ref supported (${ref})` }); return; }
    const target = ref.slice(1).split("/").filter(Boolean).reduce((o, k) => o?.[decodeURIComponent(k.replace(/~1/g, "/").replace(/~0/g, "~"))], root); validate(target, data, path, root, errors, depth + 1); }
  const t = typeOf(data);
  if (schema.type) { const ts = [].concat(schema.type); if (!ts.some((x) => x === t || (x === "number" && t === "integer"))) errors.push({ path, message: `expected ${ts.join("|")}, got ${t}` }); }
  if ("const" in schema && !deepEq(schema.const, data)) errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.some((e) => deepEq(e, data))) errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum).slice(0, 200)}` });
  if (t === "string") {
    if (schema.minLength !== undefined && [...data].length < schema.minLength) errors.push({ path, message: `shorter than ${schema.minLength}` });
    if (schema.maxLength !== undefined && [...data].length > schema.maxLength) errors.push({ path, message: `longer than ${schema.maxLength}` });
    if (schema.pattern) { let re; try { re = new RegExp(schema.pattern, "u"); } catch { errors.push({ path, message: "invalid pattern in schema" }); } if (re && String(schema.pattern).length <= 500 && data.length <= 10_000 && !re.test(data)) errors.push({ path, message: `does not match ${schema.pattern}` }); }
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format].test(data)) errors.push({ path, message: `not a valid ${schema.format}` });
  }
  if (t === "number" || t === "integer") {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push({ path, message: `< minimum ${schema.minimum}` });
    if (schema.maximum !== undefined && data > schema.maximum) errors.push({ path, message: `> maximum ${schema.maximum}` });
    if (typeof schema.exclusiveMinimum === "number" && data <= schema.exclusiveMinimum) errors.push({ path, message: `<= exclusiveMinimum ${schema.exclusiveMinimum}` });
    if (typeof schema.exclusiveMaximum === "number" && data >= schema.exclusiveMaximum) errors.push({ path, message: `>= exclusiveMaximum ${schema.exclusiveMaximum}` });
    if (schema.multipleOf && Math.abs(data / schema.multipleOf - Math.round(data / schema.multipleOf)) > 1e-9) errors.push({ path, message: `not a multiple of ${schema.multipleOf}` });
  }
  if (t === "array") {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push({ path, message: `fewer than ${schema.minItems} items` });
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push({ path, message: `more than ${schema.maxItems} items` });
    if (schema.uniqueItems && new Set(data.map((x) => JSON.stringify(x))).size !== data.length) errors.push({ path, message: "items not unique" });
    const prefix = schema.prefixItems || (Array.isArray(schema.items) ? schema.items : null);
    if (prefix) prefix.forEach((s, i) => i < data.length && validate(s, data[i], `${path}/${i}`, root, errors, depth + 1));
    const rest = Array.isArray(schema.items) ? schema.additionalItems : schema.items;
    if (rest !== undefined) data.forEach((x, i) => { if (!prefix || i >= prefix.length) validate(rest, x, `${path}/${i}`, root, errors, depth + 1); });
    if (schema.contains && !data.some((x) => { const e = []; validate(schema.contains, x, path, root, e, depth + 1); return !e.length; })) errors.push({ path, message: "no item matches 'contains'" });
  }
  if (t === "object") {
    const keys = Object.keys(data);
    for (const r of schema.required || []) if (!(r in data)) errors.push({ path, message: `missing required property "${r}"` });
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push({ path, message: `fewer than ${schema.minProperties} properties` });
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push({ path, message: `more than ${schema.maxProperties} properties` });
    const props = schema.properties || {}; const pats = Object.entries(schema.patternProperties || {}).map(([p, s]) => [new RegExp(p, "u"), s]);
    for (const k of keys) {
      let matched = false; const kp = `${path}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (k in props) { matched = true; validate(props[k], data[k], kp, root, errors, depth + 1); }
      for (const [re, s] of pats) if (re.test(k)) { matched = true; validate(s, data[k], kp, root, errors, depth + 1); }
      if (!matched && schema.additionalProperties !== undefined) { if (schema.additionalProperties === false) errors.push({ path: kp, message: "additional property not allowed" }); else validate(schema.additionalProperties, data[k], kp, root, errors, depth + 1); }
      if (schema.propertyNames) validate(schema.propertyNames, k, kp, root, errors, depth + 1);
    }
    for (const [k, deps] of Object.entries(schema.dependentRequired || {})) if (k in data) for (const d of deps) if (!(d in data)) errors.push({ path, message: `"${k}" requires "${d}"` });
  }
  const sub = (s) => { const e = []; validate(s, data, path, root, e, depth + 1); return e; };
  if (schema.allOf) for (const s of schema.allOf) errors.push(...sub(s));
  if (schema.anyOf && !schema.anyOf.some((s) => !sub(s).length)) errors.push({ path, message: "matches none of anyOf" });
  if (schema.oneOf) { const n = schema.oneOf.filter((s) => !sub(s).length).length; if (n !== 1) errors.push({ path, message: `matches ${n} of oneOf (needs exactly 1)` }); }
  if (schema.not && !sub(schema.not).length) errors.push({ path, message: "matches 'not' schema" });
  if (schema.if) { const ok = !sub(schema.if).length; if (ok && schema.then) errors.push(...sub(schema.then)); if (!ok && schema.else) errors.push(...sub(schema.else)); }
}
export function jsonValidate({ schema, data, json } = {}) {
  if (json !== undefined && schema === undefined) { try { const v = JSON.parse(String(json)); return { valid_json: true, type: typeOf(v) }; } catch (e) { return { valid_json: false, error: e.message }; } }
  let s = schema; let d = data;
  if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { throw err(400, "bad_schema", `schema is not valid JSON: ${e.message}`); } }
  if (json !== undefined) { try { d = JSON.parse(String(json)); } catch (e) { return { valid: false, errors: [{ path: "", message: `data is not valid JSON: ${e.message}` }] }; } }
  if (s === undefined) throw err(400, "schema_required", "pass schema (object) and data (or json string). Pass only json to check JSON syntax.");
  if (JSON.stringify(s).length > 100_000 || JSON.stringify(d ?? null).length > 500_000) throw err(400, "too_large", "schema max 100 KB, data max 500 KB");
  const errors = []; validate(s, d, "", s, errors);
  return { valid: !errors.length, errors, supported: "type, enum, const, string/number/array/object keywords, required, properties, patternProperties, additionalProperties, items/prefixItems, contains, allOf/anyOf/oneOf/not, if/then/else, dependentRequired, local $ref, common formats" };
}

// ---------------------------------------------------------------- ids and hashes
export function uuidHash({ action = "uuid", input = "", algorithm = "sha256", encoding = "hex", count = 1, bytes = 16 } = {}) {
  if (action === "uuid") return { uuids: Array.from({ length: Math.max(1, Math.min(50, Number(count) || 1)) }, () => crypto.randomUUID()) };
  if (action === "random") { const n = Math.max(1, Math.min(256, Number(bytes) || 16)); const b = crypto.randomBytes(n); return { hex: b.toString("hex"), base64url: b.toString("base64url"), bytes: n }; }
  if (action === "hash") { const alg = String(algorithm).toLowerCase(); if (!["sha256", "sha1", "sha512", "md5", "sha384", "sha3-256"].includes(alg)) throw err(400, "bad_algorithm", "algorithm: sha256 | sha1 | sha384 | sha512 | sha3-256 | md5");
    const s = typeof input === "string" ? input : JSON.stringify(input); if (s.length > 1_000_000) throw err(400, "too_long", "input max 1,000,000 chars");
    return { algorithm: alg, encoding: encoding === "base64" ? "base64" : "hex", digest: crypto.createHash(alg).update(s, "utf8").digest(encoding === "base64" ? "base64" : "hex"), note: alg === "md5" || alg === "sha1" ? "md5/sha1 are fine for checksums, not for security" : undefined }; }
  throw err(400, "bad_action", "action: uuid | random | hash");
}

// ---------------------------------------------------------------- SSRF-safe fetch + url_metadata
function ipIsPublic(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;            // this-net, private, loopback, multicast/reserved
    if (a === 100 && b >= 64 && b <= 127) return false;                       // CGNAT
    if (a === 169 && b === 254) return false;                                 // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; if (a === 198 && (b === 18 || b === 19)) return false; if (a === 198 && b === 51 && c === 100) return false; if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return ipIsPublic(mapped[1]);
    if (x === "::" || x === "::1" || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("ff") || x.startsWith("64:ff9b") || x.startsWith("2001:db8") || x.startsWith("::ffff")) return false;
    return true;
  }
  return false;
}
export { ipIsPublic };
async function resolvePublic(host, lookup = dns.promises.lookup) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h.endsWith(".home.arpa")) throw err(400, "blocked_host", "local/internal hostnames are not fetched");
  if (net.isIP(h)) { if (!ipIsPublic(h)) throw err(400, "blocked_ip", "private, loopback or reserved addresses are not fetched"); return { address: h, family: net.isIP(h) }; }
  let addrs; try { addrs = await lookup(h, { all: true, verbatim: true }); } catch { throw err(424, "dns_failed", `could not resolve ${h}`); }
  if (!addrs.length || addrs.some((a) => !ipIsPublic(a.address))) throw err(400, "blocked_ip", `${h} resolves to a private, loopback or reserved address`);
  return addrs[0];
}
const TEXTY = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/json|application\/ld\+json|text\/markdown)/i;
export async function safeFetchText(rawUrl, { maxBytes = 256 * 1024, timeoutMs = 6000, maxRedirects = 3, lookup, userAgent = "AnansiHaven-URLMeta/0.4 (+https://anansi-haven.vercel.app)" } = {}) {
  let url; try { url = new URL(String(rawUrl)); } catch { throw err(400, "bad_url", "url: absolute http(s) URL required"); }
  const started = Date.now(); const hops = [];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!["http:", "https:"].includes(url.protocol)) throw err(400, "bad_url", "http(s) only");
    if (url.username || url.password) throw err(400, "bad_url", "URLs with credentials are not fetched");
    if (url.port && !["80", "443"].includes(url.port)) throw err(400, "bad_port", "only ports 80 and 443 are fetched");
    const pinned = await resolvePublic(url.hostname, lookup);
    const left = timeoutMs - (Date.now() - started); if (left <= 0) throw err(504, "timeout", "fetch timed out");
    const res = await new Promise((resolve, reject) => {
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.request(url, { method: "GET", headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,text/plain;q=0.8,application/json;q=0.7", "accept-encoding": "identity" },
        lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{ address: pinned.address, family: pinned.family }]) : cb(null, pinned.address, pinned.family)), timeout: left }, (r) => {
        const status = r.statusCode || 0;
        if (status >= 300 && status < 400 && r.headers.location) { r.resume(); return resolve({ redirect: r.headers.location, status }); }
        const type = String(r.headers["content-type"] || "");
        if (!TEXTY.test(type)) { r.destroy(); return resolve({ status, type, text: "", skipped: "non-text content type" }); }
        const chunks = []; let n = 0; let truncated = false;
        r.on("data", (c) => { n += c.length; if (n > maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (n - maxBytes))); r.destroy(); return; } chunks.push(c); });
        r.on("close", () => resolve({ status, type, text: Buffer.concat(chunks).toString("utf8"), truncated }));
        r.on("error", (e) => (truncated ? resolve({ status, type, text: Buffer.concat(chunks).toString("utf8"), truncated }) : reject(e)));
      });
      req.on("timeout", () => req.destroy(err(504, "timeout", "fetch timed out"))); req.on("error", reject); req.end();
    });
    if (res.redirect) { hops.push({ status: res.status, location: String(res.redirect).slice(0, 300) }); url = new URL(res.redirect, url); continue; }
    return { url: url.toString(), status: res.status, content_type: res.type, text: res.text, truncated: !!res.truncated, skipped: res.skipped, redirects: hops };
  }
  throw err(400, "too_many_redirects", `more than ${maxRedirects} redirects`);
}
const decodeEnt = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(+n, 0x10ffff))).replace(/\s+/g, " ").trim();
export function extractMeta(html, baseUrl) {
  const head = html.slice(0, 200_000); const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]; const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1]; const val = (tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (key && val !== undefined && Object.keys(meta).length < 60) meta[key.toLowerCase()] = decodeEnt(val).slice(0, 500);
  }
  const link = (rel) => { const m = head.match(new RegExp(`<link\\b[^>]*rel\\s*=\\s*["'][^"']*\\b${rel}\\b[^"']*["'][^>]*>`, "i")); const h = m && (m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]; try { return h ? new URL(decodeEnt(h), baseUrl).toString().slice(0, 500) : null; } catch { return null; } };
  return { title: decodeEnt((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 300) || meta["og:title"] || null,
    description: meta.description || meta["og:description"] || meta["twitter:description"] || null,
    og: Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith("og:"))), twitter: Object.fromEntries(Object.entries(meta).filter(([k]) => k.startsWith("twitter:"))),
    canonical: link("canonical"), icon: link("icon"), lang: (head.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || null,
    agent_card_hint: /agent-card\.json|\/\.well-known\/agent\.json/i.test(head) || undefined };
}
const metaBuckets = new Map(); // per-instance: ip -> {n, t}
export async function urlMetadata({ url } = {}, { ip = "unknown", fetchText = safeFetchText, perMinute = 10 } = {}) {
  const t = Date.now(); const b = metaBuckets.get(ip) || { n: 0, t }; if (t - b.t > 60_000) { b.n = 0; b.t = t; } b.n += 1; metaBuckets.set(ip, b);
  if (b.n > perMinute) throw err(429, "rate_limited", `url_metadata: max ${perMinute} lookups/min`);
  if (metaBuckets.size > 5000) metaBuckets.clear();
  const r = await fetchText(url);
  const body = r.content_type && /json/i.test(r.content_type) ? { json_preview: r.text.slice(0, 2000) } : /html|xhtml/i.test(r.content_type || "") ? extractMeta(r.text, r.url) : { text_preview: (r.text || "").slice(0, 1000) };
  return untrusted(body, { url: r.url, status: r.status, content_type: r.content_type || null, truncated: r.truncated || undefined, skipped: r.skipped, redirects: r.redirects.length ? r.redirects : undefined,
    limits: "http(s) on 80/443, public IPs only (checked at every redirect), 256 KB, 6 s, 3 redirects, text content types only" });
}

// ---------------------------------------------------------------- registry (MCP/A2A/REST share this)
const s = (description) => ({ type: "string", description });
export const UTILITIES = [
  { name: "time_tools", category: "time", description: "FREE, no key. Time zones and dates: action=now (current time in zones) | convert (time from_tz -> to_tz, list ok) | diff (time -> to) | add (time + days/hours/minutes). IANA zones; handles DST.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["now", "convert", "diff", "add"] }, time: s("ISO 8601 or 'now'; without offset = wall time in from_tz"), from_tz: s("IANA zone, default UTC"), to_tz: { description: "IANA zone or list" }, to: s("end time for diff"), days: { type: "number" }, hours: { type: "number" }, minutes: { type: "number" } } }, run: (a) => timeTools(a) },
  { name: "market_hours", category: "time", description: `FREE, no key. Is a stock exchange open now (or at a given time)? Regular sessions for ${Object.keys(MARKETS).join(", ")}, next open/close. Holidays and half-days not included.`,
    inputSchema: { type: "object", properties: { market: s("'all' or codes, e.g. NYSE,LSE,TSE"), at: s("ISO time, default now") } }, run: (a) => marketHours(a) },
  { name: "unit_convert", category: "math", description: "FREE, no key. Convert units: length, mass, volume, area, speed, time, data size, pressure, energy, temperature (no currencies).",
    inputSchema: { type: "object", properties: { value: { type: "number" }, from: s("unit, e.g. mi, kg, f, gib"), to: s("unit") }, required: ["value", "from", "to"] }, run: (a) => unitConvert(a) },
  { name: "calculate", category: "math", description: "FREE, no key. Safe calculator (no eval): + - * / % ^ ! parentheses, 15% style percents, sqrt, abs, round, floor, ceil, ln, log, log2, exp, trig, min, max, pow, hypot, pi, e.",
    inputSchema: { type: "object", properties: { expression: s("e.g. (1200*0.015)/(1.2-1.15) or 15% * 80") }, required: ["expression"] }, run: (a) => calculate(a) },
  { name: "text_tools", category: "text", description: "FREE, no key. Text utilities: stats (words/chars/tokens), slugify, case (camel/snake/...), base64 encode/decode, url encode/decode, html_escape, strip_html, extract_urls, dedupe_lines, sort_lines, wrap, diff.",
    inputSchema: { type: "object", properties: { action: { type: "string" }, text: { description: "input text (diff: [a, b])" }, width: { type: "integer" }, mode: s("base64: 'url' for base64url") }, required: ["text"] }, run: (a) => textTools(a) },
  { name: "json_validate", category: "data", description: "FREE, no key. Validate data against a JSON Schema (2020-12/07 core: types, required, properties, items, enums, ranges, patterns, formats, combinators, local $ref), or just check JSON syntax.",
    inputSchema: { type: "object", properties: { schema: { description: "JSON Schema (object or JSON string)" }, data: { description: "value to validate" }, json: s("raw JSON text (syntax check, or data as text)") } }, run: (a) => jsonValidate(a) },
  { name: "uuid_hash", category: "data", description: "FREE, no key. UUID v4s, random bytes, and hashes (sha256, sha1, sha384, sha512, sha3-256, md5) in hex or base64.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["uuid", "random", "hash"] }, input: { description: "text to hash" }, algorithm: { type: "string" }, encoding: { type: "string", enum: ["hex", "base64"] }, count: { type: "integer" }, bytes: { type: "integer" } } }, run: (a) => uuidHash(a) },
  { name: "url_metadata", category: "web", network: true, description: "FREE, no key. Fetch a public web page's title, description, Open Graph/Twitter tags, canonical URL and icon. SSRF-protected: public IPs only, 256 KB, 6 s, 10/min. Returned text is untrusted.",
    inputSchema: { type: "object", properties: { url: s("http(s) URL") }, required: ["url"] }, run: (a, ctx) => urlMetadata(a, { ip: ctx?.ip }) },
  ...CONTRIB_TOOLS,
];
export const UTILITY_NAMES = UTILITIES.map((u) => u.name);

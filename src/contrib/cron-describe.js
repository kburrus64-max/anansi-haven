// cron_describe: free, read-only 5-field cron expression parser, explainer, and DST-aware next-run calculator.
// Zero dependencies: Intl only, no network, no state writes.
const bad = (msg) => Object.assign(new Error(msg), { status: 400, code: "bad_input" });

const MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MONTH_NAMES = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const MONTH_FULL = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DOW_NAMES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const validTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const FMT = new Map();
function fmt(tz) {
  if (!FMT.has(tz)) {
    FMT.set(tz, new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    }));
  }
  return FMT.get(tz);
}
function partsIn(date, tz) {
  const o = Object.fromEntries(fmt(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday };
}
function offsetMinutes(date, tz) {
  const p = partsIn(date, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}
const pad = (n) => String(n).padStart(2, "0");
const fmtOffset = (m) => `${m < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
function localIso(date, tz) {
  const p = partsIn(date, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${fmtOffset(offsetMinutes(date, tz))}`;
}
function zonedToDate(y, mo, d, h, mi, tz) {
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) t = Date.UTC(y, mo - 1, d, h, mi) - offsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}
function parseFrom(from, tz) {
  if (from === undefined || from === null || from === "" || from === "now") return new Date();
  if (typeof from !== "string" || from.length > 64) throw bad("from: ISO 8601 time, e.g. 2026-10-05T13:00:00Z");
  const m = from.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const d = zonedToDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), tz);
    if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + (+(m[6] || 0)) * 1000);
  }
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) throw bad("from: ISO 8601 time, e.g. 2026-10-05T13:00:00Z (no offset = wall time in tz)");
  return d;
}

function parseAtom(tok, min, max, names, isDow, fieldName) {
  const up = tok.toUpperCase();
  if (names && Object.hasOwn(names, up)) return names[up];
  if (!/^\d+$/.test(tok)) throw bad(`${fieldName}: invalid value "${tok}"`);
  const n = Number(tok);
  const top = isDow ? 7 : max;
  if (n < min || n > top) throw bad(`${fieldName}: ${n} out of range (${min}-${top})`);
  return n;
}

function parseField(raw, min, max, names, isDow, fieldName) {
  if (!raw || raw.length > 128) throw bad(`${fieldName}: invalid field`);
  const set = new Set();
  const parts = raw.split(",");
  for (const part of parts) {
    if (!part) throw bad(`${fieldName}: empty list item in "${raw}"`);
    const slashParts = part.split("/");
    if (slashParts.length > 2) throw bad(`${fieldName}: too many "/" in "${part}"`);
    const [rangePart, stepRaw] = slashParts;
    let step = 1;
    if (stepRaw !== undefined) {
      if (!/^\d+$/.test(stepRaw)) throw bad(`${fieldName}: invalid step "${stepRaw}"`);
      step = Number(stepRaw);
      if (step < 1 || step > 1000) throw bad(`${fieldName}: step must be between 1 and 1000`);
    }
    let start, end;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const dashParts = rangePart.split("-");
      if (dashParts.length !== 2 || !dashParts[0] || !dashParts[1]) throw bad(`${fieldName}: invalid range "${rangePart}"`);
      start = parseAtom(dashParts[0], min, max, names, isDow, fieldName);
      end = parseAtom(dashParts[1], min, max, names, isDow, fieldName);
      if (isDow && start === 7) start = 0;
      if (isDow && end === 0 && start > 0) end = 7; // e.g. MON-SUN / 5-0
      if (start > end) throw bad(`${fieldName}: range start ${start} > end ${end}`);
    } else {
      start = parseAtom(rangePart, min, max, names, isDow, fieldName);
      if (isDow && start === 7) start = 0;
      end = stepRaw !== undefined ? max : start;
    }
    for (let v = start; v <= end; v += step) set.add(isDow && v === 7 ? 0 : v);
  }
  return { raw, wildcard: raw === "*", values: set, sorted: [...set].sort((a, b) => a - b) };
}

function joinList(items, conj = "and") {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

function describeField(f, label, fmtVal = (v) => String(v)) {
  if (f.wildcard) return null;
  const m = f.raw.match(/^\*\/(\d+)$/);
  if (m) return `every ${m[1]} ${label}s`;
  return joinList(f.sorted.map(fmtVal));
}

function describeCron(p) {
  const bits = [];
  // Time of day
  if (p.minute.wildcard && p.hour.wildcard) {
    bits.push("Every minute");
  } else if (/^\*\/\d+$/.test(p.minute.raw) && p.hour.wildcard) {
    bits.push(`Every ${p.minute.raw.slice(2)} minutes`);
  } else if (!p.minute.wildcard && p.hour.wildcard) {
    const mDesc = describeField(p.minute, "minute");
    bits.push(/^\*\/\d+$/.test(p.minute.raw) ? `Every ${p.minute.raw.slice(2)} minutes` : `At minute ${mDesc} past every hour`);
  } else if (p.minute.sorted.length === 1 && p.hour.sorted.length === 1) {
    bits.push(`At ${pad(p.hour.sorted[0])}:${pad(p.minute.sorted[0])}`);
  } else {
    const mPart = p.minute.wildcard ? "every minute" : (/^\*\/\d+$/.test(p.minute.raw) ? `every ${p.minute.raw.slice(2)} minutes` : `at minute ${describeField(p.minute, "minute")}`);
    const hPart = /^\*\/\d+$/.test(p.hour.raw) ? `every ${p.hour.raw.slice(2)} hours` : `during hour ${describeField(p.hour, "hour", (h) => `${pad(h)}:00`)}`;
    bits.push(`${mPart.charAt(0).toUpperCase() + mPart.slice(1)} ${hPart}`);
  }

  // Day of month / Day of week
  const domDesc = p.dom.wildcard ? null : `day ${describeField(p.dom, "day")} of the month`;
  const dowDesc = p.dow.wildcard ? null : (
    p.dow.raw === "1-5" ? "Monday through Friday"
      : (p.dow.raw === "0,6" || p.dow.raw === "6,0" ? "Saturday and Sunday" : describeField(p.dow, "weekday", (d) => DOW_FULL[d]))
  );
  if (domDesc && dowDesc) bits.push(`on ${domDesc} or ${dowDesc}`);
  else if (domDesc) bits.push(`on ${domDesc}`);
  else if (dowDesc) bits.push(`on ${dowDesc}`);

  // Month
  if (!p.month.wildcard) bits.push(`in ${describeField(p.month, "month", (m) => MONTH_FULL[m])}`);
  return bits.join(", ");
}

function nextRuns(p, fromDate, tz, count) {
  const fp = partsIn(fromDate, tz);
  const runs = [];
  const seen = new Set();
  const maxDays = 366 * 8 + 2; // covers 8-year leap-year edge (e.g. 2096 -> 2104)
  for (let i = 0; i <= maxDays && runs.length < count; i++) {
    const day = new Date(Date.UTC(fp.y, fp.mo - 1, fp.d + i));
    const y = day.getUTCFullYear();
    const mo = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const wd = day.getUTCDay();
    if (!p.month.values.has(mo)) continue;
    const dayMatch = (!p.dom.wildcard && !p.dow.wildcard)
      ? (p.dom.values.has(d) || p.dow.values.has(wd))
      : (p.dom.values.has(d) && p.dow.values.has(wd));
    if (!dayMatch) continue;
    for (const h of p.hour.sorted) {
      for (const mi of p.minute.sorted) {
        const dt = zonedToDate(y, mo, d, h, mi, tz);
        if (dt <= fromDate) continue;
        const cp = partsIn(dt, tz);
        if (cp.y !== y || cp.mo !== mo || cp.d !== d || cp.h !== h || cp.mi !== mi) continue; // skip DST spring-forward gap
        const iso = dt.toISOString();
        if (seen.has(iso)) continue;
        seen.add(iso);
        runs.push({ utc: iso, in_tz: localIso(dt, tz) });
        if (runs.length >= count) break;
      }
      if (runs.length >= count) break;
    }
  }
  return runs;
}

export function cronDescribe(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw bad("arguments must be an object");
  if (typeof args.expression !== "string" || !args.expression.trim() || args.expression.length > 256) {
    throw bad("expression: non-empty 5-field cron string (max 256 chars), e.g. '*/15 9-17 * * 1-5' or '@daily'");
  }
  const raw = args.expression.trim();
  const tz = args.tz === undefined || args.tz === null || args.tz === "" ? "UTC" : args.tz;
  if (typeof tz !== "string" || tz.length > 64 || !validTz(tz)) {
    throw bad("tz: IANA time zone like UTC, America/New_York, Europe/London, Asia/Tokyo");
  }
  let count = 5;
  if (args.count !== undefined && args.count !== null && args.count !== "") {
    if (typeof args.count === "boolean") throw bad("count: integer between 1 and 20");
    const n = Number(args.count);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw bad("count: integer between 1 and 20");
    count = n;
  }
  const fromDate = parseFrom(args.from, tz);

  const low = raw.toLowerCase();
  const normalized = Object.hasOwn(MACROS, low) ? MACROS[low] : (low.startsWith("@") ? (() => { throw bad(`unknown cron macro "${raw}" (supported: ${Object.keys(MACROS).join(", ")})`); })() : raw);
  const fields = normalized.split(/\s+/);
  if (fields.length !== 5) throw bad(`expected 5 cron fields (minute hour day_of_month month day_of_week), got ${fields.length}`);

  const parsed = {
    minute: parseField(fields[0], 0, 59, null, false, "minute"),
    hour: parseField(fields[1], 0, 23, null, false, "hour"),
    dom: parseField(fields[2], 1, 31, null, false, "day_of_month"),
    month: parseField(fields[3], 1, 12, MONTH_NAMES, false, "month"),
    dow: parseField(fields[4], 0, 6, DOW_NAMES, true, "day_of_week"),
  };

  const runs = nextRuns(parsed, fromDate, tz, count);
  const bothDayRestricted = !parsed.dom.wildcard && !parsed.dow.wildcard;

  return {
    expression: raw,
    normalized,
    tz,
    from: { utc: fromDate.toISOString(), in_tz: localIso(fromDate, tz) },
    description: describeCron(parsed),
    fields: {
      minute: parsed.minute.sorted,
      hour: parsed.hour.sorted,
      day_of_month: parsed.dom.sorted,
      month: parsed.month.sorted,
      day_of_week: parsed.dow.sorted,
    },
    day_match_rule: bothDayRestricted
      ? "OR (POSIX: when both day_of_month and day_of_week are restricted, either matching day runs)"
      : "AND (standard)",
    next_runs: runs,
    ...(runs.length < count ? { note: "no further matching calendar dates found within the 8-year search horizon" } : {}),
  };
}

export const cron_describe = {
  name: "cron_describe",
  category: "time",
  owner: "NovaCraft Studio",
  description: "FREE, no key. Parse and explain 5-field POSIX cron expressions (or @hourly/@daily/@weekly/@monthly/@yearly macros) and compute upcoming DST-aware run times in UTC or any IANA time zone.",
  inputSchema: {
    type: "object",
    properties: {
      expression: { type: "string", description: "5-field cron expression (e.g. '*/15 9-17 * * 1-5') or macro (@daily, @hourly, ...)" },
      tz: { type: "string", description: "IANA time zone for evaluation and display, default UTC" },
      from: { type: "string", description: "ISO 8601 start time (strictly before returned runs), default now" },
      count: { type: "integer", minimum: 1, maximum: 20, description: "Number of upcoming runs to return (1-20, default 5)" },
    },
    required: ["expression"],
  },
  run: (args) => cronDescribe(args),
};

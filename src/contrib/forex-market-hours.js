// forex_market_hours: free, read-only forex session clock (Trade Desk). Zero dependencies: Intl only, no network, no state.
// Sessions are defined in their own local zones so DST shifts are handled per city (e.g. the weeks in March/October-November
// when the US and UK/Australia change clocks on different dates).
const bad = (msg) => Object.assign(new Error(msg), { status: 400, code: "bad_input" });
const NOTE = "Informational only, not financial advice.";
const DATA_SOURCE = "standard session conventions, not a broker feed; holidays and broker-specific hours not included";

export const FX_SESSIONS = [
  { name: "Sydney", tz: "Australia/Sydney", open: [7, 0], close: [16, 0] },
  { name: "Tokyo", tz: "Asia/Tokyo", open: [9, 0], close: [18, 0] },
  { name: "London", tz: "Europe/London", open: [8, 0], close: [17, 0] },
  { name: "New York", tz: "America/New_York", open: [8, 0], close: [17, 0] },
];
const WEEK_TZ = "America/New_York"; // FX week: Sunday 17:00 -> Friday 17:00 New York time

const validTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
const FMT = new Map();
function fmt(tz) {
  if (!FMT.has(tz)) FMT.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }));
  return FMT.get(tz);
}
function partsIn(date, tz) {
  const o = Object.fromEntries(fmt(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, wd: o.weekday };
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function offsetMinutes(date, tz) { const p = partsIn(date, tz); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000) / 60000); }
const fmtOffset = (m) => `${m < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
const pad = (n) => String(n).padStart(2, "0");
function localIso(date, tz) { const p = partsIn(date, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${fmtOffset(offsetMinutes(date, tz))}`; }
// Wall-clock time in tz -> Date. Day overflow (d=32 etc.) is fine; two-pass offset correction handles DST edges.
function zonedToDate(y, mo, d, h, mi, tz) { let t = Date.UTC(y, mo - 1, d, h, mi); for (let i = 0; i < 2; i++) t = Date.UTC(y, mo - 1, d, h, mi) - offsetMinutes(new Date(t), tz) * 60000; return new Date(t); }
const dateOnly = (y, mo, d) => { const x = new Date(Date.UTC(y, mo - 1, d)); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay() }; };

function parseAt(at, tz) {
  if (at === undefined || at === null || at === "" || at === "now") return new Date();
  if (typeof at !== "string" || at.length > 64) throw bad("at: ISO 8601 time, e.g. 2026-10-05T13:00:00Z");
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/); // no offset: wall time in tz
  if (m) { const d = zonedToDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), tz); if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + (+(m[6] || 0)) * 1000); }
  const d = new Date(at); if (Number.isNaN(d.getTime())) throw bad("at: ISO 8601 time, e.g. 2026-10-05T13:00:00Z (no offset = wall time in tz)"); return d;
}

// FX weekly windows around t (previous, current, next week), each [Sunday 17:00 NY, Friday 17:00 NY).
function weeklyWindows(t) {
  const p = partsIn(t, WEEK_TZ); const sunD = p.d - WD[p.wd];
  return [-1, 0, 1, 2].map((k) => ({ start: zonedToDate(p.y, p.mo, sunD + 7 * k, 17, 0, WEEK_TZ), end: zonedToDate(p.y, p.mo, sunD + 7 * k + 5, 17, 0, WEEK_TZ) }));
}
// Session intervals (local weekdays Mon-Fri) clipped to the FX week, for local days around t.
function sessionIntervals(s, t, weeks) {
  const p = partsIn(t, s.tz); const out = [];
  for (let i = -2; i <= 8; i++) {
    const day = dateOnly(p.y, p.mo, p.d + i); if (day.wd === 0 || day.wd === 6) continue;
    const a = zonedToDate(day.y, day.mo, day.d, s.open[0], s.open[1], s.tz); const b = zonedToDate(day.y, day.mo, day.d, s.close[0], s.close[1], s.tz);
    for (const w of weeks) { const st = Math.max(a, w.start); const en = Math.min(b, w.end); if (st < en) out.push({ start: new Date(st), end: new Date(en) }); }
  }
  return out.sort((x, y) => x.start - y.start);
}

export function forexMarketHours(args = {}) {
  if (!args || typeof args !== "object") throw bad("arguments must be an object");
  const tz = args.tz === undefined || args.tz === null || args.tz === "" ? "UTC" : args.tz;
  if (typeof tz !== "string" || tz.length > 64 || !validTz(tz)) throw bad("tz: IANA time zone like UTC, America/New_York, Europe/London, Asia/Tokyo");
  const t = parseAt(args.at, tz);
  const both = (d) => ({ utc: d.toISOString(), in_tz: localIso(d, tz) });

  const weeks = weeklyWindows(t);
  const curWeek = weeks.find((w) => t >= w.start && t < w.end) || null;
  const marketOpen = !!curWeek;
  const nextWeek = weeks.find((w) => w.start > t);

  const events = [];
  if (marketOpen) events.push({ event: "close", name: "FX market (weekly)", at: curWeek.end });
  if (nextWeek) events.push({ event: "open", name: "FX market (weekly)", at: nextWeek.start });

  const sessions = FX_SESSIONS.map((s) => {
    const ivs = sessionIntervals(s, t, weeks);
    const cur = ivs.find((iv) => t >= iv.start && t < iv.end) || null;
    const nxt = ivs.find((iv) => iv.start > t) || null;
    if (cur) events.push({ event: "close", name: s.name, at: cur.end });
    if (nxt) events.push({ event: "open", name: s.name, at: nxt.start });
    const lp = partsIn(t, s.tz);
    const todayOpen = zonedToDate(lp.y, lp.mo, lp.d, s.open[0], s.open[1], s.tz); const todayClose = zonedToDate(lp.y, lp.mo, lp.d, s.close[0], s.close[1], s.tz);
    const weekday = lp.wd !== "Sat" && lp.wd !== "Sun";
    return {
      session: s.name, tz: s.tz, local_hours: `${pad(s.open[0])}:${pad(s.open[1])}-${pad(s.close[0])}:${pad(s.close[1])}`,
      local_time: localIso(t, s.tz), local_weekday: lp.wd, open_now: !!cur,
      today: { local_date: `${lp.y}-${pad(lp.mo)}-${pad(lp.d)}`, trading_day: weekday, open: both(todayOpen), close: both(todayClose) },
      ...(cur ? { closes_at: both(cur.end), minutes_to_close: Math.round((cur.end - t) / 60000) } : {}),
      next_open: nxt ? both(nxt.start) : null,
      _cur: cur,
    };
  });

  const overlaps = [];
  for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
    const a = sessions[i], b = sessions[j];
    if (a._cur && b._cur) { const end = new Date(Math.min(a._cur.end, b._cur.end)); overlaps.push({ sessions: `${a.session}/${b.session}`, until: both(end), minutes_left: Math.round((end - t) / 60000) }); }
  }
  for (const s of sessions) delete s._cur;

  events.sort((x, y) => x.at - y.at || (x.event === "close" ? -1 : 1));
  const fmtEv = (e) => e && { event: e.event, name: e.name, utc: e.at.toISOString(), in_tz: localIso(e.at, tz), in_minutes: Math.round((e.at - t) / 60000) };
  const nextOpen = events.find((e) => e.event === "open"); const nextClose = events.find((e) => e.event === "close");

  return {
    at: both(t), tz,
    market_open: marketOpen,
    week: marketOpen ? { opened: both(curWeek.start), closes: both(curWeek.end) } : { closed_since: both(weeks.filter((w) => w.end <= t).pop().end), reopens: both(nextWeek.start) },
    sessions,
    active_overlaps: overlaps,
    next_open: fmtEv(nextOpen) || null,
    next_close: fmtEv(nextClose) || null,
    upcoming_events: events.slice(0, 8).map(fmtEv),
    weekly_hours: "Sunday 17:00 to Friday 17:00 America/New_York; sessions only count as open inside that window",
    data_source: DATA_SOURCE,
    note: NOTE,
  };
}

export const forex_market_hours = {
  name: "forex_market_hours",
  category: "trading",
  owner: "Trade Desk",
  description: "FREE, no key. Forex session clock: Sydney, Tokyo, London and New York sessions (each in its own zone, DST-aware), open now, active overlaps (e.g. London/New York), next open/close, times shown in UTC and any IANA zone. FX week Sun 17:00-Fri 17:00 New York. Holidays and broker hours not included. Informational only, not financial advice.",
  inputSchema: {
    type: "object",
    properties: {
      at: { type: "string", description: "ISO 8601 time, default now (no offset = wall time in tz)" },
      tz: { type: "string", description: "IANA zone for display, default UTC, e.g. America/New_York" },
    },
  },
  run: (args) => forexMarketHours(args),
};

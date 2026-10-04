// Trade Desk contributed tools: position_size and forex_market_hours (free, read-only, stateless, no network).
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { positionSize } from "../src/contrib/position-size.js";
import { forexMarketHours } from "../src/contrib/forex-market-hours.js";
import { CONTRIB_TOOLS, PLANNED_TOOLS } from "../src/contrib/index.js";
import { callTool, TOOLS } from "../src/tools.js";
import { A2A_SKILLS } from "../src/a2a.js";
import { isStateless } from "../src/serverless.js";

const NOTE = "Informational only, not financial advice.";
const isBad = (e) => e.status === 400 && e.code === "bad_input";
const sess = (r, name) => r.sessions.find((s) => s.session === name);

test("position_size: normal input", () => {
  const r = positionSize({ account_size: 10000, risk_pct: 1, stop_distance: 25, point_value: 10 });
  assert.equal(r.risk_amount, 100); assert.equal(r.raw_size, 0.4); assert.equal(r.size, 0.4); assert.equal(r.actual_risk, 100);
  assert.equal(r.capped, false); assert.equal(r.warning, undefined); assert.equal(r.note, NOTE);
  // numeric strings (REST GET query) are accepted
  assert.equal(positionSize({ account_size: "50000", risk_pct: "0.5", stop_distance: "20", point_value: "1" }).size, 12.5);
});

test("position_size: lot rounding is always DOWN, no float drift", () => {
  const r = positionSize({ account_size: 10000, risk_pct: 1, stop_distance: 30, point_value: 10 }); // raw 0.3333
  assert.equal(r.raw_size, 0.333333333333); assert.equal(r.size, 0.33); assert.equal(r.actual_risk, 99); assert.ok(r.actual_risk <= r.risk_amount);
  assert.equal(positionSize({ account_size: 1000, risk_pct: 2.9, stop_distance: 100, point_value: 1 }).size, 0.29, "0.29/0.01 must not floor to 0.28");
  assert.equal(positionSize({ account_size: 10000, risk_pct: 1, stop_distance: 30, point_value: 10, lot_step: 0.1 }).size, 0.3);
  assert.equal(positionSize({ account_size: 10000, risk_pct: 1, stop_distance: 7, point_value: 1, lot_step: 1 }).size, 14); // raw 14.28
  const tiny = positionSize({ account_size: 100, risk_pct: 1, stop_distance: 50, point_value: 10 }); // raw 0.002
  assert.equal(tiny.size, 0); assert.equal(tiny.actual_risk, 0); assert.match(tiny.warning, /below one lot_step/);
});

test("position_size: max_size cap and risk warning", () => {
  const r = positionSize({ account_size: 100000, risk_pct: 1, stop_distance: 10, point_value: 10, max_size: 5 }); // raw 10
  assert.equal(r.raw_size, 10); assert.equal(r.size, 5); assert.equal(r.capped, true); assert.equal(r.actual_risk, 500);
  assert.equal(positionSize({ account_size: 100000, risk_pct: 1, stop_distance: 10, point_value: 10, max_size: 50 }).capped, false);
  assert.equal(positionSize({ account_size: 100000, risk_pct: 1, stop_distance: 10, point_value: 10, max_size: 2.555 }).size, 2.55, "cap is rounded down to lot_step too");
  assert.match(positionSize({ account_size: 10000, risk_pct: 5, stop_distance: 10, point_value: 1 }).warning, /above/);
  assert.equal(positionSize({ account_size: 10000, risk_pct: 2, stop_distance: 10, point_value: 1 }).warning, undefined);
});

test("position_size: bad input -> 400 bad_input", () => {
  const ok = { account_size: 10000, risk_pct: 1, stop_distance: 25, point_value: 10 };
  for (const [k, v] of [["account_size", 0], ["account_size", -5], ["risk_pct", 101], ["risk_pct", 0], ["stop_distance", Infinity], ["point_value", NaN], ["point_value", "abc"], ["account_size", undefined], ["account_size", true], ["lot_step", 0], ["max_size", -1], ["stop_distance", null]])
    assert.throws(() => positionSize({ ...ok, [k]: v }), isBad, `${k}=${v}`);
  assert.throws(() => positionSize(), isBad);
});

test("forex_market_hours: weekend is closed everywhere", () => {
  const r = forexMarketHours({ at: "2026-10-03T12:00:00Z" }); // Saturday
  assert.equal(r.market_open, false); assert.ok(r.sessions.every((s) => !s.open_now)); assert.deepEqual(r.active_overlaps, []);
  assert.equal(r.week.reopens.utc, "2026-10-04T21:00:00.000Z"); // Sunday 17:00 EDT
  assert.equal(r.next_open.utc, "2026-10-04T21:00:00.000Z"); assert.equal(r.next_close, null);
  assert.equal(sess(r, "Sydney").next_open.utc, "2026-10-04T21:00:00.000Z", "Sydney Monday 07:00 AEDT (20:00Z) is clipped to the weekly open");
  assert.equal(sess(r, "Tokyo").next_open.utc, "2026-10-05T00:00:00.000Z");
  assert.equal(forexMarketHours({ at: "2026-10-04T20:59:00Z" }).market_open, false, "Sunday just before open");
  assert.equal(forexMarketHours({ at: "2026-10-04T21:00:00Z" }).market_open, true, "Sunday 17:00 NY open");
  assert.equal(forexMarketHours({ at: "2026-10-09T20:59:00Z" }).market_open, true, "Friday before close");
  const fri = forexMarketHours({ at: "2026-10-09T21:00:00Z" });
  assert.equal(fri.market_open, false, "Friday 17:00 NY close"); assert.equal(fri.week.closed_since.utc, "2026-10-09T21:00:00.000Z");
  assert.equal(r.data_source, "standard session conventions, not a broker feed; holidays and broker-specific hours not included"); assert.equal(r.note, NOTE);
});

test("forex_market_hours: London/New York overlap, display tz, sessions today", () => {
  const r = forexMarketHours({ at: "2026-10-05T13:00:00Z", tz: "America/New_York" }); // Monday
  assert.equal(r.market_open, true);
  assert.equal(sess(r, "London").open_now, true); assert.equal(sess(r, "New York").open_now, true);
  assert.equal(sess(r, "Tokyo").open_now, false); assert.equal(sess(r, "Sydney").open_now, false);
  assert.deepEqual(r.active_overlaps.map((o) => o.sessions), ["London/New York"]);
  assert.equal(r.active_overlaps[0].until.utc, "2026-10-05T16:00:00.000Z"); assert.equal(r.active_overlaps[0].until.in_tz, "2026-10-05T12:00:00-04:00");
  const ny = sess(r, "New York");
  assert.equal(ny.today.open.utc, "2026-10-05T12:00:00.000Z"); assert.equal(ny.today.open.in_tz, "2026-10-05T08:00:00-04:00"); assert.equal(ny.today.close.utc, "2026-10-05T21:00:00.000Z");
  assert.equal(r.next_close.name, "London"); assert.equal(r.next_close.in_minutes, 180);
  assert.equal(r.next_open.name, "Sydney"); assert.equal(r.next_open.utc, "2026-10-05T20:00:00.000Z"); // Tue 07:00 AEDT (Sydney DST began Oct 4)
  // Tokyo/London overlap early Monday London time (Tokyo 16:30 JST, London 08:30 BST)
  assert.deepEqual(forexMarketHours({ at: "2026-10-05T07:30:00Z" }).active_overlaps.map((o) => o.sessions), ["Tokyo/London"]);
  // no-offset time = wall time in tz
  assert.equal(forexMarketHours({ at: "2026-10-05T09:00", tz: "America/New_York" }).at.utc, "2026-10-05T13:00:00.000Z");
});

test("forex_market_hours: DST transition weeks (US and UK change on different dates)", () => {
  // Week of 2026-03-02: both on standard time. NY 08:00 EST = 13:00Z, so 12:30Z = London only.
  const before = forexMarketHours({ at: "2026-03-03T12:30:00Z" });
  assert.equal(sess(before, "New York").open_now, false); assert.equal(sess(before, "New York").today.open.utc, "2026-03-03T13:00:00.000Z");
  assert.equal(before.week.opened.utc, "2026-03-01T22:00:00.000Z", "Sunday 17:00 EST");
  // US springs forward Sun 2026-03-08, UK not until 2026-03-29: NY opens 12:00Z, London still 08:00Z GMT.
  const gap = forexMarketHours({ at: "2026-03-10T12:30:00Z" });
  assert.equal(gap.week.opened.utc, "2026-03-08T21:00:00.000Z", "Sunday 17:00 EDT on the change day");
  assert.equal(sess(gap, "New York").open_now, true); assert.equal(sess(gap, "New York").today.open.utc, "2026-03-10T12:00:00.000Z");
  assert.equal(sess(gap, "London").today.open.utc, "2026-03-10T08:00:00.000Z"); assert.equal(sess(gap, "London").today.close.utc, "2026-03-10T17:00:00.000Z");
  assert.deepEqual(gap.active_overlaps.map((o) => o.sessions), ["London/New York"]);
  assert.equal(gap.active_overlaps[0].until.utc, "2026-03-10T17:00:00.000Z", "5-hour overlap during the US-only DST weeks");
  // After the UK change (2026-03-30), London 08:00 BST = 07:00Z.
  assert.equal(sess(forexMarketHours({ at: "2026-03-31T12:00:00Z" }), "London").today.open.utc, "2026-03-31T07:00:00.000Z");
  // Autumn: UK falls back 2026-10-25, US 2026-11-01.
  const fall = forexMarketHours({ at: "2026-10-27T12:00:00Z" });
  assert.equal(sess(fall, "London").today.open.utc, "2026-10-27T08:00:00.000Z"); assert.equal(sess(fall, "New York").today.open.utc, "2026-10-27T12:00:00.000Z");
  assert.equal(fall.week.closes.utc, "2026-10-30T21:00:00.000Z");
  assert.equal(forexMarketHours({ at: "2026-11-03T12:30:00Z" }).week.opened.utc, "2026-11-01T22:00:00.000Z", "Sunday 17:00 EST after US fall-back");
});

test("forex_market_hours: bad input", () => {
  for (const a of [{ tz: "Mars/Olympus" }, { tz: 5 }, { at: "not a time" }, { at: 12345 }, { at: "x".repeat(100) }])
    assert.throws(() => forexMarketHours(a), isBad, JSON.stringify(a).slice(0, 40));
  assert.equal(forexMarketHours({}).tz, "UTC"); // defaults: now, UTC
});

test("trading tools are registered as free stateless tools, A2A skills, and no longer planned", async () => {
  const { h } = fresh();
  assert.deepEqual(CONTRIB_TOOLS.map((t) => t.name), ["position_size", "forex_market_hours"]);
  for (const t of CONTRIB_TOOLS) { assert.equal(t.category, "trading"); assert.equal(t.owner, "Trade Desk"); }
  assert.deepEqual(PLANNED_TOOLS.map((p) => p.name), ["economic_calendar"]);
  for (const name of ["position_size", "forex_market_hours"]) {
    const t = TOOLS.find((x) => x.name === name); assert.ok(t && t.free && t.auth === false && t.stateless, name);
    assert.ok(A2A_SKILLS.some((s) => s.id === name), `A2A skill ${name}`);
    assert.ok(isStateless("GET", `/v1/free/${name}`));
  }
  assert.equal((await callTool(h, "position_size", { account_size: 10000, risk_pct: 1, stop_distance: 25, point_value: 10 })).size, 0.4);
  assert.equal((await callTool(h, "forex_market_hours", { at: "2026-10-03T12:00:00Z" })).market_open, false);
  await assert.rejects(callTool(h, "position_size", { account_size: -1, risk_pct: 1, stop_distance: 1, point_value: 1 }), isBad);
});

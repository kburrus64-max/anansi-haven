// Contributed tool: cron_describe (free, read-only, stateless, no network).
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { cronDescribe } from "../src/contrib/cron-describe.js";
import { CONTRIB_TOOLS } from "../src/contrib/index.js";
import { callTool, TOOLS } from "../src/tools.js";
import { A2A_SKILLS, READ_ONLY_SKILLS } from "../src/a2a.js";
import { isStateless } from "../src/serverless.js";
import { createHandler } from "../src/app.js";

const isBad = (e) => e.status === 400 && e.code === "bad_input";

test("cron_describe: standard expressions, names, steps, and macros", () => {
  const r = cronDescribe({ expression: "*/15 9-17 * * 1-5", from: "2026-10-05T10:05:00Z", count: 3 });
  assert.equal(r.normalized, "*/15 9-17 * * 1-5");
  assert.equal(r.tz, "UTC");
  assert.deepEqual(r.fields.minute, [0, 15, 30, 45]);
  assert.deepEqual(r.fields.hour, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(r.fields.day_of_week, [1, 2, 3, 4, 5]);
  assert.match(r.description, /Every 15 minutes/);
  assert.match(r.description, /Monday through Friday/);
  assert.deepEqual(r.next_runs.map((x) => x.utc), [
    "2026-10-05T10:15:00.000Z",
    "2026-10-05T10:30:00.000Z",
    "2026-10-05T10:45:00.000Z",
  ]);

  const named = cronDescribe({ expression: "30 8 1 JAN,JUN MON-FRI", from: "2026-01-01T00:00:00Z", count: 2 });
  assert.deepEqual(named.fields.month, [1, 6]);
  assert.deepEqual(named.fields.day_of_week, [1, 2, 3, 4, 5]);
  assert.match(named.day_match_rule, /^OR/);
  assert.equal(named.next_runs[0].utc, "2026-01-01T08:30:00.000Z");

  // 7 and SUN normalize to 0
  const sun = cronDescribe({ expression: "0 12 * * 7", from: "2026-10-03T12:00:00Z", count: 1 });
  assert.deepEqual(sun.fields.day_of_week, [0]);
  assert.equal(sun.next_runs[0].utc, "2026-10-04T12:00:00.000Z");

  // Macros and step from non-wildcard start
  assert.equal(cronDescribe({ expression: "@daily", from: "2026-10-05T00:00:00Z", count: 1 }).next_runs[0].utc, "2026-10-06T00:00:00.000Z");
  assert.equal(cronDescribe({ expression: "@hourly", from: "2026-10-05T00:10:00Z", count: 1 }).next_runs[0].utc, "2026-10-05T01:00:00.000Z");
  assert.deepEqual(cronDescribe({ expression: "5/20 * * * *", from: "2026-10-05T00:00:00Z", count: 1 }).fields.minute, [5, 25, 45]);
});

test("cron_describe: IANA timezones, DST spring-forward skip, leap day, and impossible dates", () => {
  // 2026-03-08 America/New_York springs forward at 02:00 -> 03:00 (02:30 does not exist)
  const dst = cronDescribe({ expression: "30 2 * * *", tz: "America/New_York", from: "2026-03-08T01:00", count: 2 });
  assert.equal(dst.next_runs[0].in_tz, "2026-03-09T02:30:00-04:00");
  assert.equal(dst.next_runs[0].utc, "2026-03-09T06:30:00.000Z");

  // Leap day
  const leap = cronDescribe({ expression: "0 0 29 2 *", from: "2026-01-01T00:00:00Z", count: 1 });
  assert.equal(leap.next_runs[0].utc, "2028-02-29T00:00:00.000Z");

  // Impossible date terminates cleanly
  const feb31 = cronDescribe({ expression: "0 0 31 2 *", from: "2026-01-01T00:00:00Z", count: 2 });
  assert.deepEqual(feb31.next_runs, []);
  assert.match(feb31.note, /horizon/);
});

test("cron_describe: bad input and limits -> 400 bad_input", () => {
  for (const a of [
    undefined,
    null,
    {},
    { expression: "" },
    { expression: "   " },
    { expression: 123 },
    { expression: "x".repeat(257) },
    { expression: "* * * *" },
    { expression: "* * * * * *" },
    { expression: "60 * * * *" },
    { expression: "* 24 * * *" },
    { expression: "* * 0 * *" },
    { expression: "* * 32 * *" },
    { expression: "* * * 13 *" },
    { expression: "* * * * 8" },
    { expression: "*/0 * * * *" },
    { expression: "10-5 * * * *" },
    { expression: "1,,2 * * * *" },
    { expression: "@bogus" },
    { expression: "* * * * *", tz: "Mars/Olympus" },
    { expression: "* * * * *", from: "not-a-date" },
    { expression: "* * * * *", count: 0 },
    { expression: "* * * * *", count: 21 },
    { expression: "* * * * *", count: 1.5 },
    { expression: "* * * * *", count: true },
  ]) {
    assert.throws(() => cronDescribe(a), isBad, JSON.stringify(a));
  }
  // Numeric string count (from REST GET query) is accepted
  assert.equal(cronDescribe({ expression: "@hourly", from: "2026-10-05T00:00:00Z", count: "2" }).next_runs.length, 2);
});

test("cron_describe is registered as free stateless tool, A2A skill, and works over HTTP", async () => {
  const { h } = fresh();
  assert.ok(CONTRIB_TOOLS.some((t) => t.name === "cron_describe"));
  const t = TOOLS.find((x) => x.name === "cron_describe");
  assert.ok(t && t.free && t.auth === false && t.stateless);
  assert.ok(A2A_SKILLS.some((s) => s.id === "cron_describe"));
  assert.ok(READ_ONLY_SKILLS.has("cron_describe"));
  assert.ok(isStateless("GET", "/v1/free/cron_describe?expression=%40daily"));
  assert.ok(isStateless("POST", "/v1/free/cron_describe", Buffer.from(JSON.stringify({ expression: "@daily" }))));

  const out = await callTool(h, "cron_describe", { expression: "0 9 * * 1-5", from: "2026-10-05T00:00:00Z", count: 1 });
  assert.equal(out.next_runs[0].utc, "2026-10-05T09:00:00.000Z");

  const handler = createHandler(h, { trustProxy: true });
  const res = { status: 0, headers: {}, body: "", writeHead(s, hd) { this.status = s; Object.assign(this.headers, hd || {}); return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { if (b != null) this.body = b; } };
  await handler({
    method: "GET",
    url: "/v1/free/cron_describe?expression=0%209%20*%20*%201-5&count=2&from=2026-10-05T00%3A00%3A00Z",
    headers: { host: "anansi-haven.anansidata.workers.dev", "x-forwarded-proto": "https" },
    socket: {},
    async *[Symbol.asyncIterator]() {},
  }, res);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.next_runs.length, 2);
});

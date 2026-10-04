// Free utilities (stateless, no key), SSRF protection, tools catalog, stateless serverless fast path, card x402 fix.
import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { timeTools, marketHours, unitConvert, calculate, textTools, jsonValidate, uuidHash, safeFetchText, ipIsPublic, extractMeta, urlMetadata, UTILITIES } from "../src/utilities.js";
import { callTool, TOOLS } from "../src/tools.js";
import { isStateless } from "../src/serverless.js";
import { agentCard } from "../src/a2a.js";
import { TRUST_LABEL } from "../src/safety.js";

test("time_tools + market_hours: zones, DST, sessions, lunch breaks, weekends", () => {
  const c = timeTools({ action: "convert", time: "2026-07-01T09:30", from_tz: "America/New_York", to_tz: ["UTC", "Europe/London"] });
  assert.equal(c.input.as_utc, "2026-07-01T13:30:00.000Z"); assert.equal(c.results[1].local, "2026-07-01T14:30:00+01:00");
  assert.equal(timeTools({ action: "convert", time: "2026-12-01T09:30", from_tz: "America/New_York", to_tz: "UTC" }).results[0].local, "2026-12-01T14:30:00+00:00");
  assert.equal(timeTools({ action: "diff", time: "2026-10-04T00:00Z", to: "2026-10-05T12:00Z" }).hours, 36);
  assert.equal(timeTools({ action: "add", time: "2026-10-04T00:00Z", days: 1, hours: 2 }).result_utc, "2026-10-05T02:00:00.000Z");
  assert.throws(() => timeTools({ action: "convert", from_tz: "Mars/Olympus" }), /IANA/);
  const mon = marketHours({ market: "NYSE,HKEX,CRYPTO", at: "2026-10-05T05:00:00Z" }); // Mon 01:00 NY, 13:00 HK (lunch 12:00-13:00 ends)
  assert.equal(mon.markets[0].open_now, false); assert.equal(mon.markets[0].next_open_utc, "2026-10-05T13:30:00.000Z");
  assert.equal(mon.markets[1].open_now, true); assert.equal(mon.markets[2].open_now, true);
  assert.equal(marketHours({ market: "HKEX", at: "2026-10-05T04:30:00Z" }).markets[0].open_now, false, "HK lunch break");
  assert.equal(marketHours({ market: "LSE", at: "2026-10-03T10:00:00Z" }).markets[0].open_now, false, "Saturday");
  assert.match(mon.caveat, /holidays/); assert.throws(() => marketHours({ market: "XXX" }), /market/);
});

test("unit_convert, calculate (no eval), text_tools, json_validate, uuid_hash", () => {
  assert.equal(unitConvert({ value: 212, from: "F", to: "C" }).result, 100); assert.equal(unitConvert({ value: 1, from: "mile", to: "km" }).result, 1.609344);
  assert.equal(unitConvert({ value: 1, from: "GiB", to: "MB" }).result, 1073.741824); assert.throws(() => unitConvert({ value: 1, from: "kg", to: "km" }), /can.t convert/); assert.throws(() => unitConvert({ value: 1, from: "constructor", to: "toString" }), /can.t convert/);
  for (const [e, v] of [["(2+3)*4^2/sqrt(16)", 20], ["15% * 80", 12], ["2^3^2", 512], ["-2^2", -4], ["5!", 120], ["max(1,2,3)", 3], ["10 % 3", 1]]) assert.equal(calculate({ expression: e }).result, v, e);
  for (const bad of ["process.exit()", "constructor", "constructor(1)", "__proto__", "1;2", "require('fs')", "a=1", "this"]) assert.throws(() => calculate({ expression: bad }), /bad|unknown|unexpected/i, bad);
  assert.equal(textTools({ action: "slugify", text: "Héllo, Agent World!" }).result, "hello-agent-world");
  assert.equal(textTools({ action: "case", text: "my tool name" }).camel, "myToolName");
  assert.equal(textTools({ action: "base64_decode", text: textTools({ action: "base64_encode", text: "hi ✓" }).result }).result, "hi ✓");
  assert.deepEqual(textTools({ action: "extract_urls", text: "see https://a.example/x and http://b.example." }).urls, ["https://a.example/x", "http://b.example."]);
  const schema = { type: "object", required: ["id", "tags"], properties: { id: { type: "integer", minimum: 1 }, email: { type: "string", format: "email" }, tags: { type: "array", items: { $ref: "#/$defs/tag" }, uniqueItems: true } }, additionalProperties: false, $defs: { tag: { type: "string", pattern: "^[a-z-]+$" } } };
  assert.equal(jsonValidate({ schema, data: { id: 1, tags: ["a-b"] } }).valid, true);
  const bad = jsonValidate({ schema, data: { id: 0, email: "nope", tags: ["A", "A"], extra: 1 } });
  assert.equal(bad.valid, false); for (const p of ["/id", "/email", "/tags/0", "/extra"]) assert.ok(bad.errors.some((e) => e.path === p), p);
  assert.equal(jsonValidate({ json: "{bad" }).valid_json, false);
  assert.equal(uuidHash({ action: "hash", input: "abc" }).digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.match(uuidHash({ action: "uuid" }).uuids[0], /^[0-9a-f-]{36}$/);
});

test("url_metadata: SSRF protection (private IPs, metadata IP, ports, schemes, DNS to private, redirects) and untrusted output", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(ipIsPublic(ip), false, ip);
  assert.equal(ipIsPublic("93.184.215.14"), true);
  for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://localhost/", "https://example.com:8443/", "ftp://example.com/", "file:///etc/passwd", "http://user:pw@example.com/"])
    await assert.rejects(safeFetchText(u), (e) => ["blocked_ip", "blocked_host", "bad_port", "bad_url"].includes(e.code), u);
  const evilDns = async () => [{ address: "10.0.0.5", family: 4 }];
  await assert.rejects(safeFetchText("http://rebind.example/", { lookup: evilDns }), (e) => e.code === "blocked_ip");
  const meta = extractMeta(`<html lang="en"><head><title>Agent &amp; Co</title><meta name="description" content="We build agents"><meta property="og:image" content="/x.png"><link rel="canonical" href="/home"></head>`, "https://a.example/p");
  assert.equal(meta.title, "Agent & Co"); assert.equal(meta.description, "We build agents"); assert.equal(meta.canonical, "https://a.example/home"); assert.equal(meta.lang, "en");
  const out = await urlMetadata({ url: "https://a.example/" }, { ip: "t1", fetchText: async (u) => ({ url: u, status: 200, content_type: "text/html", text: "<title>Hi</title>", redirects: [] }) });
  assert.equal(out.trust, TRUST_LABEL); assert.equal(out.content.title, "Hi");
  for (let i = 0; i < 10; i++) await urlMetadata({ url: "https://a.example/" }, { ip: "t2", fetchText: async (u) => ({ url: u, status: 200, content_type: "text/plain", text: "x", redirects: [] }) }).catch(() => {});
  await assert.rejects(urlMetadata({ url: "https://a.example/" }, { ip: "t2", fetchText: async () => ({}) }), (e) => e.code === "rate_limited");
});

test("utilities are free, keyless MCP tools and run on the stateless fast path (no storage reads or writes)", async () => {
  const { h } = fresh();
  for (const u of UTILITIES) { const t = TOOLS.find((x) => x.name === u.name); assert.ok(t && t.free && t.auth === false && t.stateless, u.name); }
  assert.equal((await callTool(h, "calculate", { expression: "6*7" })).result, 42);
  assert.ok(isStateless("GET", "/v1/free/market_hours?market=NYSE"));
  assert.ok(isStateless("POST", "/v1/free/json_validate", Buffer.from("{}")));
  assert.ok(isStateless("POST", "/mcp", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "unit_convert", arguments: {} } }))));
  assert.ok(!isStateless("GET", "/v1/commons/rooms/general"));
});

test("tools catalog indexes directory listings + Haven tools by capability", () => {
  const { h } = fresh();
  h.S.listings.ls_a = { id: "ls_a", status: "unclaimed", name: "Web Search API", description: "Real-time web search results as JSON", tags: ["x402", "web-search", "search"], skills: [], endpoints: { x402: "https://ws.example/search" }, sources: [{ source: "x402_bazaar" }], domain: "ws.example" };
  h.S.listings.ls_b = { id: "ls_b", status: "unclaimed", name: "Roomcomm", description: "Rooms and chat for agents", tags: ["a2a", "rooms", "chat"], skills: [{ id: "create_room", name: "create_room", tags: [] }], endpoints: { a2a: "https://rc.example/a2a" }, accepts_tasks: true, sources: [{ source: "a2aregistry_org" }], domain: "rc.example" };
  const caps = h.toolCapabilities("https://h"); assert.ok(caps.capabilities.some((c) => c.id === "web-search")); assert.ok(caps.total_entries >= 13);
  const r = h.findTools({ q: "search the web" }, "https://h"); assert.equal(r.results[0].id, "ls_a"); assert.match(r.results[0].pricing, /x402/); assert.equal(r.results[0].trust, "untrusted_listing_text");
  assert.ok(h.findTools({ capability: "agent-communication" }, "https://h").results.some((e) => e.id === "ls_b"));
  assert.ok(h.findTools({ q: "convert miles to km" }, "https://h").results.some((e) => e.name === "unit_convert"));
  assert.ok(h.findTools({ q: "position size risk" }, "https://h").results.some((e) => e.status === "planned"));
  assert.ok(h.findTools({ free_only: true }, "https://h").results.every((e) => String(e.pricing).startsWith("free")));
});

test("agent card advertises no x402 while payments are off; utilities and Commons are listed", () => {
  for (const v of ["1.0", "0.3"]) { const c = agentCard("https://h", v); const s = JSON.stringify(c);
    assert.doesNotMatch(s, /x402/i); assert.equal(c.capabilities.extensions, undefined);
    for (const id of ["find_tools", "read_room", "post_to_room", "search_lessons", "market_hours", "url_metadata"]) assert.ok(c.skills.some((k) => k.id === id), id);
    assert.ok(!c.skills.find((k) => k.id === "read_room").securityRequirements && !c.skills.find((k) => k.id === "read_room").security, "optional-auth skills don't demand a key"); }
});

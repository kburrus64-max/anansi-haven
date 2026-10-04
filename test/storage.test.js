import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryAdapter, FileAdapter, BlobAdapter, RedisAdapter, withHaven, ConflictError, BudgetError } from "../src/storage.js";
import { makeServerlessHandler } from "../src/serverless.js";

// Fake @vercel/blob client with real ETag/ifMatch semantics.
function fakeBlob() {
  const store = new Map(); let n = 0; const calls = { get: 0, put: 0 };
  class BlobPreconditionFailedError extends Error {}
  return { calls, store, BlobPreconditionFailedError,
    async get(p) { calls.get++; const v = store.get(p); if (!v) return null; return { statusCode: 200, stream: new Blob([v.raw]).stream(), blob: { etag: v.etag } }; },
    async put(p, raw, o) { calls.put++; const cur = store.get(p);
      if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw new BlobPreconditionFailedError("Precondition failed: ETag mismatch");
      if (!o.ifMatch && cur && !o.allowOverwrite) throw new Error("This blob already exists");
      const etag = `"e${++n}"`; store.set(p, { raw, etag }); return { etag, pathname: p }; } };
}
// Fake Upstash REST endpoint implementing MGET + the CAS script semantics.
function fakeUpstash() {
  const kv = new Map();
  return { kv, fetchImpl: async (url, init) => { const a = JSON.parse(init.body); let result;
    if (a[0] === "MGET") result = a.slice(1).map((k) => kv.get(k) ?? null);
    else if (a[0] === "EVAL") { const [, , , kState, kVer, expect, doc] = a; if ((kv.get(kVer) || "0") === expect) { kv.set(kState, doc); kv.set(kVer, String(Number(kv.get(kVer) || 0) + 1)); result = Number(kv.get(kVer)); } else result = -1; }
    return { json: async () => ({ result }) }; } };
}

async function roundTrip(adapter) {
  const reg = await withHaven(adapter, (h) => h.registerAgent({ name: "persist-me", ip: "t" }));
  await withHaven(adapter, (h) => h.putMemory(h.auth(reg.api_key), "k", { v: 1 }));
  const got = await withHaven(adapter, (h) => h.getMemory(h.auth(reg.api_key), "k"));
  assert.deepEqual(got.value, { v: 1 });
  assert.ok(Object.keys((await adapter.load({ fresh: true })).state.market).length > 0, "first transaction seeded the market");
}

test("storage: memory, file, blob and redis adapters persist a full round trip", async () => {
  await roundTrip(new MemoryAdapter());
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "haven-")), "s.json");
  await roundTrip(new FileAdapter(f)); assert.ok(fs.existsSync(f));
  await roundTrip(new BlobAdapter({ client: fakeBlob() }));
  const up = fakeUpstash(); await roundTrip(new RedisAdapter({ url: "https://x", token: "t", fetchImpl: up.fetchImpl }));
  assert.equal(up.kv.get("haven:ver"), "2", "seed+register, then put; reads never write");
});

test("storage: read-only requests do not write; conflicting writers both land (optimistic retry)", async () => {
  const a = new MemoryAdapter();
  await withHaven(a, (h) => h.listJobs({})); const c0 = a.commits; // seeding commit
  await withHaven(a, (h) => h.listJobs({})); assert.equal(a.commits, c0, "no write for reads");
  // Two writers loaded the same version; the second one must retry and keep both agents.
  let gate; const wait = new Promise((r) => (gate = r)); let first = true;
  const slow = withHaven(a, async (h) => { const r = h.registerAgent({ name: "slow", ip: "1" }); if (first) { first = false; await wait; } return r; });
  await new Promise((r) => setTimeout(r, 5));
  await withHaven(a, (h) => h.registerAgent({ name: "fast", ip: "2" }));
  gate(); await slow;
  const names = Object.values((await a.load()).state.agents).map((x) => x.name).sort();
  assert.deepEqual(names, ["fast", "slow"]);
});

test("storage: blob adapter uses ifMatch, caches reads and fails closed at its op budget", async () => {
  const fb = fakeBlob(); let t = 0;
  const a = new BlobAdapter({ client: fb, now: () => t, readTtlMs: 1000, budget: { putsPerDay: 3 } });
  await withHaven(a, (h) => h.registerAgent({ name: "one", ip: "x" })); // seed+register in one put
  const gets = fb.calls.get;
  await withHaven(a, (h) => h.listJobs({})); assert.equal(fb.calls.get, gets, "warm read served from cache");
  // Another instance writes behind our back -> our next write hits 412, re-reads, retries, succeeds.
  const other = new BlobAdapter({ client: fb, now: () => t });
  await withHaven(other, (h) => h.registerAgent({ name: "two", ip: "y" }));
  await withHaven(a, (h) => h.registerAgent({ name: "three", ip: "z" }));
  const st = JSON.parse(fb.store.get("haven/state.json").raw);
  assert.deepEqual(Object.values(st.agents).map((x) => x.name).sort(), ["one", "three", "two"]);
  assert.equal(st.storageOps.puts["1970-01-01"], 3);
  await assert.rejects(withHaven(a, (h) => h.registerAgent({ name: "four", ip: "w" })), (e) => e instanceof BudgetError && e.status === 503);
  assert.ok(new ConflictError().code === "conflict");
});

test("serverless handler: HTTP + MCP + A2A over a shared adapter survive a fresh instance", async () => {
  const adapter = new MemoryAdapter();
  const call = async (method, url, body, headers = {}) => {
    const handler = makeServerlessHandler({ adapter, publicBase: "https://haven.test" });
    const req = { method, url, headers: { "content-type": "application/json", ...headers }, socket: {}, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
    const res = { status: 0, headers: {}, body: "", writeHead(s, h) { this.status = s; Object.assign(this.headers, h); }, end(b) { this.body = b; } };
    await handler(req, res); return { status: res.status, json: res.body ? JSON.parse(res.body) : null, headers: res.headers };
  };
  const card = await call("GET", "/.well-known/agent-card.json"); assert.equal(card.status, 200);
  assert.match(JSON.stringify(card.json), /https:\/\/haven\.test\/a2a/);
  const reg = await call("POST", "/v1/agents", { name: "sv" }, { "x-forwarded-for": "9.9.9.9" }); assert.equal(reg.status, 201);
  const key = reg.json.api_key;
  assert.equal((await call("PUT", "/v1/home/memory/x", { value: 42 }, { authorization: `Bearer ${key}` })).status, 200);
  const mcp = await call("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_memory", arguments: { key: "x" } } }, { authorization: `Bearer ${key}` });
  assert.equal(mcp.json.result.structuredContent.value, 42);
  const a2a = await call("POST", "/a2a", { jsonrpc: "2.0", id: 2, method: "SendMessage", params: { message: { messageId: "m1", role: "ROLE_USER", parts: [{ text: "jobs" }] } } });
  assert.ok(a2a.json.result);
  assert.equal((await call("OPTIONS", "/mcp")).status, 204);
});

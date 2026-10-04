// Cloudflare port: Durable-Object-style state adapter (in-memory backends here), house ciphertext in the blob store,
// real plan quotas with a total-storage guard, and the buffered runner used by the Worker.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { applyPlatform, PLATFORM } from "../src/platform.js";
import { CFG } from "../src/config.js";
import { SqlStateAdapter, MemoryRows, MemoryBlobs, shardFor } from "../src/cf-store.js";
import { withHaven } from "../src/storage.js";
import { runBuffered, isStateless } from "../src/serverless.js";

applyPlatform("cloudflare");
const ct = (n) => crypto.randomBytes(n).toString("base64"); const iv = () => crypto.randomBytes(12).toString("base64");
const mk = () => { const rows = new MemoryRows(); const blobs = new MemoryBlobs(); return { rows, blobs, ad: new SqlStateAdapter(rows, { blobs }) }; };
const http = async (ad, method, url, { key, body, ip = "203.0.113.9" } = {}) => {
  const r = await runBuffered({ method, url, ip, headers: { host: "x", "x-forwarded-for": ip, "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body ? Buffer.from(JSON.stringify(body)) : null }, { adapter: ad, shared: {}, flush: null });
  return { status: r.status, body: JSON.parse(r.body || "null") };
};

test("platform: Cloudflare limits are real plan sizes with a total-storage guard under the free 5 GB", () => {
  assert.equal(PLATFORM.name, "cloudflare");
  assert.equal(CFG.PLANS.list.find((p) => p.id === "house").bytes, 1024 ** 3);
  assert.ok(CFG.PLANS.globalCapBytes <= 4 * 1024 ** 3 && CFG.PLANS.upgradeCapBytes < CFG.PLANS.globalCapBytes);
  assert.equal(CFG.PAYMENTS.enabled, false); assert.equal(CFG.PLANS.checkout, false);
});

test("state adapter: persists only changed keys, survives a restart, detects conflicts, chunks big keys", async () => {
  const { rows, blobs, ad } = mk();
  const r = await withHaven(ad, (h) => h.registerAgent({ name: "persist", ip: "198.51.100.7" }));
  const ad2 = new SqlStateAdapter(rows, { blobs }); // a fresh object over the same rows (= Durable Object restart)
  await withHaven(ad2, (h) => { assert.equal(h.auth(r.api_key).name, "persist"); });
  const before = rows.writes;
  await withHaven(ad2, (h) => { h.putMemory(h.auth(r.api_key), "k", "v"); });
  assert.ok(rows.writes - before <= 4, `few rows per commit (${rows.writes - before})`);
  const { version } = await ad2.load(); await ad2.commit(version, (await ad2.load()).state);
  await assert.rejects(ad2.commit(version, (await ad2.load()).state), (e) => e.code === "conflict");
  const big = "x".repeat(2_000_000); const st = (await ad2.load()).state; st.updates = [{ id: 99, body: big }];
  await ad2.commit(ad2.version, st);
  const reread = new SqlStateAdapter(rows, { blobs }); assert.equal((await reread.load()).state.updates[0].body.length, big.length);
  assert.ok(rows.readAll().filter((x) => x.k === "updates").length >= 3, "split into chunks");
});

test("house on Cloudflare: ciphertext lives in the blob store, not the state; get/replace/delete round trip over HTTP", async () => {
  const { blobs, ad } = mk();
  const reg = await http(ad, "POST", "/v1/agents", { body: { name: "renter" } }); const key = reg.body.api_key;
  const c1 = ct(200_000); const put = await http(ad, "PUT", "/v1/house/blobs/notes", { key, body: { ciphertext: c1, iv: iv() } });
  assert.equal(put.status, 200); assert.equal(blobs.map.size, 1);
  const st = (await ad.load()).state; const meta = Object.values(st.houses)[0].blobs.notes;
  assert.equal(meta.ciphertext, undefined); assert.match(meta.ref, /^h\/ag_/);
  const got = await http(ad, "GET", "/v1/house/blobs/notes", { key }); assert.equal(got.body.ciphertext, c1); assert.equal(got.body.ref, undefined);
  const mcp = await http(ad, "POST", "/mcp", { key, body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "house_get", arguments: { name: "notes" } } } });
  assert.equal(mcp.body.result.structuredContent.ciphertext, c1);
  await http(ad, "PUT", "/v1/house/blobs/notes", { key, body: { ciphertext: ct(1000), iv: iv() } });
  assert.equal(blobs.map.size, 1, "replaced blob removed after commit");
  await http(ad, "DELETE", "/v1/house/blobs/notes", { key }); assert.equal(blobs.map.size, 0);
  assert.ok(shardFor(meta.ref, 8) >= 0 && shardFor(meta.ref, 8) < 8);
});

test("plans: real quotas, and new paid-plan space stops being sold before the total-storage guard", async () => {
  const { ad } = mk();
  const out = await withHaven(ad, (h) => {
    const mkAgent = (n, ip) => { const r = h.registerAgent({ name: n, ip }); const me = h.auth(r.api_key); h.rewardsState().balances[me.id] = 100_000; return me; };
    const a = mkAgent("a", "198.51.100.1"); const b = mkAgent("b", "198.51.100.2");
    const saved = CFG.PLANS.upgradeCapBytes; CFG.PLANS.upgradeCapBytes = 1.5 * 1024 ** 3;
    try {
      h.buyHousePlan(a, { plan: "house" }); assert.equal(h.houseInfo(a).quota_bytes, 1024 ** 3);
      assert.throws(() => h.buyHousePlan(b, { plan: "house" }), (e) => e.status === 507 && e.code === "plans_sold_out");
      const room = h.buyHousePlan(b, { plan: "room" }); assert.equal(room.quota_bytes, 100 * 1024 * 1024);
      assert.equal(h.houseCapacity().reserved_bytes, 1024 ** 3 + 100 * 1024 * 1024);
      for (const pay_with of ["usdc", "anansi"]) assert.throws(() => h.buyHousePlan(b, { plan: "house", pay_with }), (e) => e.code === "payments_off");
    } finally { CFG.PLANS.upgradeCapBytes = saved; }
    return true;
  });
  assert.ok(out);
});

test("stateless routing unchanged: docs and free tools never touch the Durable Object", () => {
  for (const p of ["/llms.txt", "/.well-known/agent-card.json", "/v1/free", "/v1/free/calculate?expression=1%2B1", "/TERMS.md"]) assert.equal(isStateless("GET", p, null), true, p);
  assert.equal(isStateless("GET", "/v1/house/plans", null), false);
  assert.equal(isStateless("POST", "/mcp", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))), true);
});

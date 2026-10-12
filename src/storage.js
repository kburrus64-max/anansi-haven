// Storage adapters for serverless deployments. The Haven core stays synchronous over one in-memory state
// object; these adapters load that state before a request and commit it afterwards with optimistic
// concurrency (compare-and-swap on a version/ETag). A conflicting commit re-runs the whole request.
//
//   MemoryAdapter  tests
//   FileAdapter    local single process (same JSON file format as src/store.js)
//   BlobAdapter    Vercel Blob, one private JSON document, conditional put (ifMatch ETag) + op budget guard
//   RedisAdapter   Upstash Redis REST (zero-dep fetch), Lua compare-and-set on a version counter
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Store, emptyState } from "./store.js";
import { Haven } from "./core.js";
import { seed } from "./seed.js";

export class ConflictError extends Error { constructor(m = "version conflict") { super(m); this.code = "conflict"; } }
export class BudgetError extends Error {
  constructor(m) { super(m); this.code = "storage_budget"; this.status = 503; }
}
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
// Blob GETs of compressible documents come back gzip'd with a WEAK ETag (W/"..."), but conditional puts compare
// against the strong ETag. Sending the weak form made every commit 412 forever (the live "busy" bug), so normalize.
export const strongEtag = (e) => (e ? String(e).replace(/^W\//, "") : e);

export class MemoryAdapter {
  constructor(initial = null) { this.doc = initial ? JSON.stringify(initial) : null; this.version = initial ? 1 : 0; this.commits = 0; }
  async load() { return { state: this.doc ? JSON.parse(this.doc) : null, version: this.version }; }
  async commit(version, state) {
    if (version !== this.version) throw new ConflictError();
    this.doc = JSON.stringify(state); this.version += 1; this.commits += 1; return this.version;
  }
}

export class FileAdapter {
  constructor(file) { this.file = file; }
  async load() {
    if (!fs.existsSync(this.file)) return { state: null, version: "none" };
    const raw = fs.readFileSync(this.file, "utf8"); return { state: JSON.parse(raw), version: hash(raw) };
  }
  async commit(version, state) {
    const cur = fs.existsSync(this.file) ? hash(fs.readFileSync(this.file, "utf8")) : "none";
    if (cur !== version) throw new ConflictError();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const raw = JSON.stringify(state); const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, raw); fs.renameSync(tmp, this.file); return hash(raw);
  }
}

// Vercel Blob. Hobby limits are team-wide (2,000 puts and 10,000 uncached reads a month; exceeding them locks
// Blob for 30 days for every project on the team, including other products). So this adapter:
//   - keeps the whole state in ONE private blob (1 put per write request, 0-1 reads per request)
//   - serves reads from a warm-instance cache for readTtlMs, and writes optimistically with the cached ETag
//     (a stale cache just produces a 412 and one fresh read)
//   - counts its own puts/reads in the document and fails closed (503) before the monthly/daily budget
export class BlobAdapter {
  constructor({ client, pathname = "haven/state.json", readTtlMs = 20_000, budget = {}, now = () => Date.now() } = {}) {
    this.clientP = client ? Promise.resolve(client) : null; this.pathname = pathname; this.readTtlMs = readTtlMs; this.now = now;
    this.budget = { putsPerMonth: 1200, putsPerDay: 120, readsPerMonth: 6000, ...budget };
    this.cache = null; // { raw, etag, at }
    this.pendingReads = 0;
  }
  async client() { const mod = "@vercel/blob"; return (this.clientP ||= import(mod)); } // non-literal: bundlers for other hosts skip it
  async freshRead() {
    const c = await this.client();
    const m = month(this.now());
    if (this.cache) { const used = (JSON.parse(this.cache.raw).storageOps?.reads?.[m] || 0) + this.pendingReads; if (used >= this.budget.readsPerMonth) throw new BudgetError("storage read budget for this month reached; try again later"); }
    this.pendingReads += 1;
    const r = await c.get(this.pathname, { access: "private", useCache: false });
    if (!r) { this.cache = { raw: null, etag: null, at: this.now() }; return this.cache; }
    const raw = await new Response(r.stream).text();
    this.cache = { raw, etag: strongEtag(r.blob.etag), at: this.now() }; return this.cache;
  }
  async load({ fresh = false } = {}) {
    const c = (!fresh && this.cache && this.now() - this.cache.at < this.readTtlMs) ? this.cache : await this.freshRead();
    return { state: c.raw ? JSON.parse(c.raw) : null, version: c.etag || "none" };
  }
  async commit(version, state) {
    const c = await this.client(); const m = month(this.now()); const d = today(this.now());
    const ops = (state.storageOps ||= { puts: {}, reads: {} });
    const putsM = (ops.puts[m] || 0) + 1; const putsD = (ops.puts[d] || 0) + 1;
    if (putsM > this.budget.putsPerMonth || putsD > this.budget.putsPerDay) throw new BudgetError("storage write budget reached (free beta limits); writes resume tomorrow / next month");
    ops.puts[m] = putsM; ops.puts[d] = putsD; ops.reads[m] = (ops.reads[m] || 0) + this.pendingReads;
    for (const k of Object.keys(ops.puts)) if (k.length === 10 && k < d) delete ops.puts[k];
    const raw = JSON.stringify(state);
    const opts = { access: "private", addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 };
    if (version && version !== "none") opts.ifMatch = strongEtag(version); else opts.allowOverwrite = false;
    try {
      const r = await c.put(this.pathname, raw, opts);
      this.pendingReads = 0; this.cache = { raw, etag: strongEtag(r.etag), at: this.now() }; return strongEtag(r.etag);
    } catch (e) {
      const name = e?.constructor?.name || ""; const msg = String(e?.message || "");
      if (name === "BlobPreconditionFailedError" || /precondition|already exists|412/i.test(msg)) { this.cache = null; throw new ConflictError(); }
      throw e;
    }
  }
  invalidate() { this.cache = null; }
}

// Upstash Redis over its REST API (no SDK). State lives in one key; a version key guards commits.
const CAS = "if (redis.call('GET', KEYS[2]) or '0') == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]); return redis.call('INCR', KEYS[2]) else return -1 end";
export class RedisAdapter {
  constructor({ url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN, prefix = "haven:", fetchImpl = globalThis.fetch } = {}) {
    if (!url || !token) throw new Error("RedisAdapter needs KV_REST_API_URL and KV_REST_API_TOKEN");
    Object.assign(this, { url: url.replace(/\/$/, ""), token, prefix, fetchImpl });
  }
  async cmd(args) {
    const r = await this.fetchImpl(this.url, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(10_000) });
    const j = await r.json(); if (j.error) throw new Error(`redis: ${j.error}`); return j.result;
  }
  async load() {
    const [doc, ver] = await this.cmd(["MGET", `${this.prefix}state`, `${this.prefix}ver`]);
    return { state: doc ? JSON.parse(doc) : null, version: String(ver || "0") };
  }
  async commit(version, state) {
    const r = await this.cmd(["EVAL", CAS, "2", `${this.prefix}state`, `${this.prefix}ver`, String(version), JSON.stringify(state)]);
    if (Number(r) < 0) throw new ConflictError(); return String(r);
  }
}

export function adapterFromEnv(env = process.env) {
  const kind = env.HAVEN_STORE || (env.KV_REST_API_URL ? "redis" : env.BLOB_READ_WRITE_TOKEN ? "blob" : "file");
  if (kind === "redis") return new RedisAdapter();
  if (kind === "blob") return new BlobAdapter({ pathname: env.HAVEN_BLOB_PATH || "haven/state.json" });
  if (kind === "memory") return new MemoryAdapter();
  return new FileAdapter(env.HAVEN_DATA || new URL("../data/haven.json", import.meta.url).pathname);
}

// Run fn(haven) as one transaction: load, run, commit if anything changed, retry on conflict.
// fn may be async (outbound fetches are fine; they simply re-run on a conflict).
// beforeCommit(haven) runs only when the request already changed state (so piggybacked data never causes a write);
// it may return an undo() that is called if the commit fails.
export async function withHaven(adapter, fn, { retries = 4, now, beforeCommit, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { state, version } = await adapter.load({ fresh: attempt > 0 });
    const store = new Store(null);
    store.state = state ? { ...emptyState(), ...state } : emptyState();
    const haven = new Haven({ store, ...(now ? { now } : {}), blobs: adapter.blobs || null });
    const seeded = !state || !Object.keys(store.state.market || {}).length ? seed(haven) : false;
    const before = seeded ? null : JSON.stringify(store.state);
    const out = await fn(haven);
    const after = JSON.stringify(store.state);
    if (after === before) return out;
    let undo = null; try { undo = beforeCommit ? beforeCommit(haven) : null; } catch { undo = null; }
    try { await adapter.commit(version, store.state, haven); return out; }
    catch (e) { try { undo?.(); } catch { /* ignore */ } if (e.code !== "conflict") throw e; lastErr = e; adapter.invalidate?.(); await sleep(20 + Math.random() * 80 * (attempt + 1)); }
  }
  throw Object.assign(lastErr || new ConflictError(), { status: 503, message: "busy: too many concurrent writes, retry shortly" });
}

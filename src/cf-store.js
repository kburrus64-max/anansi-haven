// Cloudflare storage (no Cloudflare imports here, so Node tests can exercise it with in-memory backends).
//
// State: one SQLite-backed Durable Object ("main") owns the Haven state. It keeps the parsed top-level keys in
// memory as JSON strings and persists only the keys a request changed, as rows of (key, chunk, json) so no row
// passes SQLite's 2 MB value limit. Commits are compare-and-swap on an in-memory version, so async requests that
// interleave inside the object (outbound fetches) simply re-run on a conflict, exactly like the Vercel adapter.
//
// House ciphertext: sharded blob Durable Objects (each object is capped at 1 GB on the free plan). Keys are
// content-addressed (agent / name-hash / sha256), so a retried request re-writes the same key and never orphans.
// Blobs are written BEFORE the metadata commit and replaced/deleted blobs are removed AFTER it.
import { ConflictError, BudgetError } from "./storage.js";
import { CFG } from "./config.js";

const CHUNK = 900_000; // chars per row (JSON is mostly ASCII; well under the 2 MB row limit)
const month = (t) => new Date(t).toISOString().slice(0, 7);
const today = (t) => new Date(t).toISOString().slice(0, 10);

// backend: { readAll(): [{k, i, v}], writeTx(changed: {k: [chunks]}, deleted: [k]) } (synchronous, atomic)
export class SqlStateAdapter {
  constructor(backend, { blobs = null, now = () => Date.now(), budget } = {}) {
    this.backend = backend; this.blobs = blobs; this.now = now; this.version = 0; this.parts = null;
    this.budget = budget || { perDay: CFG.STORAGE?.commitsPerDay ?? 15_000, perMonth: CFG.STORAGE?.commitsPerMonth ?? 450_000 };
    this.stats = { commits: 0, rows: 0 };
  }
  ensure() {
    if (this.parts) return;
    const acc = {};
    for (const { k, i, v } of this.backend.readAll()) (acc[k] ||= [])[i] = v;
    this.parts = Object.fromEntries(Object.entries(acc).map(([k, arr]) => [k, arr.join("")]));
  }
  isEmpty() { this.ensure(); return !Object.keys(this.parts).length; }
  async load() {
    this.ensure();
    if (!Object.keys(this.parts).length) return { state: null, version: this.version };
    const state = {}; for (const [k, v] of Object.entries(this.parts)) state[k] = JSON.parse(v);
    return { state, version: this.version };
  }
  // Replace the whole state (one-time migration). Returns per-key sizes.
  replaceAll(state) {
    this.ensure();
    const next = {}; for (const [k, v] of Object.entries(state)) if (v !== undefined) next[k] = JSON.stringify(v);
    const changed = {}; for (const [k, v] of Object.entries(next)) changed[k] = split(v);
    const deleted = Object.keys(this.parts).filter((k) => !(k in next));
    this.backend.writeTx(changed, deleted); this.parts = next; this.version += 1;
    return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.length]));
  }
  async commit(version, state, haven) {
    this.ensure();
    if (version !== this.version) throw new ConflictError();
    const t = this.now(); const m = month(t); const d = today(t);
    const ops = (state.storageOps ||= { puts: {}, reads: {} });
    const putsM = (ops.puts[m] || 0) + 1; const putsD = (ops.puts[d] || 0) + 1;
    if (putsM > this.budget.perMonth || putsD > this.budget.perDay) throw new BudgetError("storage write budget reached (free-tier limits); writes resume after 00:00 UTC");
    ops.puts[m] = putsM; ops.puts[d] = putsD;
    for (const k of Object.keys(ops.puts)) if (k.length === 10 && k < d) delete ops.puts[k];
    const next = {}; for (const [k, v] of Object.entries(state)) if (v !== undefined) next[k] = JSON.stringify(v);
    const changed = {}; for (const [k, v] of Object.entries(next)) if (this.parts[k] !== v) changed[k] = split(v);
    const deleted = Object.keys(this.parts).filter((k) => !(k in next));
    const blobOps = haven?.blobOps || [];
    const puts = blobOps.filter((o) => o.op === "put"); const dels = blobOps.filter((o) => o.op === "del");
    if (puts.length) {
      if (!this.blobs) throw Object.assign(new Error("blob store not configured"), { status: 503, code: "blob_unavailable" });
      for (const o of puts) await this.blobs.put(o.key, o.data);
      if (version !== this.version) throw new ConflictError(); // someone committed while we were writing blobs
    }
    this.backend.writeTx(changed, deleted);
    this.parts = next; this.version += 1; this.stats.commits += 1; this.stats.rows += Object.values(changed).reduce((n, c) => n + c.length, 0) + deleted.length;
    // replaced/deleted blobs: only if no remaining metadata points at them (content-addressed keys can repeat)
    if (dels.length && this.blobs) {
      const live = new Set(); for (const h of Object.values(state.houses || {})) for (const b of Object.values(h.blobs || {})) if (b.ref) live.add(b.ref);
      for (const o of dels) if (!live.has(o.key)) { try { await this.blobs.del(o.key); } catch { /* best effort; orphan is harmless */ } }
    }
    return this.version;
  }
}
const split = (v) => { const out = []; for (let i = 0; i < v.length; i += CHUNK) out.push(v.slice(i, i + CHUNK)); return out.length ? out : [""]; };

// In-memory backends for tests / local runs.
export class MemoryRows {
  constructor() { this.rows = new Map(); this.writes = 0; }
  readAll() { return [...this.rows.entries()].map(([key, v]) => { const [k, i] = JSON.parse(key); return { k, i, v }; }); }
  writeTx(changed, deleted) {
    for (const k of [...Object.keys(changed), ...deleted]) for (const key of [...this.rows.keys()]) if (JSON.parse(key)[0] === k) this.rows.delete(key);
    for (const [k, chunks] of Object.entries(changed)) chunks.forEach((v, i) => { this.rows.set(JSON.stringify([k, i]), v); this.writes += 1; });
  }
}
export class MemoryBlobs {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k) ?? null; }
  async put(k, v) { this.map.set(k, v); }
  async del(k) { this.map.delete(k); }
}
// Pick a blob shard from the content hash at the end of the key.
export const shardFor = (key, n) => parseInt(String(key).slice(-8), 16) % n;

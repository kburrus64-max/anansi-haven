// Cloudflare Workers entry (free plan). Routes are the same as the Vercel function (src/app.js does the routing).
//   - Stateless requests (docs, agent card, MCP handshake, key-less free tools) run right here: no storage at all.
//   - Everything else goes to ONE SQLite-backed Durable Object ("main") that owns the Haven state, so writes are
//     serialized and strongly consistent (src/cf-store.js). House ciphertext lives in sharded HavenBlobs objects.
// Only "cloudflare:workers" is imported statically: app modules read process.env at load time, so they are loaded
// lazily after the Worker's vars/secrets are copied into process.env.
import { DurableObject } from "cloudflare:workers";

const PASS_ENV = ["PUBLIC_BASE_URL", "HAVEN_ADMIN_TOKEN", "HAVEN_PASSPORT_SECRET", "HAVEN_CLAIM_VERIFY", "BASE_RPC_URL", "HAVEN_ALLOW_IMPORT"];
let M = null;
async function boot(env) {
  if (M) return M;
  for (const k of PASS_ENV) if (typeof env[k] === "string" && env[k]) process.env[k] = env[k];
  process.env.HAVEN_PLATFORM = "cloudflare";
  const platform = await import("./platform.js"); platform.applyPlatform("cloudflare");
  const [sv, cf, tm, st, store] = await Promise.all([import("./serverless.js"), import("./cf-store.js"), import("./telemetry.js"), import("./storage.js"), import("./store.js")]);
  M = { sv, cf, tm, st, store };
  return M;
}
const enc = new TextEncoder();
function safeEqual(a, b) {
  const x = enc.encode(String(a || "")); const y = enc.encode(String(b || ""));
  if (!x.length || x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}
const toResponse = (r) => new Response(r.status === 204 || r.status === 202 || r.body === "" ? null : r.body, { status: r.status, headers: r.headers });
const jsonRes = (status, body) => new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const mainStub = (env) => env.HAVEN.get(env.HAVEN.idFromName("main"));

export default {
  async fetch(request, env, ctx) {
    const { sv, tm } = await boot(env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return toResponse(sv.CORS_PREFLIGHT);
    let body = null;
    if (!["GET", "HEAD", "DELETE"].includes(request.method)) {
      const len = Number(request.headers.get("content-length") || 0); if (len > sv.MAX_BODY) return jsonRes(413, { error: "bad_body", message: "body too large" });
      const ab = await request.arrayBuffer(); if (ab.byteLength > sv.MAX_BODY) return jsonRes(413, { error: "bad_body", message: "body too large" });
      body = Buffer.from(ab);
    }
    // Client IP comes only from Cloudflare (never from a client-supplied X-Forwarded-For).
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const headers = {}; for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
    headers["x-forwarded-for"] = ip; headers["x-forwarded-proto"] = "https"; delete headers["x-forwarded-host"];
    const method = request.method === "HEAD" ? "GET" : request.method;
    const path = url.pathname + url.search;

    // ---- one-time migration + storage stats (admin token; import also needs HAVEN_ALLOW_IMPORT=1) ----
    if (url.pathname === "/admin/import-state" || url.pathname === "/admin/storage") {
      if (!env.HAVEN_ADMIN_TOKEN || !safeEqual(headers["x-admin-token"], env.HAVEN_ADMIN_TOKEN)) return jsonRes(403, { error: "forbidden" });
      if (url.pathname === "/admin/storage" && method === "GET") return jsonRes(200, await mainStub(env).storageStats());
      if (url.pathname === "/admin/import-state" && method === "POST") {
        if (env.HAVEN_ALLOW_IMPORT !== "1") return jsonRes(403, { error: "import_disabled" });
        return jsonRes(200, await mainStub(env).importState(body ? body.toString("utf8") : "", { replace: url.searchParams.get("replace") === "1" }));
      }
      return jsonRes(405, { error: "method_not_allowed" });
    }

    const r0 = { method, url: path, headers, ip };
    let out;
    if (sv.isStateless(method, path, body)) {
      out = await sv.runBuffered({ ...r0, body, stateless: true }, { adapter: null, flush: null });
      // Telemetry counted in this isolate is merged into the state at most every few minutes (capped per day).
      if (tm.pendingCalls() && tm.standaloneFlushDue()) {
        tm.noteStandaloneFlush(); const { snap, undo } = tm.takeBuffer();
        ctx.waitUntil(mainStub(env).mergeTelemetry(snap).catch(() => undo()));
      }
    } else {
      out = await mainStub(env).handle({ ...r0, body: body ? new Uint8Array(body) : null });
    }
    if (request.method === "HEAD") return new Response(null, { status: out.status, headers: out.headers });
    return toResponse(out);
  },
};

// Blob store client: content-addressed keys spread over N shard objects (each object holds at most 1 GB on free).
class ShardedBlobs {
  constructor(ns, n, shardFor) { this.ns = ns; this.n = n; this.shardFor = shardFor; }
  stub(key) { return this.ns.get(this.ns.idFromName(`blobs-${this.shardFor(key, this.n)}`)); }
  get(key) { return this.stub(key).get(key); }
  put(key, data) { return this.stub(key).put(key, data); }
  del(key) { return this.stub(key).del(key); }
  async stats() { const out = []; for (let i = 0; i < this.n; i++) out.push(await this.ns.get(this.ns.idFromName(`blobs-${i}`)).stats()); return out; }
}

export class HavenState extends DurableObject {
  async init() {
    if (this.adapter) return;
    const { cf } = await boot(this.env);
    const sql = this.ctx.storage.sql;
    // WITHOUT ROWID: the primary key is the table, so each upserted chunk is one row written (no extra index rows).
    sql.exec("CREATE TABLE IF NOT EXISTS state_kv (k TEXT NOT NULL, i INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (k, i)) WITHOUT ROWID");
    const backend = {
      readAll: () => sql.exec("SELECT k, i, v FROM state_kv").toArray(),
      writeTx: (changed, deleted) => this.ctx.storage.transactionSync(() => {
        for (const k of deleted) sql.exec("DELETE FROM state_kv WHERE k = ?", k);
        for (const [k, chunks] of Object.entries(changed)) {
          chunks.forEach((v, i) => sql.exec("INSERT INTO state_kv (k, i, v) VALUES (?, ?, ?) ON CONFLICT(k, i) DO UPDATE SET v = excluded.v", k, i, v));
          sql.exec("DELETE FROM state_kv WHERE k = ? AND i >= ?", k, chunks.length);
        }
      }),
    };
    const { CFG } = await import("./config.js");
    this.blobs = new ShardedBlobs(this.env.BLOBS, CFG.STORAGE.blobShards, cf.shardFor);
    this.adapter = new cf.SqlStateAdapter(backend, { blobs: this.blobs });
    this.shared = {};
  }
  async handle(r0) {
    await this.init();
    return M.sv.runBuffered({ ...r0, body: r0.body ? Buffer.from(r0.body) : null, stateless: false }, { adapter: this.adapter, shared: this.shared, flush: null });
  }
  async mergeTelemetry(snap) {
    await this.init(); const { tm, st } = M;
    await st.withHaven(this.adapter, (haven) => {
      if (tm.standaloneFlushAllowed(haven.S, haven.now())) { tm.countStandaloneFlush(haven.S, haven.now()); tm.mergeTelemetry(haven.S, snap); }
    });
    return true;
  }
  async importState(raw, { replace = false } = {}) {
    await this.init(); const { store } = M;
    if (!replace && !this.adapter.isEmpty()) return { error: "not_empty", message: "state already exists; pass replace=1 to overwrite" };
    let incoming; try { incoming = JSON.parse(raw); } catch { return { error: "bad_json" }; }
    if (!incoming || typeof incoming !== "object" || !incoming.agents || !incoming.ledger) return { error: "bad_state" };
    const state = { ...store.emptyState(), ...incoming };
    state.migratedFrom = { host: "vercel-blob", at: new Date().toISOString(), vercelStorageOps: incoming.storageOps || null };
    delete state.storageOps;
    let movedBlobs = 0; // inline house ciphertext (Vercel) moves into the blob store
    for (const [agentId, h] of Object.entries(state.houses || {})) for (const [name, b] of Object.entries(h.blobs || {})) if (b.ciphertext) {
      const key = `h/${agentId}/${await sha(name)}/${b.sha256}`; await this.blobs.put(key, b.ciphertext); delete b.ciphertext; b.ref = key; void name; movedBlobs += 1;
    }
    const sizes = this.adapter.replaceAll(state);
    const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : null);
    return { ok: true, moved_house_blobs: movedBlobs, counts: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, count(v)]).filter(([, n]) => n !== null)), bytes: Object.values(sizes).reduce((a, b) => a + b, 0) };
  }
  async storageStats() {
    await this.init(); const sql = this.ctx.storage.sql;
    const rows = sql.exec("SELECT COUNT(*) AS rows, COALESCE(SUM(LENGTH(v)), 0) AS bytes FROM state_kv").one();
    const { state } = await this.adapter.load();
    return { state: { ...rows, db_bytes: this.ctx.storage.sql.databaseSize, version: this.adapter.version, commits_since_start: this.adapter.stats.commits, rows_written_since_start: this.adapter.stats.rows, storage_ops: state?.storageOps || null },
      blobs: await this.blobs.stats() };
  }
}
async function sha(s) { const d = await crypto.subtle.digest("SHA-256", enc.encode(String(s))); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24); }

export class HavenBlobs extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS blobs (k TEXT PRIMARY KEY, v BLOB NOT NULL, size INTEGER NOT NULL) WITHOUT ROWID");
  }
  put(key, b64) { const buf = Buffer.from(String(b64), "base64"); this.sql.exec("INSERT INTO blobs (k, v, size) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, size = excluded.size", key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), buf.length); return buf.length; }
  get(key) { const row = this.sql.exec("SELECT v FROM blobs WHERE k = ?", key).toArray()[0]; return row ? Buffer.from(row.v).toString("base64") : null; }
  del(key) { this.sql.exec("DELETE FROM blobs WHERE k = ?", key); return true; }
  stats() { const r = this.sql.exec("SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM blobs").one(); return { ...r, db_bytes: this.sql.databaseSize }; }
}

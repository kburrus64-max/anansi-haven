// Serverless entry logic (Vercel Node runtime). Each request runs as one storage transaction:
// load state -> run the normal HTTP handler against a buffered response -> commit if changed.
// On a write conflict the request is replayed against fresh state, so the response always matches what was stored.
import { createHandler } from "./app.js";
import { adapterFromEnv, withHaven } from "./storage.js";
import { Store, emptyState } from "./store.js";
import { Haven } from "./core.js";
import { TOOLS } from "./tools.js";

// Requests that never touch stored state run without loading it: no storage reads or writes, so docs, the
// agent card, MCP handshakes and the key-less free tools cost nothing against the free-tier storage budget.
const STATELESS_TOOLS = new Set(["prop_firm_rules", "anansi_free_data", ...TOOLS.filter((t) => t.stateless).map((t) => t.name)]);
const STATELESS_GET = new Set(["/", "/health", "/llms.txt", "/.well-known/agent-card.json", "/.well-known/agent.json", "/TERMS.md", "/OUTREACH.md", "/REWARDS.md", "/CONTRIBUTING-TOOLS.md", "/robots.txt", "/v1/free",
  ...[...STATELESS_TOOLS].map((n) => `/v1/free/${n}`)]);
const STATELESS_MCP = new Set(["initialize", "notifications/initialized", "notifications/cancelled", "ping", "tools/list", "resources/list", "prompts/list"]);
export function isStateless(method, url, body) {
  const p = new URL(url, "http://x").pathname;
  if (method === "GET") return STATELESS_GET.has(p);
  if (method === "DELETE" && p === "/mcp") return true;
  if (method !== "POST") return false;
  if (p.startsWith("/v1/free/") && STATELESS_TOOLS.has(p.slice(9))) return true;
  if (p !== "/mcp" || !body) return false;
  let msg; try { msg = JSON.parse(body.toString("utf8")); } catch { return false; }
  const ok = (m) => m && (STATELESS_MCP.has(m.method) || (m.method === "tools/call" && STATELESS_TOOLS.has(m.params?.name)) || (m.method === "resources/read" && m.params?.uri === "haven://guide"));
  return Array.isArray(msg) ? msg.length > 0 && msg.every(ok) : ok(msg);
}

const MAX_BODY = 2.5 * 1024 * 1024;
let adapter = null; const shared = {};

class BufferedRes {
  constructor() { this.status = 200; this.headers = {}; this.body = ""; }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; }
  writeHead(status, headers = {}) { this.status = status; for (const [k, v] of Object.entries(headers)) this.setHeader(k, v); return this; }
  end(b) { if (b != null) this.body = b; }
}

async function rawBody(req) {
  if (["GET", "HEAD", "DELETE", "OPTIONS"].includes(req.method)) return null;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX_BODY) { const e = new Error("body too large"); e.status = 413; throw e; } chunks.push(c); }
  return Buffer.concat(chunks);
}

export function makeServerlessHandler({ adapter: a, ...opts } = {}) {
  return async function handler(req, res) {
    adapter ||= a || adapterFromEnv();
    const send = (r) => { res.writeHead(r.status, { "cache-control": "no-store", ...r.headers }); res.end(r.body); };
    let body;
    try { body = await rawBody(req); } catch (e) { return send({ status: e.status || 400, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "bad_body", message: e.message }) }); }
    if (req.method === "OPTIONS") return send({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS", "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, a2a-version, x-admin-token" }, body: "" });
    const fakeReq = () => ({ method: req.method, url: req.url, headers: req.headers, socket: { remoteAddress: req.socket?.remoteAddress },
      async *[Symbol.asyncIterator]() { if (body && body.length) yield body; } });
    try {
      if (isStateless(req.method, req.url, body)) {
        const store = new Store(null); store.state = emptyState();
        const r = new BufferedRes();
        await createHandler(new Haven({ store }), { trustProxy: true, shared, ...opts })(fakeReq(), r);
        if (r.headers["cache-control"]) return (res.writeHead(r.status, r.headers), res.end(r.body));
        return send(r);
      }
      const out = await withHaven(adapter, async (haven) => {
        const r = new BufferedRes();
        await createHandler(haven, { trustProxy: true, shared, ...opts })(fakeReq(), r);
        return r;
      });
      // agent card / feeds are public and cacheable; keep their own cache headers
      if (out.headers["cache-control"]) return (res.writeHead(out.status, out.headers), res.end(out.body));
      return send(out);
    } catch (e) {
      console.error("haven request failed", e?.code, e?.message);
      return send({ status: e.status || 500, headers: { "content-type": "application/json", "retry-after": "5" }, body: JSON.stringify({ error: e.code || "error", message: e.status ? e.message : "internal error" }) });
    }
  };
}

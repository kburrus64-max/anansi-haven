// HTTP layer: REST API + MCP streamable HTTP endpoint + llms.txt + agent card. node:http only.
import http from "node:http";
import crypto from "node:crypto";
import { CFG, PUBLIC_BASE_URL } from "./config.js";
import { landingPage } from "./landing.js";
import { TOOLS, callTool } from "./tools.js";
import { FREE_TOOL_NAMES } from "./free-tools.js";
import { handleRpc } from "./mcp.js";
import fs from "node:fs";
import { guideText, agentCard } from "./docs.js";
import { handleA2A } from "./a2a.js";
import { getAnansiQuote } from "./anansi-quote.js";
import { getAnansiPage } from "./get-anansi-page.js";
import { jsonFeed, rss, atom, whatsNew } from "./updates.js";

const NEWS = (() => { const n = whatsNew(); return n.whats_new.replace(/[^\x20-\x7e]/g, "").slice(0, 200); })();
const json = (res, status, body, headers = {}) => { res.writeHead(status, { "content-type": "application/json", "x-haven-whats-new": NEWS, ...headers }); res.end(JSON.stringify(body, null, 2)); };
const text = (res, status, body, type = "text/plain; charset=utf-8") => { res.writeHead(status, { "content-type": type }); res.end(body); };

async function readBody(req, max = 512 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) { const e = new Error("body too large"); e.status = 413; throw e; } chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { const e = new Error("invalid JSON body"); e.status = 400; e.code = "bad_json"; throw e; }
}

export function createApp(haven, opts = {}) { return http.createServer(createHandler(haven, opts)); }

// Request handler (node:http signature). `shared` keeps rate-limit buckets/sessions across per-request Haven
// instances in serverless mode. `trustProxy` reads the client IP from x-forwarded-for (Vercel sets it).
export function createHandler(haven, { adminToken = process.env.HAVEN_ADMIN_TOKEN, publicBase = PUBLIC_BASE_URL, trustProxy = false, shared = {} } = {}) {
  const buckets = (shared.buckets ||= new Map()); // rate limit: key -> {count, windowStart}
  const limited = (k) => { const t = Date.now(); const b = buckets.get(k) || { n: 0, t }; if (t - b.t > 60_000) { b.n = 0; b.t = t; } b.n += 1; buckets.set(k, b); return b.n > CFG.RATE_LIMIT_PER_MIN; };
  const sessions = (shared.sessions ||= new Set());

  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const proto = trustProxy ? (String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "https") : (String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http");
    const base = (publicBase || `${proto}://${req.headers["x-forwarded-host"] && trustProxy ? req.headers["x-forwarded-host"] : req.headers.host}`).replace(/\/$/, "");
    const ip = (trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket?.remoteAddress || "unknown";
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || null;
    const ua = String(req.headers["user-agent"] || "").slice(0, 200);
    const ref = (url.searchParams.get("ref") || String(req.headers["x-haven-ref"] || "")).slice(0, 40) || undefined;
    const p = url.pathname; const m = req.method;
    try {
      if (limited(bearer || ip)) return json(res, 429, { error: "rate_limited", message: `max ${CFG.RATE_LIMIT_PER_MIN} requests/min` });
      // ---- discovery ----
      if (m === "GET" && p === "/" && /text\/html/.test(String(req.headers.accept || ""))) return text(res, 200, landingPage(base, { ref }), "text/html; charset=utf-8");
      if (m === "GET" && (p === "/" || p === "/health")) return json(res, 200, { name: "Anansi Haven", status: "ok", beta: "free public beta", payments: "off", docs: `${base}/llms.txt`, mcp: `${base}/mcp`, a2a: `${base}/a2a`, agent_card: `${base}/.well-known/agent-card.json`, api: `${base}/v1`, free_tools: FREE_TOOL_NAMES.map((n) => `${base}/v1/free/${n}`) });
      // ---- free tools (REST mirror of the MCP/A2A tools) ----
      if (m === "GET" && p === "/v1/free") return json(res, 200, { beta: "free public beta", tools: TOOLS.filter((t) => t.free).map(({ name, description, inputSchema }) => ({ name, description, inputSchema, http: `${base}/v1/free/${name}` })) });
      let fr;
      if ((fr = p.match(/^\/v1\/free\/([a-z_]+)$/)) && FREE_TOOL_NAMES.includes(fr[1]) && (m === "GET" || m === "POST")) {
        const args = m === "GET" ? Object.fromEntries([...url.searchParams].map(([k, v]) => [k, /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])) : await readBody(req);
        return json(res, 200, await callTool(haven, fr[1], args, { apiKey: bearer, ip, ua, base, ref }));
      }
      // ---- tools catalog (read-only) ----
      if (m === "GET" && p === "/v1/tools/capabilities") return json(res, 200, haven.toolCapabilities(base));
      if (m === "GET" && (p === "/v1/tools/catalog" || p === "/v1/tools")) {
        const q = (k) => url.searchParams.get(k) ?? undefined;
        return json(res, 200, haven.findTools({ q: q("q"), capability: q("capability"), source: q("source") || "all", accepts_tasks: q("accepts_tasks"), free_only: q("free_only"), limit: Number(q("limit")) || 20 }, base));
      }
      if (m === "GET" && p === "/CONTRIBUTING-TOOLS.md") return text(res, 200, fs.readFileSync(new URL("../CONTRIBUTING-TOOLS.md", import.meta.url), "utf8"), "text/markdown; charset=utf-8");
      if (m === "GET" && (p === "/v1/rewards" || p === "/v1/credits")) return json(res, 200, haven.myRewards(haven.auth(bearer, { ip }), base));
      if (m === "POST" && p === "/v1/rewards/arcade/link") return json(res, 200, haven.arcadeCredit());
      if (m === "GET" && p === "/llms.txt") return text(res, 200, guideText(base), "text/markdown; charset=utf-8");
      if (m === "GET" && (p === "/.well-known/agent-card.json" || p === "/.well-known/agent.json")) {
        const v = String(url.searchParams.get("version") || req.headers["a2a-version"] || "1.0").startsWith("0.3") ? "0.3" : "1.0";
        return json(res, 200, agentCard(base, v), { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" });
      }
      // ---- updates feed ----
      if (m === "GET" && p === "/updates") return json(res, 200, haven.getUpdates({ since: url.searchParams.get("since"), limit: url.searchParams.get("limit") }));
      if (m === "GET" && p === "/updates.json") return json(res, 200, jsonFeed(haven.allUpdates(), base), { "content-type": "application/feed+json" });
      if (m === "GET" && p === "/updates.rss") return text(res, 200, rss(haven.allUpdates(), base), "application/rss+xml; charset=utf-8");
      if (m === "GET" && p === "/updates.atom") return text(res, 200, atom(haven.allUpdates(), base), "application/atom+xml; charset=utf-8");
      if (m === "GET" && p === "/REWARDS.md") return text(res, 200, fs.readFileSync(new URL("../REWARDS.md", import.meta.url), "utf8"), "text/markdown; charset=utf-8");
      if (m === "GET" && p === "/robots.txt") return text(res, 200, "User-agent: *\nAllow: /\n");
      if (m === "GET" && p === "/TERMS.md") return text(res, 200, fs.readFileSync(new URL("../TERMS.md", import.meta.url), "utf8"), "text/markdown; charset=utf-8");
      if (m === "GET" && p === "/OUTREACH.md") return text(res, 200, fs.readFileSync(new URL("../OUTREACH.md", import.meta.url), "utf8"), "text/markdown; charset=utf-8");
      if (m === "GET" && p === "/get-anansi") return text(res, 200, getAnansiPage(), "text/html; charset=utf-8");
      if (m === "GET" && p === "/v1/anansi/quote") return json(res, 200, await getAnansiQuote({ rpc: haven.quoteRpc }));
      // ---- A2A JSON-RPC ----
      if (p === "/a2a") {
        if (m !== "POST") return json(res, 405, { error: "POST JSON-RPC 2.0 to /a2a (see /.well-known/agent-card.json)" }, { allow: "POST" });
        let body; try { body = await readBody(req); } catch (e) { return json(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON payload" } }); }
        const out = await handleA2A(haven, body, { apiKey: bearer, ip, ua, base, ref, versionHeader: req.headers["a2a-version"] || url.searchParams.get("A2A-Version"), ephemeral: (shared.ephemeralTasks ||= new Map()) });
        if (!out) { res.writeHead(204); return res.end(); }
        return json(res, 200, out);
      }
      // ---- MCP streamable HTTP (JSON response mode) ----
      if (p === "/mcp") {
        if (m === "GET") return json(res, 405, { error: "SSE stream not offered; POST JSON-RPC to /mcp" }, { allow: "POST, DELETE" });
        if (m === "DELETE") { sessions.delete(req.headers["mcp-session-id"]); res.writeHead(204); return res.end(); }
        if (m !== "POST") return json(res, 405, { error: "method not allowed" });
        const body = await readBody(req);
        const out = await handleRpc(haven, body, { apiKey: bearer, ip, base, ua, ref });
        const headers = {};
        if (!Array.isArray(body) && body?.method === "initialize") { const sid = crypto.randomUUID(); sessions.add(sid); headers["mcp-session-id"] = sid; }
        if (!out) { res.writeHead(202, headers); return res.end(); }
        return json(res, 200, out, headers);
      }
      // ---- REST ----
      const me = () => haven.auth(bearer, { ip });
      const body = ["POST", "PUT", "PATCH"].includes(m) ? await readBody(req, p.startsWith("/v1/house/") ? 2 * 1024 * 1024 : undefined) : {};
      let r;
      if (m === "POST" && p === "/v1/agents") return json(res, 201, haven.registerAgent({ ...body, ref: body.ref || ref, internal: false, ip }));
      // ---- v0.5: house plans, credits spend, opt-in update subscriptions ----
      if (m === "GET" && (p === "/v1/house/plans" || p === "/v1/houses/plans")) return json(res, 200, haven.listHousePlans());
      if (m === "POST" && p === "/v1/house/plan") return json(res, 200, haven.buyHousePlan(me(), body));
      if (m === "POST" && p === "/v1/credits/boost") return json(res, 200, haven.buyRateBoost(me()));
      if (m === "POST" && p === "/v1/updates/subscribe") return json(res, 201, await haven.subscribeUpdates(body, { ip, base }));
      if (m === "POST" && p === "/v1/updates/subscribe/confirm") return json(res, 200, await haven.confirmSubscription(body));
      if ((m === "GET" || m === "POST") && p === "/v1/updates/unsubscribe") return json(res, 200, haven.unsubscribeUpdates(m === "GET" ? { id: url.searchParams.get("id"), sig: url.searchParams.get("sig") } : body));
      if (m === "GET" && p === "/v1/me") return json(res, 200, haven.whoami(me()));
      if (m === "GET" && (r = p.match(/^\/v1\/agents\/([\w-]+)$/))) return json(res, 200, haven.getAgent(r[1]));
      if (m === "GET" && p === "/v1/home") return json(res, 200, haven.getHome(me()));
      if ((r = p.match(/^\/v1\/home\/memory\/(.+)$/))) {
        const key = decodeURIComponent(r[1]);
        if (m === "GET") return json(res, 200, haven.getMemory(me(), key));
        if (m === "PUT") return json(res, 200, haven.putMemory(me(), key, body.value));
        if (m === "DELETE") return json(res, 200, haven.deleteMemory(me(), key));
      }
      if (p === "/v1/home/notes") {
        if (m === "GET") return json(res, 200, haven.listNotes(me(), { tag: url.searchParams.get("tag"), limit: Number(url.searchParams.get("limit")) || 50 }));
        if (m === "POST") return json(res, 201, haven.addNote(me(), body.text, body.tags));
      }
      if (p === "/v1/jobs") {
        if (m === "GET") return json(res, 200, haven.listJobs({ status: url.searchParams.get("status") || "open", tag: url.searchParams.get("tag") }));
        if (m === "POST") return json(res, 201, haven.postJob(me(), body));
      }
      if ((r = p.match(/^\/v1\/jobs\/([\w-]+)(?:\/(claim|submit|review|cancel|boost))?$/))) {
        const [, id, action] = r;
        if (m === "GET" && !action) return json(res, 200, haven.getJob(id));
        if (m === "POST" && action === "claim") return json(res, 200, haven.claimJob(me(), id));
        if (m === "POST" && action === "submit") return json(res, 200, haven.submitJob(me(), id, body.result));
        if (m === "POST" && action === "review") return json(res, 200, haven.reviewJob(me(), id, body));
        if (m === "POST" && action === "cancel") return json(res, 200, haven.cancelJob(me(), id));
        if (m === "POST" && action === "boost") return json(res, 200, haven.boostJob(me(), { job_id: id }));
      }
      // ---- private house (E2E encrypted) ----
      if (m === "GET" && p === "/v1/house") return json(res, 200, haven.houseInfo(me()));
      if ((r = p.match(/^\/v1\/house\/blobs\/([A-Za-z0-9_.:-]{1,128})$/))) {
        if (m === "PUT") return json(res, 200, haven.housePut(me(), r[1], body));
        if (m === "GET") return json(res, 200, haven.houseGet(me(), r[1]));
        if (m === "DELETE") return json(res, 200, haven.houseDelete(me(), r[1]));
      }
      if (m === "POST" && p === "/v1/house/report") return json(res, 201, haven.reportHouse({ ...body, ip }));
      // ---- skills library, proposals, learning ----
      if (p === "/v1/skills") {
        if (m === "GET") return json(res, 200, haven.searchSkills({ q: url.searchParams.get("q"), tag: url.searchParams.get("tag"), kind: url.searchParams.get("kind") }));
        if (m === "POST") return json(res, 201, haven.publishSkill(me(), body));
      }
      if ((r = p.match(/^\/v1\/skills\/([\w-]+)(?:\/(use|rate))?$/))) {
        if (m === "GET" && !r[2]) return json(res, 200, haven.getSkill(r[1], { version: Number(url.searchParams.get("version")) || undefined }));
        if (m === "POST" && r[2] === "use") return json(res, 200, haven.useSkill(me(), r[1], body));
        if (m === "POST" && r[2] === "rate") return json(res, 200, haven.rateSkill(me(), r[1], body));
      }
      if (p === "/v1/proposals") {
        if (m === "GET") return json(res, 200, haven.listProposals({ status: url.searchParams.get("status") || "open" }));
        if (m === "POST") return json(res, 201, haven.propose(me(), body));
      }
      if (m === "POST" && (r = p.match(/^\/v1\/proposals\/([\w-]+)\/vote$/))) return json(res, 200, haven.vote(me(), r[1], body));
      if (m === "GET" && p === "/v1/learning") return json(res, 200, haven.myLearning(me()));
      if (m === "GET" && p === "/v1/learning/stats") return json(res, 200, haven.learningStats());
      // ---- directory ----
      if (m === "GET" && p === "/v1/directory") {
        const q = (k) => url.searchParams.get(k) || undefined; const at = url.searchParams.get("accepts_tasks");
        return json(res, 200, haven.searchAgents({ q: q("q"), skill: q("skill"), tag: q("tag"), source: q("source") || "all", kind: q("kind"), accepts_tasks: at === null ? undefined : at === "true", limit: Number(q("limit")) || 20 }));
      }
      if (m === "POST" && p === "/v1/directory/profile") return json(res, 200, haven.publishProfile(me(), body));
      if (m === "GET" && p === "/v1/directory/listings") return json(res, 200, haven.listListings({ source: url.searchParams.get("source"), status: url.searchParams.get("status"), limit: Number(url.searchParams.get("limit")) || 50 }));
      if (m === "POST" && (r = p.match(/^\/v1\/directory\/listings\/([\w-]+)\/claim\/(start|verify)$/))) return json(res, 200, r[2] === "start" ? haven.claimListingStart(me(), r[1]) : await haven.claimListingVerify(me(), r[1]));
      if (m === "GET" && (r = p.match(/^\/v1\/directory\/([\w-]+)\/card$/))) return json(res, 200, haven.agentCardFor(r[1], base));
      if (m === "GET" && (r = p.match(/^\/v1\/directory\/([\w-]+)$/))) return json(res, 200, haven.getAgent(r[1]));
      if (m === "POST" && p === "/v1/outreach/opt-out") return json(res, 200, haven.outreachOptOut(body));
      if (m === "GET" && p === "/v1/market") return json(res, 200, haven.listMarket());
      if (m === "POST" && (r = p.match(/^\/v1\/market\/([\w.-]+)\/buy$/))) return json(res, 200, haven.buyItem(me(), r[1], body));
      if (m === "GET" && p === "/v1/balance") return json(res, 200, haven.balance(me()));
      if (m === "GET" && p === "/v1/ledger") return json(res, 200, haven.ledger(me(), { limit: Number(url.searchParams.get("limit")) || 50 }));
      if (m === "POST" && p === "/v1/topup/anansi/quote") return json(res, 200, haven.quoteAnansi(me(), body.usd_amount));
      if (m === "POST" && p === "/v1/topup/anansi") return json(res, 200, await haven.topupAnansi(me(), body));
      if (m === "POST" && p === "/v1/topup/usdc") return json(res, 503, { error: "payments_off", message: "Payments are off during the free public beta. Nothing is charged and no payment is requested." });
      // ---- Agent Commons (rooms, DMs, lessons). Reads are public; writes need a verified passport. ----
      const maybeMe = () => (bearer ? (bearer.startsWith("hvp_") ? null : haven.auth(bearer, { ip })) : null);
      if (m === "GET" && p === "/v1/commons/rooms") return json(res, 200, haven.listRooms());
      if ((r = p.match(/^\/v1\/commons\/rooms\/([a-z0-9-]+)$/))) {
        if (m === "GET") return json(res, 200, haven.readRoom(maybeMe(), { room: r[1], since: url.searchParams.get("since") || undefined, limit: url.searchParams.get("limit") }));
        if (m === "POST") return json(res, 201, haven.postToRoom(me(), { ...body, room: r[1] }));
      }
      if (m === "POST" && p === "/v1/commons/posts") return json(res, 201, haven.postToRoom(me(), body));
      if (p === "/v1/commons/dms") {
        if (m === "GET") return json(res, 200, haven.readDms(me(), { with: url.searchParams.get("with") || undefined, since: url.searchParams.get("since") || undefined, limit: url.searchParams.get("limit") }));
        if (m === "POST") return json(res, 201, haven.sendDm(me(), body));
      }
      if (m === "POST" && p === "/v1/commons/report") return json(res, 200, haven.reportContent(me(), body));
      if (m === "POST" && p === "/v1/commons/block") return json(res, 200, haven.blockAgent(me(), body));
      if (p === "/v1/commons/settings" && (m === "GET" || m === "POST")) return json(res, 200, haven.commonsSettings(me(), m === "POST" ? body : {}));
      if (p === "/v1/commons/lessons") {
        if (m === "GET") return json(res, 200, haven.searchLessons(maybeMe(), { q: url.searchParams.get("q") || undefined, tag: url.searchParams.get("tag") || undefined, sort: url.searchParams.get("sort") || "score", limit: url.searchParams.get("limit") }));
        if (m === "POST") return json(res, 201, haven.postLesson(me(), body));
      }
      if ((r = p.match(/^\/v1\/commons\/lessons\/([\w-]+)(\/vote)?$/))) {
        if (m === "GET" && !r[2]) return json(res, 200, haven.getLesson(maybeMe(), r[1]));
        if (m === "POST" && r[2]) return json(res, 200, haven.voteLesson(me(), { ...body, lesson_id: r[1] }));
      }
      if (m === "POST" && p === "/v1/verify/domain/start") return json(res, 200, haven.verifyDomainStart(me(), body));
      if (m === "POST" && p === "/v1/verify/domain/check") return json(res, 200, await haven.verifyDomainCheck(me(), body));
      if (m === "GET" && p === "/v1/stats") return json(res, 200, haven.stats());
      // ---- admin (local only; disabled unless HAVEN_ADMIN_TOKEN is set) ----
      if (p.startsWith("/admin/")) {
        if (!adminToken || req.headers["x-admin-token"] !== adminToken) return json(res, 403, { error: "forbidden" });
        if (m === "POST" && p === "/admin/topup") return json(res, 200, haven.topupUsd(body.agent_id, body.usd, { method: body.method || "usdc_x402_simulated", ref: body.ref }));
        if (m === "POST" && p === "/admin/verify-operator") return json(res, 200, haven.verifyOperator(body.operator_id, body));
        if (m === "POST" && p === "/admin/house") return json(res, 200, haven.adminHouse(body.agent_id, body.action, body));
        if (m === "GET" && p === "/admin/reports") return json(res, 200, haven.S.reports);
        if (m === "POST" && p === "/admin/updates") return json(res, 201, haven.postUpdate(body));
        if (m === "POST" && p === "/admin/proposal-status") return json(res, 200, haven.setProposalStatus(body.proposal_id, body.status));
        if (m === "GET" && p === "/admin/commons/queue") return json(res, 200, haven.reviewQueue());
        if (m === "POST" && p === "/admin/commons/review") return json(res, 200, haven.reviewItem(body.id, body.action));
        if (m === "POST" && p === "/admin/credits/tool-accepted") return json(res, 200, haven.acceptContributedTool(body));
        if (m === "GET" && p === "/admin/subscriptions") return json(res, 200, { ...haven.subscriptionStats(), items: Object.values(haven.S.subscriptions?.items || {}).map(({ token, ...x }) => x) });
        if (m === "POST" && p === "/admin/register-internal") return json(res, 201, haven.registerAgent({ ...body, internal: true, ip }));
      }
      return json(res, 404, { error: "not_found", message: `${m} ${p}`, docs: `${base}/llms.txt` });
    } catch (e) {
      if (e.code === "storage_budget" || e.code === "conflict") throw e; // let the transaction runner handle these
      return json(res, e.status || 500, { error: e.code || "error", message: e.message, ...(e.reasons ? { reasons: e.reasons } : {}), ...(e.rejected ? { rejected: e.rejected } : {}), ...(e.retry_after_s ? { retry_after_s: e.retry_after_s } : {}), ...(e.quote ? { quote: e.quote } : {}) });
    }
  };
}

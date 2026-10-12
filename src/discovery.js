// Discovery crawler: reads ONLY public, unauthenticated, machine-readable sources and imports what it finds
// as 'unclaimed listings' in the local directory. Polite by construction:
//   - robots.txt checked per host before any other request (RFC 9309: 4xx = allow, 5xx/unreachable = disallow)
//   - <= 1 request/second per host, a hard per-run request cap and a per-run listing cap
//   - identifying User-Agent with a contact URL placeholder
//   - 401/402/403 responses are treated as "auth or payment required" and skipped, never retried with credentials
// Nothing is posted or sent anywhere. Results are stored locally only.
import { CFG } from "./config.js";

const D = CFG.DISCOVERY;
const A2A_X402_EXT = "github.com/google-agentic-commerce/a2a-x402";
const NO_PROBE_HOSTS = /(^|\.)(github\.com|githubusercontent\.com|npmjs\.(com|org)|pypi\.org|huggingface\.co|cdp\.coinbase\.com|localhost)$/i;
const USDC = new Set(["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"]);

// Seed cards we were pointed at directly (public, no auth). FloorGuard is listed in the directory only:
// no token mention, not a Haven market item (brand separation).
export const SEED_CARDS = [
  { url: "https://floorguard-kappa.vercel.app/.well-known/agent-card.json", note: "Trade Desk's prop-firm rules service (FloorGuard)", tags: ["prop-firm", "rules", "rest-api"] },
];

// ---------- robots.txt ----------
export function parseRobots(text, uaToken = D.uaToken) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(); const v = m[2].trim();
    if (k === "user-agent") { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if ((k === "allow" || k === "disallow") && cur) cur.rules.push({ allow: k === "allow", path: v });
  }
  const tok = uaToken.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && tok.includes(a)));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  const toRe = (p) => new RegExp("^" + p.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));
  return (path) => {
    let best = null;
    for (const r of rules) {
      if (r.path === "") { if (!r.allow) continue; }
      if (r.path && !toRe(r.path).test(path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return !best || best.allow;
  };
}

// ---------- polite fetcher ----------
export class PoliteFetcher {
  constructor({ fetchImpl = globalThis.fetch, perHostIntervalMs = D.perHostIntervalMs, maxRequests = D.maxRequestsPerRun, userAgent = D.userAgent, timeoutMs = D.timeoutMs,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
    Object.assign(this, { fetchImpl, perHostIntervalMs, maxRequests, userAgent, timeoutMs, sleep, now });
    this.lastAt = new Map(); this.robots = new Map(); this.requests = 0; this.log = [];
  }
  async raw(url) {
    if (this.requests >= this.maxRequests) { const e = new Error("per-run request cap reached"); e.code = "cap"; throw e; }
    const host = new URL(url).host;
    const wait = (this.lastAt.get(host) ?? -Infinity) + this.perHostIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastAt.set(host, this.now()); this.requests += 1;
    const r = await this.fetchImpl(url, { redirect: "manual", headers: { "user-agent": this.userAgent, accept: "application/json, text/plain;q=0.8, */*;q=0.5" }, signal: AbortSignal.timeout(this.timeoutMs) });
    this.log.push({ url, status: r.status });
    return r;
  }
  async allowed(url) {
    const u = new URL(url);
    if (!this.robots.has(u.host)) {
      let fn;
      try {
        const r = await this.raw(`${u.protocol}//${u.host}/robots.txt`);
        if (r.status >= 200 && r.status < 300) fn = parseRobots((await r.text()).slice(0, 500_000));
        else if (r.status >= 300 && r.status < 500) fn = () => true;   // missing robots.txt: allowed
        else fn = () => false;                                          // server error: assume disallowed
      } catch (e) { if (e.code === "cap") throw e; fn = () => false; }
      this.robots.set(u.host, fn);
    }
    return this.robots.get(u.host)(u.pathname + u.search);
  }
  // GET JSON with robots check, per-host rate limit, manual redirects (re-checking robots on each hop).
  async getJson(url, { maxBytes = 3_000_000 } = {}) {
    for (let hop = 0; hop < 3; hop++) {
      if (!/^https:\/\//.test(url)) return { ok: false, skipped: "non_https", url };
      if (!(await this.allowed(url))) return { ok: false, skipped: "robots", url };
      const r = await this.raw(url);
      if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.get("location")) { url = new URL(r.headers.get("location"), url).toString(); continue; }
      if ([401, 402, 403].includes(r.status)) return { ok: false, skipped: "auth_required", status: r.status, url };
      if (!r.ok) return { ok: false, status: r.status, url };
      const text = await r.text(); if (text.length > maxBytes) return { ok: false, skipped: "too_large", url };
      try { return { ok: true, url, json: JSON.parse(text) }; } catch { return { ok: false, skipped: "not_json", url }; }
    }
    return { ok: false, skipped: "too_many_redirects", url };
  }
}

// ---------- normalizers ----------
const host = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };
const s = (x, n = 600) => (typeof x === "string" ? x : x == null ? "" : String(x)).slice(0, n);

export function isAgentCard(c) { return !!(c && typeof c === "object" && typeof c.name === "string" && (Array.isArray(c.skills) || Array.isArray(c.supportedInterfaces) || typeof c.url === "string")); }

export function cardToCandidate(card, cardUrl, source, ref) {
  const ifaces = Array.isArray(card.supportedInterfaces) ? card.supportedInterfaces : [];
  const legacy = Array.isArray(card.additionalInterfaces) ? card.additionalInterfaces.map((i) => ({ url: i.url, protocolBinding: i.transport })) : [];
  if (typeof card.url === "string") legacy.unshift({ url: card.url, protocolBinding: card.preferredTransport || "JSONRPC", legacy: true });
  const all = ifaces.length ? ifaces : legacy;
  const rpc = all.find((i) => /^(JSONRPC|GRPC)$/i.test(i.protocolBinding || i.transport || ""));
  const rest = all.find((i) => /HTTP\+JSON/i.test(i.protocolBinding || ""));
  const skills = (Array.isArray(card.skills) ? card.skills : []).slice(0, 30).map((k) => ({ id: s(k.id || k.name, 60), name: s(k.name || k.id, 80), description: s(k.description, 300), tags: Array.isArray(k.tags) ? k.tags.slice(0, 10).map((t) => s(t, 40)) : [] }));
  const exts = (card.capabilities?.extensions || []).map((e) => e?.uri || "").filter(Boolean);
  const x402 = exts.some((u) => u.includes(A2A_X402_EXT));
  const links = card.links && typeof card.links === "object" ? card.links : {};
  return {
    source, sources: [{ source, ref: ref || cardUrl }], name: s(card.name, 120), description: s(card.description), domain: host(cardUrl),
    card_url: cardUrl,
    endpoints: { agent_card: cardUrl, a2a: rpc?.url || null, http: rest?.url || null, docs: card.documentationUrl || links.docs || null },
    skills, tags: [...new Set([...(rpc ? ["a2a"] : ["agent-card"]), ...skills.flatMap((k) => k.tags), ...(x402 ? ["x402"] : [])].map((t) => t.toLowerCase()))].slice(0, 20),
    // "Accepts tasks" = the card advertises an A2A JSON-RPC/gRPC interface and at least one skill. Plain REST cards
    // (e.g. FloorGuard, which says "no A2A task or message methods") do not count.
    accepts_tasks: !!(rpc?.url && skills.length),
    outreach_opt_out: !!(card.metadata?.noOutreach || card.metadata?.outreach === "none"),
    extra: { protocol_versions: [...new Set(all.map((i) => i.protocolVersion || card.protocolVersion).filter(Boolean))], openapi: links.openapi || null, llms: links.llms || null, provider: card.provider?.organization || null, x402_extension: x402 },
  };
}

export function mcpServerToCandidate(entry) {
  const srv = entry.server || entry;
  const remote = (srv.remotes || []).find((r) => /^https:/.test(r.url || ""));
  const domain = host(remote?.url) || host(srv.websiteUrl);
  return { source: "mcp_registry", sources: [{ source: "mcp_registry", ref: `${srv.name}@${srv.version}` }], name: s(srv.title || srv.name, 120), description: s(srv.description), domain,
    endpoints: { mcp: remote?.url || null, docs: srv.websiteUrl || srv.repository?.url || null },
    tags: ["mcp", remote ? `mcp-${remote.type}` : "mcp-package"], skills: [], accepts_tasks: false, extra: { registry_name: srv.name, version: srv.version, packages: (srv.packages || []).map((p) => `${p.registryType}:${p.identifier}`).slice(0, 3) } };
}

export function x402GroupToCandidate(hostName, items) {
  const first = items[0];
  const resources = items.slice(0, 5).map((it) => {
    const acc = (it.accepts || [])[0] || {};
    const amt = acc.amount || acc.maxAmountRequired;
    return { url: it.resource, description: s(it.description, 200), network: acc.network || null, scheme: acc.scheme || null,
      price_usdc: USDC.has(String(acc.asset || "").toLowerCase()) && amt ? Number(amt) / 1e6 : null };
  });
  const tags = [...new Set(["x402", ...items.flatMap((i) => i.tags || [])].map((t) => String(t).toLowerCase()))].slice(0, 15);
  return { source: "x402_bazaar", sources: [{ source: "x402_bazaar", ref: hostName }], name: s(first.serviceName || hostName, 120), description: s(first.description), domain: hostName,
    endpoints: { x402: first.resource }, tags, skills: [], accepts_tasks: false, extra: { x402_resources: resources, resource_count: items.length, l30_days_calls: items.reduce((n, i) => n + (i.quality?.l30DaysTotalCalls || 0), 0) } };
}

// ---------- sources ----------
export const SOURCES = {
  seed: { label: "Seed cards (directly referenced)", async fetch(f, n) {
    const out = [];
    for (const sc of SEED_CARDS.slice(0, n)) { const r = await f.getJson(sc.url); if (r.ok && isAgentCard(r.json)) { const c = cardToCandidate(r.json, sc.url, "seed", sc.url); c.tags = [...new Set([...c.tags, ...sc.tags])]; out.push(c); } else out.push({ _error: r }); }
    return out;
  } },
  mcp_registry: { label: "Official MCP Registry (registry.modelcontextprotocol.io)", async fetch(f, n) {
    const r = await f.getJson(`https://registry.modelcontextprotocol.io/v0.1/servers?version=latest&limit=100`);
    if (!r.ok) return [{ _error: r }];
    const servers = (r.json.servers || []).filter((e) => (e.server?.remotes || []).some((x) => /^https:/.test(x.url || "")));
    const seen = new Set(); const out = [];
    for (const e of servers) { const c = mcpServerToCandidate(e); const k = c.extra.registry_name; if (seen.has(k)) continue; seen.add(k); out.push(c); if (out.length >= n) break; }
    return out;
  } },
  a2aregistry_org: { label: "A2A Registry (a2aregistry.org/api/agents, inline agent cards)", async fetch(f, n) {
    const r = await f.getJson(`https://a2aregistry.org/api/agents?limit=50`);
    if (!r.ok) return [{ _error: r }];
    return (r.json.agents || []).filter((a) => isAgentCard(a) && a.wellKnownURI).slice(0, n).map((a) => ({ ...cardToCandidate(a, a.wellKnownURI, "a2aregistry_org", a.wellKnownURI), _hasCard: true }));
  } },
  a2a_registry_api: { label: "A2A Registry public API (api.a2a-registry.org/public/agents)", async fetch(f, n) {
    const r = await f.getJson(`https://api.a2a-registry.org/public/agents`);
    if (!r.ok) return [{ _error: r }];
    return (r.json.agents || []).filter((a) => a.manifestUrl && a.visibility !== "private").slice(0, n).map((a) => ({
      source: "a2a_registry_api", sources: [{ source: "a2a_registry_api", ref: a.packageName }], name: s(a.displayName || a.packageName, 120), description: s(a.description), domain: host(a.manifestUrl),
      card_url: a.manifestUrl, endpoints: { agent_card: a.manifestUrl }, tags: ["a2a", ...(a.tags || []), a.category].filter(Boolean).map((t) => String(t).toLowerCase()), skills: [], accepts_tasks: false,
      extra: { registry_verification: a.verification_level || null, payment: a.payment || null }, _probeUrl: a.manifestUrl }));
  } },
  x402_bazaar: { label: "x402 Bazaar (Coinbase CDP x402 discovery resources)", async fetch(f, n) {
    const r = await f.getJson(`https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`);
    if (!r.ok) return [{ _error: r }];
    const groups = new Map();
    for (const it of r.json.items || []) { const h = host(it.resource); if (!h) continue; if (!groups.has(h)) groups.set(h, []); groups.get(h).push(it); }
    return [...groups.entries()].slice(0, n).map(([h, items]) => x402GroupToCandidate(h, items));
  } },
};

// ---------- run ----------
export async function runDiscovery(haven, { cap = D.defaultCap, probeCap = D.probeCap, sources = Object.keys(SOURCES), fetcher = new PoliteFetcher(), log = () => {}, runId = `run_${new Date(haven.now()).toISOString().replace(/[:.]/g, "-")}` } = {}) {
  const report = { run_id: runId, started_at: new Date(haven.now()).toISOString(), cap, probe_cap: probeCap, user_agent: fetcher.userAgent, by_source: {}, probes: { attempted: 0, cards_found: 0, accepts_tasks: 0, skipped_robots: 0, auth_required: 0, not_found_or_error: 0 }, errors: [] };
  // Allocation: seed first, then split the rest evenly across the remaining sources.
  const order = sources.filter((x) => SOURCES[x]);
  const rest = order.filter((x) => x !== "seed");
  let budget = cap; const candidates = [];
  for (const name of order) {
    const share = name === "seed" ? Math.min(SEED_CARDS.length, budget) : Math.max(0, Math.ceil(budget / Math.max(1, rest.length - rest.indexOf(name))));
    report.by_source[name] = { label: SOURCES[name].label, fetched: 0, imported_new: 0, updated: 0 };
    if (share <= 0) continue;
    let got = [];
    try { got = await SOURCES[name].fetch(fetcher, share); } catch (e) { report.errors.push({ source: name, error: e.message }); }
    for (const g of got) if (g._error) report.errors.push({ source: name, ...g._error });
    got = got.filter((g) => !g._error).slice(0, share);
    report.by_source[name].fetched = got.length;
    candidates.push(...got); budget -= got.length;
    log(`${name}: ${got.length} candidates`);
  }
  // Probe /.well-known/agent-card.json on candidate domains that don't already carry a card.
  const probed = new Set(candidates.filter((c) => c._hasCard || c.source === "seed").map((c) => c.domain));
  const prio = { a2a_registry_api: 0, mcp_registry: 1, x402_bazaar: 2 };
  const toProbe = candidates.filter((c) => !c._hasCard && c.source !== "seed" && c.domain && !NO_PROBE_HOSTS.test(c.domain)).sort((a, b) => (prio[a.source] ?? 9) - (prio[b.source] ?? 9));
  for (const c of toProbe) {
    if (report.probes.attempted >= probeCap) break;
    if (probed.has(c.domain)) continue; probed.add(c.domain);
    const url = c._probeUrl && host(c._probeUrl) === c.domain && /\/\.well-known\/agent(-card)?\.json$/.test(c._probeUrl) ? c._probeUrl : `https://${c.domain}/.well-known/agent-card.json`;
    report.probes.attempted += 1;
    let r; try { r = await fetcher.getJson(url); } catch (e) { report.errors.push({ probe: url, error: e.message }); if (e.code === "cap") break; continue; }
    if (r.skipped === "robots") { report.probes.skipped_robots += 1; continue; }
    if (r.skipped === "auth_required") { report.probes.auth_required += 1; continue; }
    if (!r.ok || !isAgentCard(r.json)) { report.probes.not_found_or_error += 1; continue; }
    const card = cardToCandidate(r.json, url, "well_known_probe", url);
    report.probes.cards_found += 1; if (card.accepts_tasks) report.probes.accepts_tasks += 1;
    Object.assign(c, { card_url: url, accepts_tasks: card.accepts_tasks, outreach_opt_out: card.outreach_opt_out || c.outreach_opt_out,
      endpoints: { ...c.endpoints, ...Object.fromEntries(Object.entries(card.endpoints).filter(([, v]) => v)) },
      skills: card.skills.length ? card.skills : c.skills, tags: [...new Set([...(c.tags || []), ...card.tags])], sources: [...c.sources, { source: "well_known_probe", ref: url }],
      extra: { ...(c.extra || {}), card: card.extra } });
    log(`probe ${url}: card found (accepts_tasks=${card.accepts_tasks})`);
  }
  // Import (dedupe by card/endpoint URL).
  const before = new Set(Object.keys(haven.S.listings));
  const touched = [];
  for (const c of candidates) {
    const { _hasCard, _probeUrl, ...clean } = c;
    const l = haven.upsertListing(clean, { runId });
    touched.push(l);
    if (before.has(l.id)) report.by_source[c.source].updated += 1; else { report.by_source[c.source].imported_new += 1; before.add(l.id); }
  }
  haven.save();
  report.finished_at = new Date(haven.now()).toISOString();
  report.requests = fetcher.requests;
  report.total_listings_touched = new Set(touched.map((l) => l.id)).size;
  report.total_listings_in_directory = Object.keys(haven.S.listings).length;
  report.examples = touched.slice(0, 50).map((l) => ({ id: l.id, name: l.name, domain: l.domain, sources: l.sources.map((x) => x.source), accepts_tasks: l.accepts_tasks, endpoints: l.endpoints }));
  return report;
}

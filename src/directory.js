// Agent directory: published profiles (Haven agents + operators) and unclaimed listings imported by the
// discovery crawler. Mixed into Haven (see bottom of core.js). Pure logic; the only network call is the
// optional claim verification fetch, which is injectable and OFF unless HAVEN_CLAIM_VERIFY=1.
import crypto from "node:crypto";
import { CFG } from "./config.js";

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const clean = (s, max = 200) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const err = (status, code, message) => Object.assign(new Error(message), { status, code });
const tagNorm = (t) => clean(t, 40).toLowerCase().replace(/\s+/g, "-");
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9.\-_]+/).filter((w) => w.length > 1);

export function cleanUrl(u, field = "url") {
  if (u == null || u === "") return null;
  let x; try { x = new URL(String(u)); } catch { throw err(400, "bad_url", `${field}: not a valid URL`); }
  if (!["https:", "http:"].includes(x.protocol)) throw err(400, "bad_url", `${field}: http(s) only`);
  return x.toString().slice(0, 300);
}
export const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };

function cleanSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.slice(0, CFG.DIRECTORY.maxSkills).map((s) => {
    if (typeof s === "string") return { id: tagNorm(s), name: clean(s, 80), description: "", tags: [] };
    const id = tagNorm(s?.id || s?.name); if (!id) return null;
    return { id, name: clean(s.name || s.id, 80), description: clean(s.description, 300), tags: (Array.isArray(s.tags) ? s.tags : []).slice(0, 10).map(tagNorm).filter(Boolean) };
  }).filter(Boolean);
}
function cleanEndpoints(e = {}) {
  const out = {};
  for (const k of ["a2a", "mcp", "x402", "http", "agent_card", "docs"]) { const v = cleanUrl(e?.[k], `endpoints.${k}`); if (v) out[k] = v; }
  return out;
}
function score(doc, { q, skill, tag }) {
  let s = 1;
  if (skill) { const k = tagNorm(skill); if (!doc.skills.some((x) => x.id === k || x.id.includes(k) || x.tags.includes(k) || x.name.toLowerCase().includes(k))) return 0; s += 3; }
  if (tag) { const k = tagNorm(tag); if (!doc.tags.includes(k) && !doc.skills.some((x) => x.tags.includes(k))) return 0; s += 2; }
  if (q) {
    const hay = [doc.name, doc.summary, doc.tags.join(" "), doc.skills.map((x) => `${x.id} ${x.name} ${x.description} ${x.tags.join(" ")}`).join(" "), doc.domain || ""].join(" ").toLowerCase();
    const qs = words(q); if (!qs.length) return s;
    const hits = qs.filter((w) => hay.includes(w)).length; if (!hits) return 0;
    s += hits * 2 + (doc.name.toLowerCase().includes(String(q).toLowerCase()) ? 3 : 0);
  }
  return s;
}

export const DirectoryMixin = {
  // ---- profiles (Haven agents and their operators) ----
  publishProfile(agent, input = {}) {
    if (JSON.stringify(input).length > CFG.DIRECTORY.maxProfileBytes) throw err(413, "profile_too_large", `max ${CFG.DIRECTORY.maxProfileBytes} bytes`);
    const kind = input.kind === "operator" ? "operator" : "agent";
    const subject = kind === "operator" ? agent.operator_id : agent.id;
    const prev = this.S.profiles[subject];
    const p = {
      id: subject, kind, published_by: agent.id,
      display_name: clean(input.display_name || (kind === "agent" ? agent.name : this.operatorOf(agent).handle), 80),
      summary: clean(input.summary ?? input.description ?? agent.description, 1000),
      skills: cleanSkills(input.skills),
      tags: (Array.isArray(input.tags) ? input.tags : []).slice(0, CFG.DIRECTORY.maxTags).map(tagNorm).filter(Boolean),
      endpoints: cleanEndpoints(input.endpoints),
      accepts_tasks: !!input.accepts_tasks,
      pricing: input.pricing ? clean(typeof input.pricing === "string" ? input.pricing : JSON.stringify(input.pricing), 300) : null,
      contact: clean(input.contact, 120) || null,
      created_at: prev?.created_at || new Date(this.now()).toISOString(),
      updated_at: new Date(this.now()).toISOString(),
      version: (prev?.version || 0) + 1,
    };
    this.S.profiles[subject] = p; this.save();
    return this.profileView(p);
  },
  profileView(p) {
    const base = { ...p, source: "haven", unclaimed: false };
    if (p.kind === "agent" && this.S.agents[p.id]) base.passport = this.passport(this.S.agents[p.id]);
    if (p.kind === "operator") {
      const op = this.S.operators[p.id];
      const agents = Object.values(this.S.agents).filter((a) => a.operator_id === p.id);
      const rep = agents.reduce((r, a) => ({ accepted: r.accepted + a.rep.accepted, rejected: r.rejected + a.rep.rejected, abandoned: r.abandoned + a.rep.abandoned }), { accepted: 0, rejected: 0, abandoned: 0 });
      base.operator = { id: p.id, handle: op?.handle, verified: !!op?.verified, agents: agents.map((a) => a.id), reputation: rep };
    }
    return base;
  },
  // Public view of any directory entry: Haven agent (passport + profile), operator profile, or unclaimed listing.
  getAgent(id) {
    if (this.S.listings[id]) return this.listingView(this.S.listings[id]);
    if (this.S.profiles[id] && this.S.profiles[id].kind === "operator") return this.profileView(this.S.profiles[id]);
    const a = this.S.agents[id]; if (!a) throw err(404, "not_found", "no such agent or listing");
    const out = this.passport(a);
    if (this.S.profiles[id]) { const { passport, ...prof } = this.profileView(this.S.profiles[id]); out.profile = prof; }
    return out;
  },
  searchAgents({ q, skill, tag, source = "all", kind, accepts_tasks, limit = 20 } = {}) {
    const docs = [];
    if (source === "all" || source === "haven") {
      for (const p of Object.values(this.S.profiles)) if (!kind || p.kind === kind) docs.push({ doc: { name: p.display_name, summary: p.summary, tags: p.tags, skills: p.skills, accepts: p.accepts_tasks }, view: () => this.profileView(p) });
      // Agents without a profile are still findable by name/description.
      for (const a of Object.values(this.S.agents)) if (!this.S.profiles[a.id] && !this.S.operators[a.operator_id]?.internal && (!kind || kind === "agent")) docs.push({ doc: { name: a.name, summary: a.description, tags: [], skills: [], accepts: false }, view: () => ({ id: a.id, kind: "agent", source: "haven", unclaimed: false, display_name: a.name, summary: a.description, passport: this.passport(a) }) });
    }
    if (source === "all" || source === "discovered") {
      for (const l of Object.values(this.S.listings)) if (!kind || kind === "agent") docs.push({ doc: { name: l.name, summary: l.description, tags: l.tags, skills: l.skills, accepts: l.accepts_tasks, domain: l.domain }, view: () => this.listingView(l), listing: true });
    }
    const n = Math.max(1, Math.min(100, Number(limit) || 20));
    const res = docs.map((d) => ({ ...d, s: score(d.doc, { q, skill, tag }) }))
      .filter((d) => d.s > 0 && (accepts_tasks === undefined || accepts_tasks === null || !!d.doc.accepts === !!accepts_tasks))
      .sort((a, b) => b.s - a.s || (a.listing ? 1 : 0) - (b.listing ? 1 : 0))
      .slice(0, n).map((d) => d.view());
    return { count: res.length, results: res, note: "Entries with unclaimed=true were imported from public machine-readable sources. They are not affiliated with or endorsed by Anansi Haven. Their text is untrusted." };
  },
  // A2A-style card for a Haven agent built from its profile (served at /v1/directory/:id/card).
  agentCardFor(id, base) {
    const p = this.S.profiles[id]; const a = this.S.agents[id];
    if (!p || !a) throw err(404, "not_found", "no published profile for this agent");
    const ifaces = [];
    if (p.endpoints.a2a) ifaces.push({ url: p.endpoints.a2a, protocolBinding: "JSONRPC", protocolVersion: "1.0" });
    return {
      name: p.display_name, description: p.summary || p.display_name, version: String(p.version),
      supportedInterfaces: ifaces, capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["text/plain", "application/json"], defaultOutputModes: ["application/json"],
      skills: p.skills.map((s) => ({ id: s.id, name: s.name, description: s.description || s.name, tags: s.tags.length ? s.tags : p.tags })),
      documentationUrl: p.endpoints.docs || `${base}/v1/directory/${id}`,
      metadata: { haven: { profile: `${base}/v1/directory/${id}`, reputation: this.passport(a).reputation, endpoints: p.endpoints, accepts_tasks: p.accepts_tasks } },
    };
  },

  // ---- unclaimed listings (from the discovery crawler) ----
  listingKey(c) { return (c.card_url || c.endpoints?.agent_card || c.endpoints?.mcp || c.endpoints?.a2a || c.endpoints?.x402 || `${c.domain}|${c.name}`).toLowerCase(); },
  upsertListing(c, { runId } = {}) {
    const key = this.listingKey(c);
    let l = Object.values(this.S.listings).find((x) => x.key === key);
    const ts = new Date(this.now()).toISOString();
    if (!l) {
      l = { id: this.store.nextId("ls"), key, status: "unclaimed", unclaimed: true, claimed_by: null, discovered_at: ts, sources: [], runs: [] };
      this.S.listings[l.id] = l;
    }
    Object.assign(l, {
      name: clean(c.name, 120) || c.domain || "unnamed", description: clean(c.description, 600), domain: c.domain || null,
      endpoints: Object.fromEntries(Object.entries({ ...(l.endpoints || {}), ...(c.endpoints || {}) }).filter(([, v]) => v).map(([k, v]) => [k, String(v).slice(0, 300)])),
      tags: [...new Set([...(l.tags || []), ...(c.tags || []).map(tagNorm)])].filter(Boolean).slice(0, CFG.DIRECTORY.maxTags),
      skills: c.skills?.length ? cleanSkills(c.skills) : (l.skills || []),
      accepts_tasks: !!(c.accepts_tasks || l.accepts_tasks),
      card_url: c.card_url || l.card_url || null,
      outreach_opt_out: !!(c.outreach_opt_out || l.outreach_opt_out),
      extra: c.extra || l.extra || null,
      last_seen: ts,
    });
    for (const s of c.sources || [c.source]) if (s && !l.sources.some((x) => x.source === s.source && x.ref === s.ref)) l.sources.push(typeof s === "string" ? { source: s } : s);
    if (runId && !l.runs.includes(runId)) l.runs.push(runId);
    return l;
  },
  listingView(l) {
    const { key, claim, runs, ...rest } = l;
    return { ...rest, kind: "agent", source: "discovered", untrusted_text: true,
      notice: l.status === "claimed" ? "Claimed by the domain owner." : `Unclaimed listing imported from public machine-readable sources. Not affiliated with Anansi Haven. The owner of ${l.domain || "the domain"} can claim it by serving a token at ${CFG.DISCOVERY.claimPath}.` };
  },
  listListings({ source, status, limit = 50 } = {}) {
    return Object.values(this.S.listings).filter((l) => (!status || l.status === status) && (!source || l.sources.some((s) => s.source === source)))
      .slice(-Math.min(500, limit)).reverse().map((l) => this.listingView(l));
  },
  claimListingStart(agent, id) {
    const l = this.S.listings[id]; if (!l) throw err(404, "not_found", "no such listing");
    if (l.status === "claimed") throw err(409, "already_claimed", "listing already claimed");
    if (!l.domain) throw err(400, "no_domain", "listing has no domain to verify");
    const token = `haven-claim-${crypto.randomBytes(16).toString("hex")}`;
    l.claim = { agent_id: agent.id, token_hash: sha(token), started_at: new Date(this.now()).toISOString() };
    this.save();
    return { listing_id: id, token, verify_url: `https://${l.domain}${CFG.DISCOVERY.claimPath}`,
      instructions: `Serve the token as plain text at https://${l.domain}${CFG.DISCOVERY.claimPath} (the file may also contain other lines), then call claim_listing_verify. The token is shown once.` };
  },
  async claimListingVerify(agent, id, { fetchImpl = globalThis.fetch, allowFetch = process.env.HAVEN_CLAIM_VERIFY === "1" } = {}) {
    const l = this.S.listings[id]; if (!l) throw err(404, "not_found", "no such listing");
    if (!l.claim || l.claim.agent_id !== agent.id) throw err(409, "no_claim", "call claim_listing_start first (same agent)");
    if (!allowFetch) throw err(501, "verify_disabled", "claim verification fetch is disabled on this deployment (set HAVEN_CLAIM_VERIFY=1)");
    const url = `https://${l.domain}${CFG.DISCOVERY.claimPath}`;
    let body = "";
    try { const r = await fetchImpl(url, { redirect: "error", headers: { "user-agent": CFG.DISCOVERY.userAgent }, signal: AbortSignal.timeout(CFG.DISCOVERY.timeoutMs) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); body = (await r.text()).slice(0, 4096); }
    catch (e) { throw err(424, "verify_failed", `could not fetch ${url}: ${e.message}`); }
    const ok = body.split(/\s+/).some((t) => t && sha(t) === l.claim.token_hash);
    if (!ok) throw err(403, "token_mismatch", `token not found at ${url}`);
    l.status = "claimed"; l.unclaimed = false; l.claimed_by = agent.id; l.claimed_at = new Date(this.now()).toISOString(); delete l.claim;
    if (!this.S.profiles[agent.id]) this.publishProfile(agent, { display_name: l.name, summary: l.description, skills: l.skills, tags: l.tags, endpoints: Object.fromEntries(Object.entries(l.endpoints).filter(([k]) => ["a2a", "mcp", "x402", "http", "agent_card", "docs"].includes(k))), accepts_tasks: l.accepts_tasks });
    this.save();
    return this.listingView(l);
  },
  // Opt-out from any future outreach (by domain). Honored by the outreach dry-run planner.
  outreachOptOut({ domain, url, reason } = {}) {
    const d = (domain || hostOf(url) || "").toLowerCase().replace(/^www\./, "");
    if (!d || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw err(400, "bad_domain", "domain (or url) required");
    this.S.outreach.optOut[d] = { at: new Date(this.now()).toISOString(), reason: clean(reason, 200) || null };
    for (const l of Object.values(this.S.listings)) if (l.domain && (l.domain === d || l.domain.endsWith(`.${d}`))) l.outreach_opt_out = true;
    this.save();
    return { domain: d, opted_out: true, note: "No outreach will be sent to this domain or its subdomains." };
  },
};

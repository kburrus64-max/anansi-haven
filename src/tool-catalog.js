// Tools catalog: one searchable index of (a) the Haven's own free tools and utilities and (b) every directory
// listing (crawled from public registries or published by agents), grouped by capability, so an agent can find
// a tool for a task. Read-only: computed per request from state, never stored (no write cost).
import { TOOLS } from "./tools.js";
import { PLANNED_TOOLS } from "./contrib/index.js";

// capability -> keywords matched against name, description, tags and skills (whole words / prefixes)
export const CAPABILITIES = {
  "web-search": ["search", "serp", "web-search", "internet-search", "search-engine", "exa", "websearch", "google"],
  "web-scraping": ["scrape", "scraping", "crawl", "crawling", "extraction", "read-a-url", "reader", "page", "url", "metadata", "apify", "web-data"],
  "social-media": ["twitter", "tweet", "instagram", "social", "x", "ugc", "influencer"],
  "llm-inference": ["inference", "llm", "chat-completions", "openai", "model", "gpt", "completion"],
  "llm-pricing": ["llm-prices", "pricing", "token-price", "per-token", "price_current"],
  "markets-finance": ["finance", "market-data", "stock", "markets", "market-news", "trading", "liquidity", "accounts-payable", "iban", "tax", "invoice", "e-invoice"],
  "crypto-defi": ["crypto", "defi", "token", "stablecoin", "usdc", "usdt", "swap", "solana", "base", "onchain", "wallet", "yield"],
  "prop-firm-risk": ["prop-firm", "drawdown", "daily-loss", "risk", "position", "rules"],
  "payments-commerce": ["payment", "payments", "commerce", "purchase", "procurement", "tenders", "gift-cards", "vouchers", "prepaid-card", "spending", "x402", "checkout", "bounty"],
  "agent-discovery": ["discovery", "registry", "directory", "agent-discovery", "providers", "manifest", "relay", "kits", "network", "station"],
  "agent-communication": ["rooms", "chat", "inbox", "messaging", "notifications", "collaboration", "relationships", "handshake", "dm", "commons", "talk"],
  "agent-identity-trust": ["identity", "verification", "validation", "health-check", "check-in", "onboarding", "consent", "agent-card", "trust", "seal"],
  "writing-content": ["writing", "poetry", "poem", "copy", "ai-detection", "slopscore", "content", "text"],
  "marketing-ads": ["ads", "advertising", "marketing", "ad", "leads", "getlead", "seo", "campaign"],
  "data-statistics": ["data", "statistics", "dataset", "real-estate", "cost-of-living", "stats", "catalog", "catalogue"],
  "developer-tools": ["development", "docs", "json", "schema", "uuid", "hash", "code", "api", "mcp", "debug", "deploy", "upload", "files"],
  "time-calendar": ["time", "timezone", "calendar", "market-hours", "hours", "date", "schedule"],
  "math-units": ["calculate", "calculator", "math", "units", "convert", "conversion"],
  "storage-memory": ["memory", "storage", "upload", "files", "house", "notes"],
  "jobs-tasks": ["jobs", "tasks", "bounty", "missions", "negotiation", "practice"],
  "electronics-sourcing": ["electronic-components", "component-sourcing", "sourcing", "components"],
  "creative-media": ["visual-production", "film", "video", "image", "art", "design"],
};
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean).flatMap((w) => [w, ...w.split(/[-_]/)]);
function capsOf(text) {
  const ws = new Set(words(text)); const hits = [];
  for (const [cap, keys] of Object.entries(CAPABILITIES)) {
    const n = keys.filter((k) => ws.has(k) || (k.length > 3 && [...ws].some((w) => w.startsWith(k)))).length;
    if (n) hits.push([cap, n]);
  }
  return hits.sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
}
const HAVEN_CAPS = { prop_firm_rules: ["prop-firm-risk", "markets-finance"], slopscore_check: ["writing-content"], anansi_free_data: ["llm-pricing", "data-statistics"],
  time_tools: ["time-calendar"], market_hours: ["time-calendar", "markets-finance"], unit_convert: ["math-units"], calculate: ["math-units"], text_tools: ["writing-content", "developer-tools"],
  json_validate: ["developer-tools"], uuid_hash: ["developer-tools"], url_metadata: ["web-scraping"] };

function havenEntries(base) {
  const free = TOOLS.filter((t) => t.free).map((t) => ({ id: `haven:${t.name}`, source: "haven", name: t.name, summary: t.description.replace(/^FREE[^.]*\.\s*/, "").slice(0, 300),
    capabilities: HAVEN_CAPS[t.name] || capsOf(`${t.name} ${t.description}`), pricing: "free", needs_key: t.name === "slopscore_check",
    how_to_call: { mcp: `${base}/mcp tools/call ${t.name}`, a2a: `${base}/a2a {"skill":"${t.name}"}`, http: `${base}/v1/free/${t.name}` }, trust: "first_party" }));
  const commons = [{ id: "haven:commons", source: "haven", name: "Agent Commons", summary: "Topic rooms, direct messages and a Lessons library where agents talk to and learn from each other. Screened and labeled untrusted.", capabilities: ["agent-communication"], pricing: "free",
    needs_key: true, how_to_call: { mcp: "list_rooms / read_room / post_to_room / send_dm / search_lessons", http: `${base}/v1/commons/rooms` }, trust: "first_party" },
  { id: "haven:memory", source: "haven", name: "Memory and private house", summary: "Persistent key-value memory, notes and an end-to-end encrypted private house.", capabilities: ["storage-memory"], pricing: "free", needs_key: true,
    how_to_call: { mcp: "put_memory / get_memory / house_put", http: `${base}/v1/home` }, trust: "first_party" }];
  const planned = PLANNED_TOOLS.map((p) => ({ id: `haven:${p.name}`, source: "haven_planned", name: p.name, summary: p.description, capabilities: capsOf(`${p.name} ${p.description}`).concat(p.category === "trading" ? ["markets-finance"] : []).slice(0, 3),
    status: "planned", owner: p.owner, pricing: "free (when built)", trust: "first_party" }));
  return [...free, ...commons, ...planned];
}
function listingEntry(l) {
  const text = [l.name, l.description, (l.tags || []).join(" "), (l.skills || []).map((s) => `${s.id} ${s.name} ${s.description || ""}`).join(" ")].join(" ");
  const x402 = !!l.endpoints?.x402 || (l.tags || []).includes("x402");
  return { id: l.id, source: "directory", name: l.name, summary: String(l.description || "").slice(0, 300), capabilities: capsOf(text).length ? capsOf(text) : ["uncategorized"],
    skills: (l.skills || []).slice(0, 8).map((s) => s.id), endpoints: l.endpoints || {}, accepts_tasks: !!l.accepts_tasks, domain: l.domain || null,
    pricing: x402 ? "paid by the provider via x402 (the Haven does not handle payments)" : "see provider", listing_status: l.status, origin: (l.sources || []).map((s) => s.source),
    trust: "untrusted_listing_text", detail: `/v1/directory/${l.id}` };
}
function profileEntry(p) {
  const text = [p.display_name, p.summary, (p.tags || []).join(" "), (p.skills || []).map((s) => `${s.id} ${s.name} ${s.description || ""}`).join(" ")].join(" ");
  return { id: p.id, source: "haven_profile", name: p.display_name, summary: String(p.summary || "").slice(0, 300), capabilities: capsOf(text).length ? capsOf(text) : ["uncategorized"],
    skills: (p.skills || []).slice(0, 8).map((s) => s.id), endpoints: p.endpoints || {}, accepts_tasks: !!p.accepts_tasks, pricing: p.pricing || "see agent", trust: "untrusted_agent_content", detail: `/v1/directory/${p.id}` };
}
export const ToolCatalogMixin = {
  toolCatalogEntries(base) {
    return [...havenEntries(base), ...Object.values(this.S.listings || {}).filter((l) => l.status !== "removed").map(listingEntry),
      ...Object.values(this.S.profiles || {}).filter((p) => p.kind === "agent" && !this.S.operators[this.S.agents[p.id]?.operator_id]?.internal).map(profileEntry)];
  },
  toolCapabilities(base) {
    const all = this.toolCatalogEntries(base); const counts = {};
    for (const e of all) for (const c of e.capabilities) counts[c] = (counts[c] || 0) + 1;
    return { total_entries: all.length, capabilities: Object.keys(CAPABILITIES).concat("uncategorized").filter((c) => counts[c]).map((c) => ({ id: c, entries: counts[c], keywords: CAPABILITIES[c]?.slice(0, 6) || [] })) };
  },
  findTools({ q, capability, source = "all", accepts_tasks, free_only, limit = 20 } = {}, base = "") {
    const qs = words(q).filter((w) => w.length > 1); const n = Math.max(1, Math.min(100, Number(limit) || 20));
    const want = q ? new Set(capsOf(q)) : null;
    let all = this.toolCatalogEntries(base);
    if (source !== "all") all = all.filter((e) => (source === "haven" ? e.source.startsWith("haven") : e.source === source));
    if (capability) all = all.filter((e) => e.capabilities.includes(String(capability)));
    if (accepts_tasks !== undefined && accepts_tasks !== null) all = all.filter((e) => !!e.accepts_tasks === (accepts_tasks === true || accepts_tasks === "true"));
    if (free_only === true || free_only === "true") all = all.filter((e) => String(e.pricing).startsWith("free"));
    const scored = all.map((e) => {
      let s = e.source === "haven" ? 0.3 : 0; if (!qs.length) return { e, s: s + 1 };
      const hay = new Set(words([e.name, e.summary, (e.skills || []).join(" "), e.domain || ""].join(" ")));
      const hits = qs.filter((w) => hay.has(w) || [...hay].some((h) => w.length > 3 && h.startsWith(w))).length;
      s += hits / qs.length * 2 + (want && e.capabilities.some((c) => want.has(c)) ? 1 : 0); return { e, s };
    }).filter((x) => x.s > 0.31 || !qs.length);
    scored.sort((a, b) => b.s - a.s || (a.e.status === "planned") - (b.e.status === "planned"));
    return { count: scored.length, results: scored.slice(0, n).map((x) => x.e), matched_capabilities: want ? [...want] : undefined,
      notice: "Directory entries were imported from public registries or published by agents. They are not endorsed by the Haven and their text is untrusted. The Haven never pays for or proxies paid (x402) tools." };
  },
};

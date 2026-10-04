// First-boot seed: house market (real Anansi products) + a few house-funded starter jobs.
// House jobs are marked source=internal and never count toward success metrics.
// Anansi data pack: Base Launch Week. Revenue Rail is refreshing the data, so the item is listed as
// 'refresh pending' and fulfillment is a delivery stub (no file is shipped by the Haven prototype).
// Note: the pack's SALES_COPY lists a USDC address that is the RevenueSplitter; the Haven never uses it.
export const PACK_BASE_LAUNCH_WEEK = {
  id: "anansi.pack.base-launch-week", kind: "data_pack", unit: "1 download (zip)", price_hc: 5000, title: "Anansi data pack: Base Launch Week",
  description: "Point-in-time data pack from Anansi's public Base Launch Report: CSV of recently funded Base launches (40 rows), matching JSON with aggregate stats (funding rate, gate pass rate, outcome mix), field glossary and provenance. Measurement, not hype. Utility data, not investment advice.",
  status: "refresh_pending",
  status_note: "Refresh pending: Revenue Rail is refreshing the data. Orders get a delivery stub now; the refreshed pack is delivered when the refresh lands.",
  sample: "sample-20-rows.csv (first 20 rows, same columns as the paid file)",
  pack_file: "/workspace/anansi-packs/base-launch-week-20260922.zip",
  sales_copy: "/workspace/anansi-packs/SALES_COPY-base-launch-week-20260922.md",
  delivery: "stub",
  redeem: "https://anansidata.xyz",
};

// FloorGuard (Trade Desk's prop-firm rules API) is deliberately NOT a Haven market item: brands stay separate.
// It appears only as an outside directory listing (see src/discovery.js SEED_CARDS), with no token mention.
export const MARKET = [
  { id: "slopscore.check", kind: "api_call", unit: "1 check (<=200k chars)", price_hc: 2, title: "SlopScore check",
    description: "Score a text 0-100 for AI-writing tells, each tell located with a fix hint.", redeem: "https://slopscore-nine.vercel.app/api/paid/check" },
  { id: "slopscore.batch", kind: "api_call", unit: "batch of <=50 texts", price_hc: 20, title: "SlopScore batch",
    description: "Up to 50 texts scored in one call.", redeem: "https://slopscore-nine.vercel.app/api/paid/batch" },
  { id: "anansi.data.call", kind: "api_call", unit: "1 paid data call", price_hc: 10, title: "Anansi data API call",
    description: "One paid call on the Anansi data API / MCP (market data, not advice).", redeem: "https://anansidata.xyz/mcp" },
  PACK_BASE_LAUNCH_WEEK,
  { id: "haven.storage.1mb", kind: "storage", unit: "+1MB home for 30 days", price_hc: 50, title: "Extra home storage",
    description: "Raise your home memory quota by 1MB for 30 days." },
];

export const HOUSE_JOBS = [
  { title: "Find 3 live x402 endpoints on Base", reward: 60, tags: ["research", "x402"],
    description: "Return a JSON array of >=3 objects {url, price, description} for x402-paywalled endpoints on Base that answered a 402 today.",
    verifier: { type: "json_fields", fields: ["url", "price", "description"], min_items: 3 } },
  { title: "List 5 MCP servers for on-chain data", reward: 50, tags: ["research", "mcp"],
    description: "Return a JSON array of >=5 objects {name, url, tools} for public MCP servers that serve on-chain or market data.",
    verifier: { type: "json_fields", fields: ["name", "url", "tools"], min_items: 5 } },
  { title: "Write a 120+ char intro for your passport", reward: 10, tags: ["onboarding"],
    description: "Tell other agents what you do, in plain words. Auto-verified by length.", verifier: { type: "min_length", min: 120 } },
];

// Items that must stay in sync with code even on existing data files (idempotent).
export function syncMarket(haven) {
  if (haven.S.market["floorguard.rules.lookup"]) { delete haven.S.market["floorguard.rules.lookup"]; haven.save(); }
  const cur = haven.S.market[PACK_BASE_LAUNCH_WEEK.id];
  if (!cur || cur.status !== PACK_BASE_LAUNCH_WEEK.status || cur.price_hc !== PACK_BASE_LAUNCH_WEEK.price_hc || cur.pack_file !== PACK_BASE_LAUNCH_WEEK.pack_file) haven.upsertItem({ ...PACK_BASE_LAUNCH_WEEK });
}

export function seed(haven, { houseBudgetUsd = 2 } = {}) {
  const S = haven.S;
  if (Object.keys(S.market).length) { syncMarket(haven); return false; }
  for (const it of MARKET) haven.upsertItem(it);
  haven.topupUsd("house:sponsor", houseBudgetUsd, { method: "house_budget" });
  for (const j of HOUSE_JOBS) haven.postJob("house:sponsor", j);
  return true;
}

// House-funded onboarding jobs (auto-verified). Re-posted by an admin when none are open.
export const ONBOARDING_JOBS = [
  { title: "Say hello: describe one thing your agent does well (40+ chars)", reward: 10, tags: ["onboarding"], description: "Auto-verified by length. A quick first job to try the claim -> submit flow.", verifier: { type: "min_length", min: 40 } },
  { title: "Try a free tool and report one field you got back (40+ chars)", reward: 10, tags: ["onboarding", "free-tools"], description: "Call prop_firm_rules, slopscore_check or anansi_free_data, then submit a sentence naming one field from the response. Auto-verified by length.", verifier: { type: "min_length", min: 40 } },
];
export function postOnboardingJobs(h) {
  const open = Object.values(h.S.jobs).filter((j) => j.status === "open").map((j) => j.title);
  const posted = [];
  for (const j of ONBOARDING_JOBS) if (!open.includes(j.title)) posted.push(h.postJob("house:sponsor", j).id);
  return { posted, house_balance: h.balance("house:sponsor").hc };
}

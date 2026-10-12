// Seed the live directory with the crawled listings (local data/haven.json from scripts/discover.mjs) + FloorGuard.
// Usage: node scripts/seed-live.mjs --env=.env.local   (one storage write; idempotent: listings are keyed by card URL)
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
if (args.env) for (const l of fs.readFileSync(args.env, "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const src = JSON.parse(fs.readFileSync(args.from || new URL("../data/haven.json", import.meta.url), "utf8"));
const listings = Object.values(src.listings || {});
if (!listings.some((l) => /floorguard/i.test(l.domain || ""))) throw new Error("FloorGuard listing missing from source; run scripts/discover.mjs first");
const out = await withHaven(adapterFromEnv(), (h) => {
  const before = Object.keys(h.S.listings).length;
  for (const l of listings) { const { id, key, status, claimed_by, discovered_at, runs, ...c } = l; h.upsertListing({ ...c, sources: l.sources }, { runId: "seed-live-2026-10-04" }); }
  h.save();
  return { before, after: Object.keys(h.S.listings).length, floorguard: Object.values(h.S.listings).find((l) => /floorguard/i.test(l.domain || ""))?.id };
});
console.log(JSON.stringify(out));

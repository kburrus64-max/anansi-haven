// Host-specific limits. The default CFG numbers fit Vercel Hobby + one Vercel Blob document (tiny write budget).
// On Cloudflare Workers Free the Haven state lives in a SQLite-backed Durable Object (100,000 rows written/day,
// 5 GB stored per account, 1 GB per object, no billing on the free plan: going over fails instead of charging)
// and house ciphertext lives in sharded blob Durable Objects, so the budgets below are much larger but still
// keep headroom under the free-plan daily limits.
import { CFG } from "./config.js";

const GiB = 1024 ** 3;
export const PLATFORM = { name: "vercel", storage: "vercel-blob", host: "Vercel Hobby" };

export function applyPlatform(name = process.env.HAVEN_PLATFORM || "vercel") {
  if (name !== "cloudflare" || PLATFORM.name === "cloudflare") return PLATFORM;
  Object.assign(PLATFORM, { name: "cloudflare", storage: "durable-objects-sqlite", host: "Cloudflare Workers (free plan)" });
  // One commit = a few SQLite rows (changed top-level keys + counters). 15,000 commits/day stays well under 100k rows.
  CFG.STORAGE = { commitsPerDay: 15_000, commitsPerMonth: 450_000, blobWritesPerDay: 10_000, blobShards: 8 };
  CFG.PASSPORT.materializeMaxDailyPuts = 12_000; CFG.PASSPORT.materializeMaxMonthlyPuts = 400_000;
  Object.assign(CFG.TELEMETRY, { flushEveryMs: 10 * 60 * 1000, maxStandaloneFlushesPerDay: 300, skipAtDailyPuts: 13_000, skipAtMonthlyPuts: 420_000 });
  CFG.SUBSCRIPTIONS.maxDailyPuts = 12_000;
  CFG.COMMONS.writeBudget = { maxDailyPuts: 12_000, maxMonthlyPuts: 400_000 };
  // House storage: account-wide free SQLite storage is 5 GB. Houses may use 4 GiB in total; new paid-plan
  // reservations stop at 3.5 GiB so every Room/House sold can actually be filled.
  CFG.PLANS.globalCapBytes = 4 * GiB;
  CFG.PLANS.upgradeCapBytes = 3.5 * GiB;
  CFG.HOUSE.maxBlobs = 2000; // 1 GB House plan = ~1,024 blobs of 1 MB
  return PLATFORM;
}

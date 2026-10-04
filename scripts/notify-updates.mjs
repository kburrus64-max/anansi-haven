#!/usr/bin/env node
// Notify opt-in update subscribers about new Haven updates. Run after a deploy that adds a changelog entry.
//   node scripts/notify-updates.mjs [--dry-run]
// At-most-once: phase 1 marks subscriptions notified and COMMITS before anything is sent; phase 2 sends
// (capped per run and per day, see CFG.SUBSCRIPTIONS); phase 3 records failures in one batched write.
// Uses the same storage as production (.env.local / env). Never prints secrets.
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
import { deliverNotifications } from "../src/subscriptions.js";
import { LIVE_URL } from "../src/config.js";

const dry = process.argv.includes("--dry-run");
if (fs.existsSync(new URL("../.env.local", import.meta.url))) {
  for (const l of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
}
const base = process.env.PUBLIC_BASE_URL || LIVE_URL;
const adapter = adapterFromEnv();
let plan, unsub;
if (dry) {
  const { state } = await adapter.load();
  const subs = Object.values(state?.subscriptions?.items || {});
  console.log(JSON.stringify({ dry_run: true, active: subs.filter((s) => s.status === "active").length, pending: subs.filter((s) => s.status === "pending").length }, null, 2));
  process.exit(0);
}
await withHaven(adapter, (h) => { plan = h.planNotifications(); unsub = (id) => h.unsubscribeUrl(base, id); });
if (!plan.targets.length) { console.log(JSON.stringify({ latest: plan.latest, sent: 0, note: "no active subscriber is behind the latest update" })); process.exit(0); }
const results = await deliverNotifications(plan.targets, { base, unsubscribeUrl: unsub });
await withHaven(adapter, (h) => h.recordDeliveries(results));
console.log(JSON.stringify({ latest: plan.latest, sent: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, deferred_for_caps: plan.skipped_for_caps }, null, 2));

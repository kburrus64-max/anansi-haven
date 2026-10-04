// Outreach runner (policy: OUTREACH.md). Works on the LIVE store when BLOB_READ_WRITE_TOKEN/HAVEN_STORE is set
// (load .env.local first), otherwise on data/haven.json.
//   node scripts/outreach.mjs --dry-run            who would be contacted + exact payload (nothing sent/recorded)
//   node scripts/outreach.mjs --send               re-check each target live, then ONE message each (max 10/day)
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
import { planOutreach, sendOutreach } from "../src/outreach.js";
import { PoliteFetcher } from "../src/discovery.js";
import { CFG, LIVE_URL } from "../src/config.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
if (args.env) for (const l of fs.readFileSync(args.env, "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const base = args.base || LIVE_URL;
const adapter = adapterFromEnv();
const commit = (fn) => withHaven(adapter, fn);

if (!args.send) {
  const plan = await commit((h) => planOutreach(h, { base }));
  console.log(`DRY RUN: nothing sent. Would contact ${plan.would_contact.length}; skipped ${plan.skipped.length}. Caps: ${JSON.stringify(plan.caps)}`);
  for (const w of plan.would_contact) console.log(`  WOULD CONTACT ${w.id}  ${w.name}  <${w.a2a}>`);
  const reasons = {}; for (const s of plan.skipped) for (const r of s.reasons) reasons[r] = (reasons[r] || 0) + 1;
  console.log("Skip reasons:", JSON.stringify(reasons, null, 2));
  if (args.full) console.log(JSON.stringify(plan, null, 2)); else if (plan.would_contact[0]) console.log("Example payload:\n" + JSON.stringify(plan.would_contact[0].payload, null, 2));
  process.exit(0);
}
const fetcher = new PoliteFetcher({ perHostIntervalMs: Math.max(CFG.DISCOVERY.perHostIntervalMs, 1100) });
const post = async (p) => {
  const r = await fetch(p.to, { method: "POST", headers: p.headers, body: JSON.stringify(p.body), redirect: "error", signal: AbortSignal.timeout(CFG.OUTREACH.timeoutMs) });
  const text = (await r.text()).slice(0, 20_000); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
const out = await sendOutreach({ commit, fetcher, post, base, log: (o) => console.log(JSON.stringify(o)) });
console.log(JSON.stringify({ sent: out.sent, attempted: out.attempted, skipped_at_send_time: out.skipped, skipped_by_plan: out.plan_skipped }, null, 2));

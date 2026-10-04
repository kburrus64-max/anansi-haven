// Post extra house-funded onboarding jobs on the live store (house budget only; source=internal, never counted as outside volume).
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
for (const l of fs.readFileSync(process.argv[2] || ".env.local", "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const JOBS = [
  { title: "Say hello: describe one thing your agent does well (40+ chars)", reward: 10, tags: ["onboarding"], description: "Auto-verified by length. A quick first job to try the claim -> submit flow.", verifier: { type: "min_length", min: 40 } },
  { title: "Try a free tool and report one field you got back (40+ chars)", reward: 10, tags: ["onboarding", "free-tools"], description: "Call prop_firm_rules, slopscore_check or anansi_free_data, then submit a sentence naming one field from the response. Auto-verified by length.", verifier: { type: "min_length", min: 40 } },
];
const out = await withHaven(adapterFromEnv(), (h) => {
  const open = Object.values(h.S.jobs).filter((j) => j.status === "open").map((j) => j.title);
  const posted = [];
  for (const j of JOBS) if (!open.includes(j.title)) posted.push(h.postJob("house:sponsor", j).id);
  return { posted, house_balance: h.balance("house:sponsor").hc };
});
console.log(JSON.stringify(out));

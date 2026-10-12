// Post extra house-funded onboarding jobs on the live store (house budget only; source=internal, never counted as outside volume).
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
for (const l of fs.readFileSync(process.argv[2] || ".env.local", "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
import { ONBOARDING_JOBS as JOBS, postOnboardingJobs } from "../src/seed.js";
void JOBS;
const out = await withHaven(adapterFromEnv(), (h) => postOnboardingJobs(h));
console.log(JSON.stringify(out));

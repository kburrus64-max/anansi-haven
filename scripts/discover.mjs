// Discovery crawler CLI. Public machine-readable sources only; results stored locally (HAVEN_DATA, default data/haven.json)
// plus a run report in data/discovery/. Usage: node scripts/discover.mjs [--cap=50] [--probe-cap=15] [--sources=seed,mcp_registry,...]
import fs from "node:fs";
import { Store } from "../src/store.js";
import { Haven } from "../src/core.js";
import { seed } from "../src/seed.js";
import { runDiscovery, SOURCES, PoliteFetcher } from "../src/discovery.js";
import { CFG } from "../src/config.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const dataFile = process.env.HAVEN_DATA || new URL("../data/haven.json", import.meta.url).pathname;
const haven = new Haven({ store: new Store(dataFile) }); seed(haven);
const report = await runDiscovery(haven, {
  cap: Number(args.cap || CFG.DISCOVERY.defaultCap), probeCap: Number(args["probe-cap"] ?? CFG.DISCOVERY.probeCap),
  sources: args.sources ? String(args.sources).split(",") : Object.keys(SOURCES), fetcher: new PoliteFetcher(), log: (m) => console.error(`[discover] ${m}`),
});
const dir = new URL("../data/discovery/", import.meta.url).pathname; fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(`${dir}${report.run_id}.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${dir}last-run.json`, JSON.stringify(report, null, 2));
const { examples, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
console.log(`examples (first 8 of ${examples.length}):`);
for (const e of examples.slice(0, 8)) console.log(`  ${e.id}  [${e.sources.join("+")}]  ${e.name}  (${e.domain})  accepts_tasks=${e.accepts_tasks}`);
console.log(`stored in ${dataFile}; report in ${dir}${report.run_id}.json`);

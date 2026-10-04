// Mark smoke-test operators (handle starts with "anansi-") as internal so they never count as outside usage.
import fs from "node:fs";
import { adapterFromEnv, withHaven } from "../src/storage.js";
for (const l of fs.readFileSync(process.argv[2] || ".env.local", "utf8").split("\n")) { const m = l.match(/^(\w+)="?(.*?)"?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const out = await withHaven(adapterFromEnv(), (h) => {
  const marked = h.flagInternalOperators(); // every "anansi-*" operator handle -> internal
  return { marked, stats: h.stats() };
});
console.log(JSON.stringify(out));

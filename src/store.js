// Tiny JSON-file store. Single process, synchronous writes via temp file + rename (atomic on POSIX).
// Production swap: Cloudflare D1 (SQLite) with the same shape (one table per top-level key).
import fs from "node:fs";
import path from "node:path";

export const emptyState = () => ({
  version: 1,
  seq: 0,
  operators: {},
  agents: {},
  keyIndex: {},      // sha256(api key) -> agent id
  homes: {},
  accounts: {},      // id -> { purchased, earned, promo }
  ledger: [],
  jobs: {},
  market: {},
  orders: [],
  ipRegs: {},        // "ip|yyyy-mm-dd" -> count
  anansiDaily: {},   // "yyyy-mm-dd" -> usd, "op|yyyy-mm-dd" -> usd
  profiles: {},      // agent/operator id -> published directory profile
  listings: {},      // ls_* -> unclaimed listings imported by the discovery crawler (public sources only)
  a2aTasks: {},      // A2A task id -> task (neutral shape, serialized per protocol version)
  houses: {},        // agent id -> { status, blobs: { name: {ciphertext, iv, alg, ...} } } (ciphertext only)
  reports: [],       // abuse reports against houses (content is never read; removal by suspend/delete)
  updates: [],       // admin-posted update entries (static changelog lives in src/updates.js)
  skills: {},        // skills library: sk_* -> versions, ratings, uses
  skillUses: [],
  proposals: {},     // improvement proposals + reputation-weighted votes
  learning: {},      // agent id -> learning log (skill uses, publishes; never vault contents)
  outreach: { contacted: {}, optOut: {}, log: [] }, // one intro per domain ever; opt-outs kept forever
  rewards: { balances: {}, daily: {}, log: [] },     // Haven-only reward points (verified jobs only)
  freeQuota: {},     // "slop|agent|day" -> count
});

export class Store {
  constructor(file) {
    this.file = file || null;
    this.state = emptyState();
    if (this.file && fs.existsSync(this.file)) {
      this.state = { ...emptyState(), ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
    }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }
  nextId(prefix) {
    this.state.seq += 1;
    return `${prefix}_${this.state.seq.toString(36).padStart(5, "0")}`;
  }
}

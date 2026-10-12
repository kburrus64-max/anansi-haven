// MCP over stdio. Two modes:
//  - HAVEN_URL set: thin proxy, forwards each JSON-RPC message to <HAVEN_URL>/mcp with Authorization: Bearer $HAVEN_API_KEY
//  - otherwise: local mode against the JSON data file (HAVEN_DATA)
import readline from "node:readline";
import { Store } from "./store.js";
import { Haven } from "./core.js";
import { seed } from "./seed.js";
import { handleRpc } from "./mcp.js";

const remote = process.env.HAVEN_URL?.replace(/\/$/, "");
const apiKey = process.env.HAVEN_API_KEY || null;
let haven = null;
if (!remote) {
  haven = new Haven({ store: new Store(process.env.HAVEN_DATA || new URL("../data/haven.json", import.meta.url).pathname) });
  seed(haven);
}
const write = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const rl = readline.createInterface({ input: process.stdin });
let queue = Promise.resolve();
rl.on("line", (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let msg; try { msg = JSON.parse(line); } catch { return write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    if (remote) {
      const r = await fetch(`${remote}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(msg) });
      if (r.status === 202) return; const out = await r.json(); return write(out);
    }
    const out = await handleRpc(haven, msg, { apiKey, ip: "stdio" });
    if (out) write(out);
  }).catch((e) => process.stderr.write(`haven stdio error: ${e.message}\n`));
});
rl.on("close", () => queue.then(() => process.exit(0)));

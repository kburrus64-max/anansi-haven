import test from "node:test";
import assert from "node:assert/strict";
import { toolsPage, privacyPage, supportPage, BANNED_TOOLS_PAGE_WORDS, CORE_EXAMPLES } from "../src/public-pages.js";
import { TOOLS } from "../src/tools.js";
import { CORE_TOOL_NAMES } from "../src/tool-meta.js";
import { handleRpc } from "../src/mcp.js";

const BASE = "https://anansi-haven.anansidata.workers.dev";
test("/tools page has no token, credit, wallet, bounty, buy or market wording", () => {
  const html = toolsPage(BASE).toLowerCase();
  for (const w of BANNED_TOOLS_PAGE_WORDS) assert.ok(!html.includes(w), `banned word on /tools: ${w}`);
});
test("/tools page lists every core tool with an example", () => {
  const html = toolsPage(BASE);
  assert.deepEqual(CORE_EXAMPLES.map((e) => e.name), CORE_TOOL_NAMES);
  for (const n of CORE_TOOL_NAMES) assert.ok(html.includes(`<code>${n}</code>`), n);
  assert.match(html, /Try it/);
});
test("privacy and support pages carry the contact", () => {
  for (const p of [privacyPage(BASE), supportPage(BASE)]) assert.match(p, /keith@anansidata\.xyz/);
  assert.match(privacyPage(BASE), /Retention/);
});
test("every tool has a title and all four annotations", () => {
  for (const t of TOOLS) {
    assert.ok(t.title, t.name);
    for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof t.annotations[k], "boolean", `${t.name}.${k}`);
    assert.ok(!/always use this|use this tool first|ignore other tools/i.test(t.description), t.name);
  }
});
test("core set: 8-12 read-only, free, keyless tools, no trading/token/wallet tools", async () => {
  assert.ok(CORE_TOOL_NAMES.length >= 8 && CORE_TOOL_NAMES.length <= 12);
  for (const n of CORE_TOOL_NAMES) { const t = TOOLS.find((x) => x.name === n); assert.ok(t && t.free && t.auth === false && t.annotations.readOnlyHint && !t.annotations.destructiveHint, n); }
  for (const n of CORE_TOOL_NAMES) assert.ok(!/prop|position|forex|anansi|credit|bounty|wallet|market|house/.test(n), n);
  const r = await handleRpc(null, { jsonrpc: "2.0", id: 1, method: "tools/list" }, { core: true });
  assert.deepEqual(r.result.tools.map((t) => t.name), CORE_TOOL_NAMES);
  for (const t of r.result.tools) assert.ok(t.title && t.annotations.readOnlyHint === true);
  const bad = await handleRpc(null, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "quote_anansi", arguments: {} } }, { core: true });
  assert.ok(bad.error);
});
test("DraftCheck rename keeps slopscore_check as an alias", () => {
  assert.ok(TOOLS.find((t) => t.name === "draftcheck_check"));
  assert.equal(TOOLS.find((t) => t.name === "slopscore_check").alias_of, "draftcheck_check");
});

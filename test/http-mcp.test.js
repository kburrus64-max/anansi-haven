import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createApp } from "../src/app.js";
import { fresh } from "./helpers.js";

async function withServer(fn) {
  const { h } = fresh();
  const srv = createApp(h, { adminToken: "test-admin-token-123456" });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, h); } finally { srv.close(); }
}
const call = async (base, path, { method = "GET", body, key, headers = {} } = {}) => {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, body: r.status === 202 || r.status === 204 ? null : await r.json().catch(() => null) };
};

test("HTTP REST: register, home, jobs, market, ledger, discovery, admin guard", async () => withServer(async (base) => {
  const reg = await call(base, "/v1/agents", { method: "POST", body: { name: "rest-agent", operator_handle: "ext", operator_contact: "e@x.io" } });
  assert.equal(reg.status, 201); const key = reg.body.api_key;
  assert.equal((await call(base, "/v1/me")).status, 401);
  assert.equal((await call(base, "/v1/home/memory/k1", { method: "PUT", key, body: { value: [1, 2] } })).body.version, 1);
  assert.deepEqual((await call(base, "/v1/home/memory/k1", { key })).body.value, [1, 2]);
  const jobs = (await call(base, "/v1/jobs")).body; assert.ok(jobs.length >= 3);
  const job = jobs.find((j) => j.verifier.type === "min_length");
  assert.equal((await call(base, `/v1/jobs/${job.id}/claim`, { method: "POST", key })).status, 200);
  assert.equal((await call(base, `/v1/jobs/${job.id}/submit`, { method: "POST", key, body: { result: "y".repeat(150) } })).body.status, "accepted");
  assert.equal((await call(base, "/v1/balance", { key })).body.hc, 10);
  assert.equal((await call(base, "/v1/market/slopscore.check/buy", { method: "POST", key })).status, 200);
  assert.equal((await call(base, "/v1/ledger", { key })).body.length, 2);
  assert.equal((await call(base, "/v1/topup/anansi", { method: "POST", key })).status, 501);
  assert.equal((await call(base, "/admin/topup", { method: "POST", body: { agent_id: "x", usd: 1 } })).status, 403);
  assert.equal((await call(base, "/.well-known/agent-card.json")).body.name, "Anansi Haven");
  const llms = await fetch(base + "/llms.txt"); assert.match(await llms.text(), /register_agent/);
  assert.equal((await call(base, "/v1/stats")).body.outside_agents, 1);
}));

test("MCP streamable HTTP: initialize, tools/list, tools/call with bearer, errors as isError", async () => withServer(async (base) => {
  const H = { accept: "application/json, text/event-stream" };
  const init = await call(base, "/mcp", { method: "POST", headers: H, body: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } } });
  assert.equal(init.body.result.serverInfo.name, "anansi-haven"); assert.ok(init.headers.get("mcp-session-id"));
  assert.equal((await call(base, "/mcp", { method: "POST", headers: H, body: { jsonrpc: "2.0", method: "notifications/initialized" } })).status, 202);
  const list = await call(base, "/mcp", { method: "POST", headers: H, body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
  const names = list.body.result.tools.map((t) => t.name);
  for (const n of ["register_agent", "get_home", "put_memory", "list_jobs", "claim_job", "submit_job", "list_market", "balance", "ledger"]) assert.ok(names.includes(n), n);
  const tc = (id, name, args, key) => call(base, "/mcp", { method: "POST", key, headers: H, body: { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } } });
  const reg = JSON.parse((await tc(3, "register_agent", { name: "mcp-agent" })).body.result.content[0].text);
  const nokey = await tc(4, "balance", {}); assert.equal(nokey.body.result.isError, true);
  const bal = await tc(5, "balance", {}, reg.api_key); assert.equal(bal.body.result.structuredContent.hc, 0);
  const put = await tc(6, "put_memory", { key: "plan", value: { step: 1 } }, reg.api_key); assert.equal(put.body.result.structuredContent.version, 1);
  const bad = await tc(7, "nope", {}); assert.equal(bad.body.error.code, -32602);
}));

test("MCP stdio (local mode) speaks newline-delimited JSON-RPC", async () => {
  const data = `/tmp/haven-stdio-test-${process.pid}.json`;
  const p = spawn(process.execPath, ["src/stdio.js"], { env: { ...process.env, HAVEN_DATA: data, HAVEN_URL: "" }, stdio: ["pipe", "pipe", "inherit"] });
  const lines = []; let buf = "";
  p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_market", arguments: {} } });
  p.stdin.end();
  await new Promise((r) => p.on("close", r));
  fs.rmSync(data, { force: true });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].result.serverInfo.name, "anansi-haven");
  assert.ok(lines[1].result.structuredContent.items.some((i) => i.id === "slopscore.check"));
});

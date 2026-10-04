// Optional: proves the official MCP TypeScript SDK client can talk to our zero-dep server.
// Uses an SDK copy already on the box (slopscore/node_modules); skipped if absent. No install needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../src/app.js";
import { fresh } from "./helpers.js";

const SDK = process.env.MCP_SDK_DIR || "/workspace/slopscore/node_modules/@modelcontextprotocol/sdk/dist/esm";
const have = fs.existsSync(`${SDK}/client/index.js`);

test("official MCP SDK client over streamable HTTP", { skip: !have && "MCP SDK not found" }, async () => {
  const { Client } = await import(`${SDK}/client/index.js`);
  const { StreamableHTTPClientTransport } = await import(`${SDK}/client/streamableHttp.js`);
  const { h } = fresh();
  const srv = createApp(h); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = new URL(`http://127.0.0.1:${srv.address().port}/mcp`);
  try {
    const c = new Client({ name: "sdk-test", version: "1.0.0" });
    await c.connect(new StreamableHTTPClientTransport(url));
    const { tools } = await c.listTools(); assert.ok(tools.length >= 15);
    const r = await c.callTool({ name: "register_agent", arguments: { name: "sdk-agent" } });
    const key = JSON.parse(r.content[0].text).api_key;
    const c2 = new Client({ name: "sdk-test-2", version: "1.0.0" });
    await c2.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
    const home = await c2.callTool({ name: "get_home", arguments: {} });
    assert.equal(home.structuredContent.agent.name, "sdk-agent");
    await c.close(); await c2.close();
  } finally { srv.close(); }
});

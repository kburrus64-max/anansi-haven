import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fresh } from "./helpers.js";
import { createApp } from "../src/app.js";
import { PoliteFetcher, runDiscovery, parseRobots } from "../src/discovery.js";
import { quoteAnansi, priceImpact, encodeQuoteExactInputSingle, UNISWAP_URL } from "../src/anansi-quote.js";
import { getAnansiPage } from "../src/get-anansi-page.js";
import { CFG } from "../src/config.js";

const FG = fs.readFileSync(new URL("./fixtures/floorguard-agent-card.json", import.meta.url), "utf8");
const A2A_CARD = JSON.stringify({ name: "Task Bot", description: "does tasks", version: "1", supportedInterfaces: [{ url: "https://bot.example/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  capabilities: {}, defaultInputModes: [], defaultOutputModes: [], skills: [{ id: "summarize", name: "Summarize", description: "summaries", tags: ["text"] }] });
// Fake internet: public registries + robots + cards. Records every request.
function fakeNet() {
  const calls = [];
  const routes = {
    "https://floorguard-kappa.vercel.app/robots.txt": [200, "User-agent: *\nAllow: /"],
    "https://floorguard-kappa.vercel.app/.well-known/agent-card.json": [200, FG],
    "https://registry.modelcontextprotocol.io/robots.txt": [404, "nope"],
    "https://registry.modelcontextprotocol.io/v0.1/servers?version=latest&limit=100": [200, JSON.stringify({ servers: [
      { server: { name: "io.example/mcp", title: "Example MCP", description: "tools", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://mcp.example/mcp" }] } },
      { server: { name: "io.blocked/mcp", description: "blocked host", version: "1", remotes: [{ type: "streamable-http", url: "https://blocked.example/mcp" }] } },
      { server: { name: "io.pkg/only", description: "package only", version: "1", packages: [{ registryType: "npm", identifier: "x" }] } }] })],
    "https://a2aregistry.org/robots.txt": [200, "User-agent: *\nAllow: /"],
    "https://a2aregistry.org/api/agents?limit=50": [200, JSON.stringify({ agents: [{ ...JSON.parse(A2A_CARD), wellKnownURI: "https://bot.example/.well-known/agent-card.json" }] })],
    "https://api.a2a-registry.org/robots.txt": [200, "User-agent: *\nDisallow: /public/"],
    "https://api.cdp.coinbase.com/robots.txt": [404, ""],
    "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources": [200, JSON.stringify({ items: [
      { resource: "https://paid.example/api/a", description: "A", accepts: [{ amount: "3000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", network: "eip155:8453", scheme: "exact" }], tags: ["data"] },
      { resource: "https://paid.example/api/b", description: "B", accepts: [] }, { resource: "https://auth.example/x", description: "C", accepts: [] }] })],
    "https://mcp.example/robots.txt": [404, ""], "https://mcp.example/.well-known/agent-card.json": [200, A2A_CARD.replace("Task Bot", "MCP Example Agent").replace("bot.example", "mcp.example")],
    "https://blocked.example/robots.txt": [200, "User-agent: AnansiHavenDiscovery\nDisallow: /"],
    "https://paid.example/robots.txt": [404, ""], "https://paid.example/.well-known/agent-card.json": [404, "no"],
    "https://auth.example/robots.txt": [404, ""], "https://auth.example/.well-known/agent-card.json": [402, "{}"],
  };
  const fetchImpl = async (url, opts) => { calls.push({ url, ua: opts.headers["user-agent"] }); const r = routes[url]; return r ? new Response(r[1], { status: r[0] }) : new Response("not found", { status: 404 }); };
  return { calls, fetchImpl };
}

test("robots.txt parsing: specific group wins, longest match, wildcards", () => {
  const ok = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\nDisallow: /*.zip$\n\nUser-agent: OtherBot\nDisallow: /");
  assert.equal(ok("/"), true); assert.equal(ok("/private/x"), false); assert.equal(ok("/private/ok/1"), true); assert.equal(ok("/a.zip"), false); assert.equal(ok("/a.zip.txt"), true);
  assert.equal(parseRobots("User-agent: AnansiHavenDiscovery\nDisallow: /\n\nUser-agent: *\nAllow: /")("/x"), false);
});

test("polite fetcher: robots first, <=1 req/s per host, UA, request cap, auth-required skipped", async () => {
  const { calls, fetchImpl } = fakeNet();
  let t = 0; const sleeps = [];
  const f = new PoliteFetcher({ fetchImpl, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, maxRequests: 6 });
  const r1 = await f.getJson("https://floorguard-kappa.vercel.app/.well-known/agent-card.json");
  assert.equal(r1.ok, true); assert.equal(calls[0].url, "https://floorguard-kappa.vercel.app/robots.txt");
  assert.ok(sleeps[0] >= 1000, "second request to same host waited ~1s");
  assert.ok(calls.every((c) => c.ua === CFG.DISCOVERY.userAgent && /contact/.test(c.ua)));
  assert.equal((await f.getJson("https://blocked.example/mcp")).skipped, "robots");
  assert.equal((await f.getJson("https://auth.example/.well-known/agent-card.json")).skipped, "auth_required");
  await assert.rejects(() => f.getJson("https://paid.example/.well-known/agent-card.json"), /cap/);
});

test("discovery run: imports flagged unclaimed listings by source, FloorGuard first, probes cards, respects robots + cap", async () => {
  const { h } = fresh(); const { calls, fetchImpl } = fakeNet();
  const fetcher = new PoliteFetcher({ fetchImpl, perHostIntervalMs: 0 });
  const rep = await runDiscovery(h, { cap: 50, fetcher });
  assert.equal(rep.by_source.seed.imported_new, 1);
  assert.equal(rep.by_source.mcp_registry.fetched, 2, "package-only server skipped");
  assert.equal(rep.by_source.a2aregistry_org.fetched, 1);
  assert.equal(rep.by_source.a2a_registry_api.fetched, 0); assert.ok(rep.errors.some((e) => e.skipped === "robots"));
  assert.equal(rep.by_source.x402_bazaar.fetched, 2, "grouped by host");
  assert.equal(rep.probes.cards_found, 1); assert.equal(rep.probes.auth_required, 1); assert.equal(rep.probes.skipped_robots, 1);
  const first = Object.values(h.S.listings)[0];
  assert.equal(first.name, "FloorGuard Rules API"); assert.equal(first.unclaimed, true); assert.equal(first.status, "unclaimed");
  const mcp = Object.values(h.S.listings).find((l) => l.domain === "mcp.example");
  assert.equal(mcp.accepts_tasks, true); assert.equal(mcp.endpoints.mcp, "https://mcp.example/mcp"); assert.equal(mcp.endpoints.a2a, "https://mcp.example/a2a");
  const paid = Object.values(h.S.listings).find((l) => l.domain === "paid.example"); assert.equal(paid.extra.x402_resources[0].price_usdc, 0.003);
  assert.ok(!calls.some((c) => c.url.startsWith("https://blocked.example/.well-known")), "never fetched a robots-disallowed path");
  // second run updates, not duplicates
  const rep2 = await runDiscovery(h, { cap: 50, fetcher: new PoliteFetcher({ fetchImpl, perHostIntervalMs: 0 }) });
  assert.equal(rep2.by_source.seed.updated, 1); assert.equal(rep2.total_listings_in_directory, rep.total_listings_in_directory);
  // cap respected
  const { h: h2 } = fresh();
  const rep3 = await runDiscovery(h2, { cap: 3, fetcher: new PoliteFetcher({ fetchImpl, perHostIntervalMs: 0 }) });
  assert.ok(Object.keys(h2.S.listings).length <= 3);
});

// Mock Base RPC: slot0 sqrtPrice for ~374.6M ANANSI/WETH, ETH $2700.90, quoter returns a fixed haircut.
function mockRpc() {
  const sqrt = 0x4b9abaef201a92cb09dcbe4dc7acn; const hex = (n) => n.toString(16).padStart(64, "0");
  return async (calls) => calls.map(({ to, data }) => {
    if (data === "0x3850c7bd") return "0x" + hex(sqrt) + hex(0n).repeat(6);
    if (data === "0xfeaf968c") return "0x" + hex(1n) + hex(270090000000n) + hex(0n).repeat(3);
    if (data.startsWith("0x70a08231")) return "0x" + hex(to.toLowerCase().startsWith("0x4200") ? 168600000000000000n : 63150000n * 10n ** 18n);
    if (data.startsWith("0xc6a5026a")) { const amtIn = BigInt("0x" + data.slice(10 + 128, 10 + 192)); const ideal = (amtIn * 374605582n); const haircut = amtIn > 10n ** 16n ? 900n : 986n; return "0x" + hex(ideal * haircut / 1000n) + hex(0n).repeat(3); }
    return new Error("unknown");
  });
}

test("Get-ANANSI: quote math, live-shaped quotes for $5/$20/$50, HTTP + MCP + A2A, page copy rules", async () => {
  assert.equal(encodeQuoteExactInputSingle("0x4200000000000000000000000000000000000006", CFG.GET_ANANSI.token, 1n, 3000).length, 2 + 8 + 64 * 5);
  const pi = priceImpact({ amountInWei: 10n ** 18n, amountOutWei: 99n * 10n ** 16n, anansiPerWeth: 1 }); assert.equal(pi.total_cost_pct, 1); assert.equal(pi.price_impact_pct, 0.7);
  const q = await quoteAnansi({ rpc: mockRpc() });
  assert.deepEqual(q.quotes.map((x) => x.usd), [5, 20, 50]);
  assert.ok(Math.abs(q.spot.eth_usd - 2700.9) < 0.01); assert.ok(q.pool_liquidity_usd > 800 && q.pool_liquidity_usd < 1100);
  assert.ok(q.quotes[2].total_cost_pct > q.quotes[0].total_cost_pct);
  assert.equal(q.swap_url, "https://app.uniswap.org/swap?chain=base&outputCurrency=0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702");
  assert.equal(UNISWAP_URL, q.swap_url);
  const page = getAnansiPage();
  for (const must of [/thin liquidity/i, /slippage/i, /volatile/i, /not an investment/i, /no.*return|promises any return/i, /USDC/, /outputCurrency=0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702/, /\$5|5\/\$20|\/v1\/anansi\/quote/]) assert.match(page, must);
  for (const bad of [/burn/i, /buyback/i, /moon/i, /price (will|going to) (go )?up/i, /guaranteed/i, /profit/i, /pump/i]) assert.doesNotMatch(page + JSON.stringify(q), bad);
  const { h } = fresh(); h.quoteRpc = mockRpc();
  const srv = createApp(h); await new Promise((r) => srv.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const http = await (await fetch(`${base}/v1/anansi/quote`)).json(); assert.equal(http.quotes.length, 3);
    const html = await fetch(`${base}/get-anansi`); assert.match(html.headers.get("content-type"), /html/);
    const mcp = await (await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "quote_anansi", arguments: {} } }) })).json();
    assert.equal(mcp.result.structuredContent.quotes.length, 3);
    const a2a = await (await fetch(`${base}/a2a`, { method: "POST", headers: { "content-type": "application/json", "a2a-version": "1.0" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: { messageId: "q", role: "ROLE_USER", parts: [{ text: "quote anansi" }] } } }) })).json();
    assert.equal(a2a.result.task.artifacts[0].parts[0].data.quotes.length, 3);
  } finally { srv.close(); }
});

test("market: Base Launch Week pack at 5000 HC marked refresh pending; purchase returns a delivery stub; FloorGuard removed", async () => {
  const { h } = fresh();
  const it = h.listMarket().find((i) => i.id === "anansi.pack.base-launch-week");
  assert.equal(it.price_hc, 5000); assert.equal(it.price_usd, "$5.000"); assert.equal(it.status, "refresh_pending"); assert.match(it.status_note, /Revenue Rail/);
  assert.equal(h.S.market[it.id].pack_file, "/workspace/anansi-packs/base-launch-week-20260922.zip");
  assert.equal(h.S.market[it.id].sales_copy, "/workspace/anansi-packs/SALES_COPY-base-launch-week-20260922.md");
  assert.ok(!JSON.stringify(h.S.market[it.id]).includes("0x6D7a"), "never the RevenueSplitter");
  const me = h.auth(h.registerAgent({ name: "buyer" }).api_key); h.topupUsd(me.id, 5);
  const o = h.buyItem(me, it.id); assert.equal(o.fulfillment.status, "pending_refresh"); assert.equal(o.fulfillment.delivery, "stub");
  // migration on old data: stale pack + floorguard item get synced
  const { h: h2 } = fresh(); h2.S.market[it.id].status = undefined; h2.S.market["floorguard.rules.lookup"] = { id: "floorguard.rules.lookup", enabled: false };
  const { seed } = await import("../src/seed.js"); seed(h2);
  assert.equal(h2.S.market[it.id].status, "refresh_pending"); assert.ok(!h2.S.market["floorguard.rules.lookup"]);
});

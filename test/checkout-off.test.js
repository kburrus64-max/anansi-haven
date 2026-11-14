// Checkout is off by default: no pay_to, no invoices, health/plans agree, sitemap and tool copy stay paused.
import test from "node:test";
import assert from "node:assert/strict";
import { CFG } from "../src/config.js";
import { TOOLS, callTool } from "../src/tools.js";
import { createApp } from "../src/app.js";
import { checkoutOptions, CHECKOUT_CATALOG } from "../src/checkout-page.js";
import { getAnansiPage } from "../src/get-anansi-page.js";
import { tradePostmortem } from "../src/contrib/trade-postmortem.js";
import { fresh } from "./helpers.js";

const SPLITTER = "0x6D7a2D65B26a87134c0571fb1baaA248eB0a291B";
const hasSplitter = (v) => JSON.stringify(v).toLowerCase().includes(SPLITTER.toLowerCase());

async function withServer(fn) {
  const { h } = fresh();
  const srv = createApp(h, { adminToken: "test-admin-token-123456" });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, h); } finally { srv.close(); }
}

test("config defaults: checkout and payments are off", () => {
  assert.equal(CFG.PAYMENTS.enabled, false);
  assert.equal(CFG.PLANS.checkout, false);
});

test("checkout options: paused response with no pay_to and never the RevenueSplitter", () => {
  const opts = checkoutOptions();
  assert.equal(opts.payments, "off");
  assert.equal(opts.status, "paused");
  assert.equal(opts.error, "payments_off");
  assert.match(opts.message, /paused/i);
  assert.equal("pay_to" in opts, false);
  assert.ok(!hasSplitter(opts));
  assert.ok(!hasSplitter(CHECKOUT_CATALOG), "catalog itself must not carry the never-pay address");
});

test("HTTP: /health, /v1/house/plans, /v1/checkout/options agree payments are off; invoice routes are paused; sitemap drops checkout pages; no 0x6D7a pay_to", async () => withServer(async (base, h) => {
  const health = await (await fetch(base + "/health")).json();
  const plans = await (await fetch(base + "/v1/house/plans")).json();
  const options = await (await fetch(base + "/v1/checkout/options")).json();
  const checkoutHtml = await (await fetch(base + "/checkout")).text();
  const sitemap = await (await fetch(base + "/sitemap.xml")).text();
  const x402 = await fetch(base + "/.well-known/x402");
  const x402Body = await x402.json();
  const paid = await fetch(base + "/v1/paid/council_grade", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const paidBody = await paid.json();
  const sprint = await fetch(base + "/v1/sprint/invoice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operator_handle: "test", contact_email: "t@example.com", pay_with: "usdc" }) });
  const sprintBody = await sprint.json();
  const a = h.registerAgent({ name: "buyer", ip: "192.0.2.80" });
  const room = await fetch(base + "/v1/house/plan", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.api_key}` }, body: JSON.stringify({ plan: "room", months: 1, pay_with: "usdc" }) });
  const roomBody = await room.json();

  assert.equal(health.payments, "off");
  assert.equal(plans.checkout.usdc, "coming soon");
  assert.equal("pay_to" in (plans.checkout || {}), false);
  assert.equal(options.payments, "off");
  assert.equal(options.error, "payments_off");
  assert.equal("pay_to" in options, false);
  assert.match(checkoutHtml, /paused/i);
  assert.doesNotMatch(checkoutHtml, /0x[0-9a-fA-F]{40}/);

  assert.equal(sprint.status, 503);
  assert.equal(sprintBody.error, "payments_off");
  assert.equal("invoice" in sprintBody, false);
  assert.equal(room.status, 503);
  assert.equal(roomBody.error, "payments_off");
  assert.equal("invoice" in roomBody, false);
  assert.deepEqual(h.S.invoices || {}, {});

  assert.doesNotMatch(sitemap, /\/checkout</);
  assert.doesNotMatch(sitemap, /\/get-anansi</);
  assert.match(sitemap, /\/proof<\/loc>/);

  assert.equal(x402.status, 503);
  assert.equal(x402Body.error, "payments_off");
  assert.equal(paid.status, 503);
  assert.equal(paidBody.error, "payments_off");

  for (const [name, body] of [["health", health], ["plans", plans], ["options", options], ["checkoutHtml", checkoutHtml], ["sitemap", sitemap], ["x402", x402Body], ["paid", paidBody], ["sprint", sprintBody], ["room", roomBody]]) {
    assert.ok(!hasSplitter(body), `${name} must not contain ${SPLITTER}`);
  }
}));

test("house_plans and buy_house_plan descriptions say paid plans are paused and do not quote $1.00 / $0.80", () => {
  const housePlans = TOOLS.find((t) => t.name === "house_plans");
  const buy = TOOLS.find((t) => t.name === "buy_house_plan");
  assert.match(housePlans.description, /Paid plans are paused/);
  assert.doesNotMatch(housePlans.description, /\$1\.00|\$0\.80/);
  assert.match(buy.description, /Paid plans are paused/);
  assert.doesNotMatch(buy.description, /\$1\.00|\$0\.80/);
});

test("GET /get-anansi is a paused page with no prices, checkout links, $ANANSI pitch or wallet addresses", async () => withServer(async (base) => {
  const page = getAnansiPage();
  const r = await fetch(base + "/get-anansi");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /html/);
  const html = await r.text();
  assert.equal(html, page);
  for (const body of [page, html]) {
    assert.match(body, /paused/i);
    assert.match(body, /Paid plans are paused for now/);
    assert.doesNotMatch(body, /\$ANANSI/i);
    assert.doesNotMatch(body, /\/checkout/);
    assert.doesNotMatch(body, /0x[0-9a-fA-F]{40}/);
    assert.doesNotMatch(body, /buy\.stripe\.com/i);
    assert.doesNotMatch(body, /uniswap/i);
    assert.doesNotMatch(body, /\$\d/);
  }
}));

test("trade_postmortem drops all upgrade/pro_upgrade copy while checkout is off", async () => {
  const r = tradePostmortem({ symbol: "JP225", side: "buy", entry_price: 38500, stop_loss: 37800, exit_price: 39200 });
  assert.equal(r.paid_plans, "Paid plans are paused for now.");
  assert.equal(r.upgrade_to_council_grade, undefined);
  assert.equal(r.pro_upgrade, undefined);
  const raw = JSON.stringify(r);
  assert.doesNotMatch(raw, /"pay_to"/);
  assert.doesNotMatch(raw, /buy\.stripe\.com/i);
  assert.doesNotMatch(raw, /\/checkout/);
  assert.doesNotMatch(raw, /\/v1\/sprint\/invoice|\/v1\/house\/plan|\/v1\/paid\/council_grade/);
  assert.doesNotMatch(raw, /\$1\.00|\$0\.80|\$49|\$39\.20|\$0\.02|\$ANANSI/i);
  assert.ok(!hasSplitter(r));

  const { h } = fresh();
  const out = await callTool(h, "trade_postmortem", { symbol: "JP225", side: "buy", entry_price: 38500, stop_loss: 37800, exit_price: 39200 });
  const toolRaw = JSON.stringify(out);
  assert.match(toolRaw, /Paid plans are paused for now/);
  assert.doesNotMatch(toolRaw, /"pay_to"/);
  assert.doesNotMatch(toolRaw, /buy\.stripe\.com/i);
  assert.doesNotMatch(toolRaw, /upgrade_to_council_grade|"pro_upgrade"/);
});

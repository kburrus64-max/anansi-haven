// Get-ANANSI quotes: READ-ONLY eth_call against Base (pool slot0, QuoterV2, Chainlink ETH/USD, balances).
// No wallet, no signing, no transactions. Used by /get-anansi, GET /v1/anansi/quote, MCP quote_anansi and A2A.
import { CFG } from "./config.js";

const G = CFG.GET_ANANSI;
const pad = (hex) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (data, i) => BigInt("0x" + data.replace(/^0x/, "").slice(i * 64, (i + 1) * 64));
const SEL = { slot0: "0x3850c7bd", balanceOf: "0x70a08231", latestRoundData: "0xfeaf968c", quoteExactInputSingle: "0xc6a5026a" };

export const UNISWAP_URL = `https://app.uniswap.org/swap?chain=base&outputCurrency=${G.token}`;
export const WARNING = [
  "ANANSI has thin liquidity (about $980 across its pools at last check; see the live pool figure), so even small buys move the price and slippage is high.",
  "The price is volatile and can fall to near zero.",
  "ANANSI is not an investment. Nothing here promises any return, and Anansi Data does not support the price.",
  "Only spend what you are fine losing. Check the price impact below before you swap.",
];
export const USDC_NOTE = "You don't need ANANSI to use the Haven. Credits can also be bought with USDC (x402 on Base; wired in production, simulated in this prototype).";

export function encodeQuoteExactInputSingle(tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96 = 0n) {
  return SEL.quoteExactInputSingle + pad(tokenIn) + pad(tokenOut) + pad(BigInt(amountIn).toString(16)) + pad(BigInt(fee).toString(16)) + pad(BigInt(sqrtPriceLimitX96).toString(16));
}

// Batched eth_call: one JSON-RPC batch per phase (the public Base RPC rate-limits bursts of single calls).
// rpc([{to, data}]) -> [hex | Error]. Items that hit a rate limit are retried with backoff.
export function makeRpc(fetchImpl = globalThis.fetch, url = G.rpcUrls[0], { retries = 2 } = {}) {
  let id = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return async (calls) => {
    const out = new Array(calls.length).fill(null);
    let todo = calls.map((c, i) => i);
    for (let attempt = 0; todo.length && attempt <= retries; attempt++) {
      if (attempt) await sleep(800 * attempt);
      const reqs = todo.map((i) => ({ jsonrpc: "2.0", id: ++id, method: "eth_call", params: [{ to: calls[i].to, data: calls[i].data }, "latest"], _i: i }));
      const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqs.map(({ _i, ...x }) => x)), signal: AbortSignal.timeout(10_000) });
      let arr = await r.json().catch(() => null);
      if (!Array.isArray(arr)) arr = [];
      const byId = new Map(arr.map((x) => [x.id, x]));
      const retry = [];
      for (const q of reqs) {
        const x = byId.get(q.id);
        if (x?.result && x.result !== "0x") out[q._i] = x.result;
        else { const msg = x?.error?.message || (x ? "empty result" : `HTTP ${r.status}`); out[q._i] = new Error(`eth_call ${calls[q._i].to} failed: ${msg}`); if (!x || /rate|limit|429|timeout/i.test(msg)) retry.push(q._i); }
      }
      todo = retry;
    }
    return out;
  };
}
const must = (v) => { if (v instanceof Error || v == null) throw v || new Error("no result"); return v; };

// Pure math, exported for tests. amounts in wei (BigInt), prices as numbers.
export function priceImpact({ amountInWei, amountOutWei, anansiPerWeth, feeBps = 30 }) {
  const ideal = (Number(amountInWei) / 1e18) * anansiPerWeth; // no fee, no impact
  const out = Number(amountOutWei) / 1e18;
  const totalCost = 1 - out / ideal;                          // fee + impact
  const impact = 1 - out / (ideal * (1 - feeBps / 10_000));   // impact only
  return { total_cost_pct: +(totalCost * 100).toFixed(2), price_impact_pct: +(Math.max(0, impact) * 100).toFixed(2) };
}

export async function quoteAnansi({ rpc = makeRpc(), amountsUsd = G.amountsUsd, now = Date.now() } = {}) {
  const [slot0, round, wethBal, tokBal] = (await rpc([
    { to: G.pool, data: SEL.slot0 }, { to: G.ethUsdFeed, data: SEL.latestRoundData },
    { to: G.weth, data: SEL.balanceOf + pad(G.pool) }, { to: G.token, data: SEL.balanceOf + pad(G.pool) },
  ])).map(must);
  const sqrtP = word(slot0, 0);
  const anansiPerWeth = Number((sqrtP * sqrtP * 10n ** 18n) >> 192n) / 1e18; // token1 (ANANSI) per token0 (WETH), both 18 decimals
  const ethUsd = Number(word(round, 1)) / 1e8;
  const priceUsd = ethUsd / anansiPerWeth;
  const poolUsd = (Number(wethBal) / 1e18) * ethUsd + (Number(BigInt(tokBal)) / 1e18) * priceUsd;
  const quotes = [];
  const ins = amountsUsd.map((u) => BigInt(Math.floor((u / ethUsd) * 1e18)));
  const results = await rpc(ins.map((a) => ({ to: G.quoterV2, data: encodeQuoteExactInputSingle(G.weth, G.token, a, G.fee) })));
  for (const [k, usdAmt] of amountsUsd.entries()) {
    const amountInWei = ins[k];
    try {
      const amountOutWei = word(must(results[k]), 0);
      quotes.push({ usd: usdAmt, weth_in: +(Number(amountInWei) / 1e18).toFixed(8), anansi_out: Math.floor(Number(amountOutWei) / 1e18), ...priceImpact({ amountInWei, amountOutWei, anansiPerWeth }),
        effective_price_usd: +(usdAmt / (Number(amountOutWei) / 1e18)).toExponential(4) });
    } catch (e) { quotes.push({ usd: usdAmt, error: e.message }); }
  }
  return {
    pair: "ANANSI/WETH 0.3% (Uniswap v3, Base)", pool: G.pool, token: G.token, chain_id: 8453, quoter: G.quoterV2,
    as_of: new Date(now).toISOString(), source: "live eth_call (slot0, QuoterV2 quoteExactInputSingle, Chainlink ETH/USD)",
    spot: { anansi_per_weth: Math.round(anansiPerWeth), eth_usd: +ethUsd.toFixed(2), anansi_usd: +priceUsd.toExponential(4) },
    pool_liquidity_usd: Math.round(poolUsd),
    quotes, route_note: "Quotes are WETH->ANANSI on the 0.3% pool. Paying with USDC or ETH adds a hop (usually ~0.05-0.3% more).",
    swap_url: UNISWAP_URL, warning: WARNING, usdc_credits: USDC_NOTE,
  };
}

// Cached wrapper. Tries each public RPC in turn until all quotes succeed; on total failure returns the
// warning + swap link with an error instead of throwing.
let cache = null;
export async function getAnansiQuote({ rpc, fetchImpl = globalThis.fetch, force = false } = {}) {
  if (!force && !rpc && cache && Date.now() - cache.t < G.cacheMs) return cache.v;
  const rpcs = rpc ? [rpc] : G.rpcUrls.map((u) => makeRpc(fetchImpl, u));
  let best = null; let lastErr = null;
  for (const r of rpcs) {
    try {
      const v = await quoteAnansi({ rpc: r });
      const okCount = v.quotes.filter((q) => !q.error).length;
      if (!best || okCount > best.quotes.filter((q) => !q.error).length) best = v;
      if (okCount === v.quotes.length) break;
    } catch (e) { lastErr = e; }
  }
  if (best) { if (!rpc) cache = { t: Date.now(), v: best }; return best; }
  return { ok: false, error: `live quote unavailable: ${lastErr?.message}`, token: G.token, pool: G.pool, swap_url: UNISWAP_URL, warning: WARNING, usdc_credits: USDC_NOTE };
}

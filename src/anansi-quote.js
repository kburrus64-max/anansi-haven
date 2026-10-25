// Get-ANANSI quotes: READ-ONLY eth_call against Base (pool slot0, QuoterV2, Chainlink ETH/USD, balances)
// plus unsigned SwapRouter02 exactInputSingle calldata for agents and wallets.
// No wallet, no signing, no transactions sent by Haven. Used by /get-anansi, GET /v1/anansi/quote, MCP quote_anansi and A2A.
import { CFG } from "./config.js";

const G = CFG.GET_ANANSI;
const pad = (hex) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (data, i) => BigInt("0x" + data.replace(/^0x/, "").slice(i * 64, (i + 1) * 64));
const SEL = {
  slot0: "0x3850c7bd",
  balanceOf: "0x70a08231",
  latestRoundData: "0xfeaf968c",
  quoteExactInputSingle: "0xc6a5026a",
  exactInputSingle: "0x04e45aaf",
};

export const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";
export const MSG_SENDER_SENTINEL = "0x0000000000000000000000000000000000000001";
export const UNISWAP_URL = `https://app.uniswap.org/swap?chain=base&outputCurrency=${G.token}`;
export const POOL_URL = `https://app.uniswap.org/explore/pools/base/${G.pool}`;
export const ADD_LIQUIDITY_URL = `https://app.uniswap.org/positions/create/v3?chain=base&currencyA=ETH&currencyB=${G.token}&fee=${G.fee}`;
export const LINKS = {
  uniswap_swap: UNISWAP_URL,
  uniswap_pool: POOL_URL,
  uniswap_add_liquidity: ADD_LIQUIDITY_URL,
  dexscreener: `https://dexscreener.com/base/${G.pool}`,
  geckoterminal: `https://www.geckoterminal.com/base/pools/${G.pool}`,
  basescan_token: `https://basescan.org/token/${G.token}`,
  basescan_pool: `https://basescan.org/address/${G.pool}`,
  get_anansi_page: "https://anansi-haven.anansidata.workers.dev/get-anansi",
  checkout: "https://anansi-haven.anansidata.workers.dev/checkout",
  checkout_options: "https://anansi-haven.anansidata.workers.dev/v1/checkout/options",
  bounties: "https://anansi-haven.anansidata.workers.dev/bounties",
};
export const UTILITY = {
  bounties: "Verified Haven bounty submissions pay 1,000 ANANSI on Base from the funded 250,000 ANANSI bounty wallet (0xEf871a387683E4AF886b9D38065a098C81352724, /bounties).",
  arcade_prizes: "Farcaster Arcade (https://anansidata-miniapp.vercel.app) awards 1,000 ANANSI + $1 USDC daily and 10,000 ANANSI + $5 USDC weekly to #1 high scores.",
  discounts: "Live 20% utility discount when paying in $ANANSI on Anansi Haven Checkout (/checkout): $0.80/mo for the 100 MB E2E Encrypted Room (vs. $1.00 USDC, via POST /v1/house/plan with {\"plan\":\"room\",\"months\":1,\"pay_with\":\"anansi\"}) and $39.20 in $ANANSI for the $49 Agent Integration Sprint (via POST /v1/sprint/invoice with {\"pay_with\":\"anansi\"}), plus 20% off Anansi Data packs (https://anansidata.xyz).",
};
export const WARNING = [
  "ANANSI has thin liquidity (about $980 across its pools at last check; see the live pool figure), so even small buys move the price and slippage is high.",
  "The price is volatile and can fall to near zero.",
  "ANANSI is not an investment. Nothing here promises any return, and Anansi Data does not support the price.",
  "Only spend what you are fine losing. Check the price impact below before you swap.",
];
export const USDC_NOTE = "You don't need ANANSI to use the Haven's free tools, and services can also be paid in Base USDC. Paying with $ANANSI on Base gives a live 20% utility discount at /checkout: $0.80/mo for the 100 MB E2E Encrypted Room (vs. $1.00 USDC, via POST /v1/house/plan with {\"plan\":\"room\",\"months\":1,\"pay_with\":\"anansi\"}) and $39.20 in $ANANSI for the $49 Agent Integration Sprint (via POST /v1/sprint/invoice with {\"pay_with\":\"anansi\"} or /checkout).";

export function encodeQuoteExactInputSingle(tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96 = 0n) {
  return SEL.quoteExactInputSingle + pad(tokenIn) + pad(tokenOut) + pad(BigInt(amountIn).toString(16)) + pad(BigInt(fee).toString(16)) + pad(BigInt(sqrtPriceLimitX96).toString(16));
}

export function encodeSwapExactInputSingle({
  tokenIn = G.weth,
  tokenOut = G.token,
  fee = G.fee,
  recipient = MSG_SENDER_SENTINEL,
  amountIn,
  amountOutMinimum = 1n,
  sqrtPriceLimitX96 = 0n,
}) {
  const rec = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || "")) ? String(recipient) : MSG_SENDER_SENTINEL;
  return (
    SEL.exactInputSingle +
    pad(tokenIn) +
    pad(tokenOut) +
    pad(BigInt(fee).toString(16)) +
    pad(rec) +
    pad(BigInt(amountIn).toString(16)) +
    pad(BigInt(amountOutMinimum).toString(16)) +
    pad(BigInt(sqrtPriceLimitX96).toString(16))
  );
}

export function buildSwapTx({ amountInWei, amountOutWei, recipient = MSG_SENDER_SENTINEL, slippageBps = 200 }) {
  const rec = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || "")) ? String(recipient) : MSG_SENDER_SENTINEL;
  const slip = Math.max(10, Math.min(5000, Number(slippageBps) || 200));
  const minOutWei = amountOutWei > 0n ? (BigInt(amountOutWei) * BigInt(10_000 - slip)) / 10_000n : 1n;
  return {
    chain_id: 8453,
    to: SWAP_ROUTER_02,
    value_wei: BigInt(amountInWei).toString(),
    value_hex: "0x" + BigInt(amountInWei).toString(16),
    recipient: rec === MSG_SENDER_SENTINEL ? "msg.sender (0x...0001 SwapRouter02 sentinel)" : rec,
    slippage_bps: slip,
    min_anansi_out: Math.floor(Number(minOutWei) / 1e18),
    data: encodeSwapExactInputSingle({ amountIn: amountInWei, amountOutMinimum: minOutWei, recipient: rec }),
  };
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

export async function quoteAnansi({ rpc = makeRpc(), amountsUsd = G.amountsUsd, customUsd, recipient, slippageBps = 200, now = Date.now() } = {}) {
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
      quotes.push({
        usd: usdAmt,
        weth_in: +(Number(amountInWei) / 1e18).toFixed(8),
        anansi_out: Math.floor(Number(amountOutWei) / 1e18),
        ...priceImpact({ amountInWei, amountOutWei, anansiPerWeth }),
        effective_price_usd: +(usdAmt / (Number(amountOutWei) / 1e18)).toExponential(4),
        swap_tx: buildSwapTx({ amountInWei, amountOutWei, recipient, slippageBps }),
      });
    } catch (e) { quotes.push({ usd: usdAmt, error: e.message }); }
  }
  const dustAmounts = [0.5, 1];
  const dust_quotes = dustAmounts.map((u) => {
    const amountInWei = BigInt(Math.floor((u / ethUsd) * 1e18));
    const estOutWei = (amountInWei * BigInt(Math.floor(anansiPerWeth)) * 995n) / 1000n;
    return {
      usd: u,
      weth_in: +(Number(amountInWei) / 1e18).toFixed(8),
      anansi_out_est: Math.floor(Number(estOutWei) / 1e18),
      swap_tx: buildSwapTx({ amountInWei, amountOutWei: estOutWei, recipient, slippageBps }),
    };
  });
  let custom_quote = undefined;
  const cUsd = Number(customUsd);
  if (Number.isFinite(cUsd) && cUsd > 0 && cUsd <= 500) {
    const amountInWei = BigInt(Math.floor((cUsd / ethUsd) * 1e18));
    const estOutWei = (amountInWei * BigInt(Math.floor(anansiPerWeth)) * 990n) / 1000n;
    custom_quote = {
      usd: cUsd,
      weth_in: +(Number(amountInWei) / 1e18).toFixed(8),
      anansi_out_est: Math.floor(Number(estOutWei) / 1e18),
      swap_tx: buildSwapTx({ amountInWei, amountOutWei: estOutWei, recipient, slippageBps }),
    };
  }
  return {
    pair: "ANANSI/WETH 0.3% (Uniswap v3, Base)", pool: G.pool, token: G.token, chain_id: 8453, quoter: G.quoterV2, router: SWAP_ROUTER_02,
    as_of: new Date(now).toISOString(), source: "live eth_call (slot0, QuoterV2 quoteExactInputSingle, Chainlink ETH/USD)",
    spot: { anansi_per_weth: Math.round(anansiPerWeth), eth_usd: +ethUsd.toFixed(2), anansi_usd: +priceUsd.toExponential(4) },
    pool_liquidity_usd: Math.round(poolUsd),
    quotes,
    dust_quotes,
    ...(custom_quote ? { custom_quote } : {}),
    route_note: "Quotes are WETH->ANANSI on the 0.3% pool. SwapRouter02 (0x2626...e481) accepts native Base ETH via msg.value in swap_tx.",
    swap_url: UNISWAP_URL,
    pool_url: POOL_URL,
    add_liquidity_url: ADD_LIQUIDITY_URL,
    links: LINKS,
    utility: UTILITY,
    warning: WARNING,
    usdc_credits: USDC_NOTE,
  };
}

// Cached wrapper. Tries each public RPC in turn until all quotes succeed; on total failure returns the
// warning + swap link with an error instead of throwing.
let cache = null;
export async function getAnansiQuote({ rpc, fetchImpl = globalThis.fetch, force = false, customUsd, recipient, slippageBps } = {}) {
  const hasCustom = customUsd != null || recipient != null || slippageBps != null;
  if (!force && !rpc && !hasCustom && cache && Date.now() - cache.t < G.cacheMs) return cache.v;
  const rpcs = rpc ? [rpc] : G.rpcUrls.map((u) => makeRpc(fetchImpl, u));
  let best = null; let lastErr = null;
  for (const r of rpcs) {
    try {
      const v = await quoteAnansi({ rpc: r, customUsd, recipient, slippageBps });
      const okCount = v.quotes.filter((q) => !q.error).length;
      if (!best || okCount > best.quotes.filter((q) => !q.error).length) best = v;
      if (okCount === v.quotes.length) break;
    } catch (e) { lastErr = e; }
  }
  if (best) { if (!rpc && !hasCustom) cache = { t: Date.now(), v: best }; return best; }
  return { ok: false, error: `live quote unavailable: ${lastErr?.message}`, token: G.token, pool: G.pool, swap_url: UNISWAP_URL, pool_url: POOL_URL, links: LINKS, utility: UTILITY, warning: WARNING, usdc_credits: USDC_NOTE };
}

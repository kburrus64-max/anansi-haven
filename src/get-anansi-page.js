// Static Get-ANANSI page. Fetches live quotes from /v1/anansi/quote (read-only, no wallet on this page).
// Copy rules: no buy-and-burn, no price-up, no returns. Plain warning first.
import { CFG } from "./config.js";
import { UNISWAP_URL, POOL_URL, ADD_LIQUIDITY_URL, SWAP_ROUTER_02, LINKS, UTILITY, WARNING, USDC_NOTE } from "./anansi-quote.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
export function getAnansiPage() {
  const G = CFG.GET_ANANSI;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Get ANANSI &amp; Base Pool (Uniswap v3)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:740px;margin:2rem auto;padding:0 1rem;color:#111}
.warn{border:2px solid #b45309;background:#fff7ed;padding:1rem;border-radius:8px}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:right}th:first-child,td:first-child{text-align:left}
.btn{display:inline-block;background:#111;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none;margin-right:.5rem;margin-bottom:.5rem}
.btn-sec{display:inline-block;background:#f3f4f6;color:#111;border:1px solid #d1d5db;padding:.6rem 1rem;border-radius:6px;text-decoration:none;margin-right:.5rem;margin-bottom:.5rem}
code{font-size:.85em;word-break:break-all;background:#f3f4f6;padding:.1rem .3rem;border-radius:4px}.muted{color:#555;font-size:.9em}</style></head><body>
<h1>Get ANANSI on Base &amp; Uniswap v3 Pool</h1>
<div class="warn" role="alert"><strong>Read this first.</strong><ul>${WARNING.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
<p>${esc(USDC_NOTE)}</p>
<h2>Live price impact ($5 / $20 / $50)</h2>
<p class="muted">Quoted from the Uniswap v3 ANANSI/WETH 0.3% pool via the on-chain QuoterV2 (read-only). Higher amounts move the price more.</p>
<table><thead><tr><th>You spend</th><th>ANANSI out (approx.)</th><th>Price impact</th><th>Total cost incl. 0.3% fee</th></tr></thead>
<tbody id="q"><tr><td colspan="4">Loading live quote…</td></tr></tbody></table>
<p class="muted" id="meta"></p>
<p>
  <a class="btn" href="${esc(UNISWAP_URL)}" target="_blank" rel="noopener noreferrer">Open Uniswap Swap (ANANSI prefilled)</a>
  <a class="btn-sec" href="${esc(POOL_URL)}" target="_blank" rel="noopener noreferrer">View Uniswap v3 Pool</a>
  <a class="btn-sec" href="${esc(ADD_LIQUIDITY_URL)}" target="_blank" rel="noopener noreferrer">Add v3 Liquidity</a>
  <a class="btn-sec" href="/checkout">Live Checkout (20% Off with $ANANSI)</a>
</p>
<h2>What $ANANSI Unlocks Right Now (20% Utility Discount on Base)</h2>
<ul>
  <li><strong>100 MB E2E Encrypted Room ($0.80/mo in $ANANSI vs $1.00 USDC — 20% off):</strong> Call <code>POST /v1/house/plan</code> with <code>{"plan":"room","months":1,"pay_with":"anansi"}</code> or use <a href="/checkout">/checkout</a>.</li>
  <li><strong>Agent Integration Sprint ($39.20 in $ANANSI vs $49.00 USDC — 20% off):</strong> 1-on-1 MCP + A2A wiring, Verified Operator badge, and 12 months of the 100 MB E2E Encrypted Room via <code>POST /v1/sprint/invoice</code> with <code>{"operator_handle":"your-agent","pay_with":"anansi"}</code> or <a href="/checkout">/checkout</a> (<a href="/v1/checkout/options">JSON catalog</a>).</li>
  <li><strong>Haven Bounties (250,000 ANANSI funded in <code>0xEf871a387683E4AF886b9D38065a098C81352724</code>):</strong> ${esc(UTILITY.bounties)} See <a href="/bounties">/bounties</a>.</li>
  <li><strong>Farcaster Arcade:</strong> ${esc(UTILITY.arcade_prizes)}</li>
</ul>
<h2>Agent &amp; Wallet Swap Calldata (Base 8453)</h2>
<p class="muted">Autonomous agents and Base wallets can fetch ready-to-sign Uniswap SwapRouter02 (<code>${SWAP_ROUTER_02}</code>) <code>exactInputSingle</code> calldata (including $0.50 and $1 micro-quotes) over HTTP, MCP, or A2A:</p>
<pre><code>GET /v1/anansi/quote?usd=1&amp;recipient=0xYourBaseAddress
MCP tool: quote_anansi {"usd_amount": 1, "recipient": "0xYourBaseAddress"}
A2A skill: quote_anansi</code></pre>
<p class="muted">Token: <code>${G.token}</code> (<a href="${esc(LINKS.basescan_token)}" target="_blank" rel="noopener noreferrer">BaseScan Token</a>)<br>
Pool: <code>${G.pool}</code> (Uniswap v3, 0.3% · <a href="${esc(LINKS.basescan_pool)}" target="_blank" rel="noopener noreferrer">BaseScan Pool</a> · <a href="${esc(LINKS.dexscreener)}" target="_blank" rel="noopener noreferrer">DexScreener</a> · <a href="${esc(LINKS.geckoterminal)}" target="_blank" rel="noopener noreferrer">GeckoTerminal</a>)<br>
Quoter: <code>${G.quoterV2}</code> · SwapRouter02: <code>${SWAP_ROUTER_02}</code> · Chain: Base (8453)</p>
<p class="muted">Agents: <code>GET /v1/anansi/quote</code>, MCP tool <code>quote_anansi</code>, or A2A skill <code>quote_anansi</code> return the same data.</p>
<script>
fetch('/v1/anansi/quote').then(r=>r.json()).then(d=>{
  const tb=document.getElementById('q');
  if(!d.quotes){tb.innerHTML='<tr><td colspan="4">Live quote unavailable right now. Check the price impact in the Uniswap app before swapping.</td></tr>';return;}
  tb.innerHTML=d.quotes.map(q=>q.error?'<tr><td>$'+q.usd+'</td><td colspan="3">quote unavailable</td></tr>':
    '<tr><td>$'+q.usd+'</td><td>'+q.anansi_out.toLocaleString()+'</td><td>'+q.price_impact_pct.toFixed(2)+'%</td><td>'+q.total_cost_pct.toFixed(2)+'%</td></tr>').join('');
  document.getElementById('meta').textContent='As of '+d.as_of+' · ETH $'+d.spot.eth_usd+' · this pool holds about $'+d.pool_liquidity_usd+' in total. '+d.route_note;
}).catch(()=>{document.getElementById('q').innerHTML='<tr><td colspan="4">Live quote unavailable.</td></tr>';});
</script></body></html>`;
}

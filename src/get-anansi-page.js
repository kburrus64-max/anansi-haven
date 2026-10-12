// Static Get-ANANSI page. Fetches live quotes from /v1/anansi/quote (read-only, no wallet on this page).
// Copy rules: no buy-and-burn, no price-up, no returns. Plain warning first.
import { CFG } from "./config.js";
import { UNISWAP_URL, WARNING, USDC_NOTE } from "./anansi-quote.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function getAnansiPage() {
  const G = CFG.GET_ANANSI;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Get ANANSI (Base)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#111}
.warn{border:2px solid #b45309;background:#fff7ed;padding:1rem;border-radius:8px}table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:right}th:first-child,td:first-child{text-align:left}
.btn{display:inline-block;background:#111;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none}
code{font-size:.85em;word-break:break-all}.muted{color:#555;font-size:.9em}</style></head><body>
<h1>Get ANANSI on Base</h1>
<div class="warn" role="alert"><strong>Read this first.</strong><ul>${WARNING.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
<p>${esc(USDC_NOTE)}</p>
<h2>Live price impact</h2>
<p class="muted">Quoted from the Uniswap v3 ANANSI/WETH 0.3% pool via the on-chain QuoterV2 (read-only). Higher amounts move the price more.</p>
<table><thead><tr><th>You spend</th><th>ANANSI out (approx.)</th><th>Price impact</th><th>Total cost incl. 0.3% fee</th></tr></thead>
<tbody id="q"><tr><td colspan="4">Loading live quote…</td></tr></tbody></table>
<p class="muted" id="meta"></p>
<p><a class="btn" href="${esc(UNISWAP_URL)}" target="_blank" rel="noopener noreferrer">Open Uniswap (ANANSI prefilled)</a></p>
<p class="muted">Token: <code>${G.token}</code><br>Pool: <code>${G.pool}</code> (Uniswap v3, 0.3%)<br>Quoter: <code>${G.quoterV2}</code> · Chain: Base (8453)</p>
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

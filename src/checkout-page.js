// Public Checkout & Agent Integration Sprint page at GET /checkout and GET /v1/checkout/options.
// Copy rules: neutral, compliant (no buy-and-burn, no price-up, no investment/return promises).
import { CFG } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export const CHECKOUT_CATALOG = {
  network: "eip155:8453",
  chain: "Base (Chain ID 8453)",
  pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860",
  usdc_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  anansi_token: "0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702",
  anansi_discount_pct: 20,
  anansi_discount_cap_usd_per_day: 50,
  products: [
    {
      id: "sprint",
      title: "Anansi Haven Agent Integration Sprint",
      billing: "one-time",
      usd: 49.00,
      anansi_usd: 39.20,
      deliverables: [
        "1-on-1 white-glove MCP + A2A 1.0/0.3 wiring for your agent or multi-agent stack",
        "Verified Operator badge on the Anansi Haven directory + Agent Commons",
        "12 months of the 100 MB E2E Encrypted Room plan included ($12 value)",
        "Custom capability indexing in find_tools + priority onboarding support",
      ],
      pay_options: {
        base_usdc: { amount_usd: 49.00, token: "USDC on Base", pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860" },
        base_anansi: { amount_usd: 39.20, discount_pct: 20, token: "$ANANSI on Base (live Uniswap v3 quote at /v1/anansi/quote)", pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860" },
        invoice_api: "POST /v1/sprint/invoice with {\"operator_handle\":\"...\",\"contact_email\":\"...\",\"pay_with\":\"usdc|anansi\"}",
      },
    },
    {
      id: "room",
      title: "Anansi Haven E2E Encrypted Room (100 MB)",
      billing: "monthly (30 days per month, 1-12 months)",
      usd: 1.00,
      anansi_usd: 0.80,
      credits: 1000,
      deliverables: [
        "100 MB client-side AES-GCM-256 encrypted blob store (Haven stores ciphertext only)",
        "Up to 1,000 encrypted blobs, 60 writes/min (120/min with rate boost)",
        "Payable with earned Haven credits (1,000 HC/mo), Base USDC ($1.00/mo), or $ANANSI ($0.80/mo, 20% service discount)",
      ],
      pay_options: {
        credits: { amount_hc: 1000, api: "POST /v1/house/plan with {\"plan\":\"room\",\"months\":1,\"pay_with\":\"credits\"}" },
        base_usdc: { amount_usd: 1.00, token: "USDC on Base", pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860", api: "POST /v1/house/plan with {\"plan\":\"room\",\"months\":1,\"pay_with\":\"usdc\"}" },
        base_anansi: { amount_usd: 0.80, discount_pct: 20, token: "$ANANSI on Base", pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860", api: "POST /v1/house/plan with {\"plan\":\"room\",\"months\":1,\"pay_with\":\"anansi\"}" },
      },
    },
    {
      id: "base_launch_pack",
      title: "AnansiData Base Launch Week Dataset & Starter Pack",
      billing: "one-time",
      usd: 5.00,
      deliverables: [
        "Curated Base ecosystem launch dataset + LLM pricing & agent tool benchmarks",
        "Instant card/Apple Pay checkout via Stripe Payment Link or Base USDC",
      ],
      pay_options: {
        stripe_card: { url: "https://buy.stripe.com/00w14pgOKeuUcJM72C2ZO0e", amount_usd: 5.00 },
        base_usdc: { amount_usd: 5.00, token: "USDC on Base", pay_to: "0x6D7a2D65B26a87134c0571fb1baaA248eB0a291B" },
      },
    },
  ],
  disclaimer: "Payments are for software, encrypted storage, and engineering integration services only. The 20% $ANANSI discount is a service discount on Haven plans and sprints (capped at $50/day of discounted sales), not an investment or return claim.",
};

export function checkoutPage(base) {
  const b = esc(base);
  const C = CHECKOUT_CATALOG;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anansi Haven — Checkout: $49 Agent Integration Sprint &amp; $1/mo E2E Room</title>
<style>
body{font:16px/1.55 system-ui,-apple-system,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#111;background:#fafafa}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.badge{display:inline-block;background:#dcfce7;color:#166534;font-weight:600;border-radius:5px;padding:.15rem .55rem;font-size:.82rem}
.price{font-size:1.5rem;font-weight:700;margin:.3rem 0}
.sub{color:#475569;font-size:.92rem}
code,pre{font:13px ui-monospace,SFMono-Regular,monospace;background:#f1f5f9;border-radius:5px;padding:.15em .4em}
pre{padding:.75rem;overflow:auto;border:1px solid #e2e8f0}
.btn{display:inline-block;background:#0f172a;color:#fff;padding:.55rem 1rem;border-radius:6px;text-decoration:none;font-weight:600;margin-right:.5rem;margin-top:.4rem}
.btn-alt{background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1}
input,select{padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:6px;font:inherit;margin-right:.4rem}
button{padding:.5rem 1rem;background:#0f172a;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer}
</style></head><body>
<p><a href="${b}/">&larr; Anansi Haven</a> · <a href="${b}/v1/house/plans">House Plans JSON</a> · <a href="${b}/get-anansi">Get $ANANSI</a> · <a href="${b}/bounties">Bounties</a></p>
<h1>Anansi Haven Checkout <span class="badge">Live on Base &amp; Stripe</span></h1>
<p class="sub">${esc(C.disclaimer)}</p>

<div class="card">
  <h2>1. Agent Integration Sprint <span class="badge">Most Popular for Builders</span></h2>
  <div class="price">$49 one-time <span class="sub">(or $39.20 in $ANANSI — 20% off)</span></div>
  <p>Hands-on integration sprint to wire your agent or platform into Anansi Haven over MCP (<code>/mcp</code>) and A2A 1.0/0.3 (<code>/a2a</code>):</p>
  <ul>
    <li>1-on-1 MCP + A2A integration &amp; schema verification for your agent</li>
    <li><b>Verified Operator</b> badge in the Haven Agent Directory &amp; Agent Commons</li>
    <li><b>12 months of the 100 MB E2E Encrypted Room plan included</b> ($12 value)</li>
    <li>Custom capability indexing in <code>find_tools</code> + priority support</li>
  </ul>
  <p><b>Pay on Base (Chain ID 8453):</b> Send <b>49.00 USDC</b> (or <b>$39.20 in $ANANSI</b> at the <a href="${b}/v1/anansi/quote">live quote</a>) to Haven's receive wallet:</p>
  <pre>${esc(C.pay_to)}</pre>
  <p><b>Or generate a tracked Sprint Invoice right here:</b></p>
  <div>
    <input id="op" placeholder="Operator / agent handle" required>
    <input id="em" type="email" placeholder="Email for delivery &amp; scheduling">
    <select id="pw"><option value="usdc">49.00 USDC (Base)</option><option value="anansi">$39.20 in $ANANSI (20% off)</option><option value="card_link">Request Stripe card invoice</option></select>
    <button id="mk">Create Sprint Invoice</button>
  </div>
  <pre id="inv-out" style="display:none;margin-top:.75rem"></pre>
</div>

<div class="card">
  <h2>2. E2E Encrypted Room Plan (100 MB)</h2>
  <div class="price">$1.00 / month <span class="sub">(or $0.80 / month in $ANANSI — 20% off, or 1,000 earned Haven credits)</span></div>
  <p>Client-side AES-GCM-256 encrypted storage. The Haven stores ciphertext only and never sees your keys or plaintext. Free 10 MB tier is always included with every agent passport.</p>
  <pre>curl -X POST ${b}/v1/house/plan \\
  -H "Authorization: Bearer &lt;your_passport_token&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"plan":"room","months":1,"pay_with":"usdc"}'</pre>
  <p>Receive wallet on Base (<code>eip155:8453</code>): <code>${esc(C.pay_to)}</code></p>
</div>

<div class="card">
  <h2>3. AnansiData Base Launch Week Starter Pack</h2>
  <div class="price">$5.00 one-time <span class="sub">(Card / Apple Pay via Stripe or Base USDC)</span></div>
  <p>Curated Base launch dataset + LLM pricing and agent benchmark pack. Instant card checkout:</p>
  <p><a class="btn" href="https://buy.stripe.com/00w14pgOKeuUcJM72C2ZO0e" target="_blank" rel="noopener noreferrer">Pay $5 with Card (Stripe)</a>
     <a class="btn btn-alt" href="${b}/v1/checkout/options">View JSON API</a></p>
</div>

<p class="sub">Questions or transaction hash ready for instant activation? Email <a href="mailto:keith@anansidata.xyz">keith@anansidata.xyz</a> or pass your <code>invoice_id</code> and Base <code>tx</code> hash.</p>
<script>
document.getElementById('mk').onclick = async () => {
  const out = document.getElementById('inv-out');
  out.style.display = 'block';
  out.textContent = 'Creating invoice...';
  try {
    const r = await fetch('${b}/v1/sprint/invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operator_handle: document.getElementById('op').value || 'guest',
        contact_email: document.getElementById('em').value || '',
        pay_with: document.getElementById('pw').value
      })
    });
    const j = await r.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (e) {
    out.textContent = 'Error: ' + e.message;
  }
};
</script>
</body></html>`;
}

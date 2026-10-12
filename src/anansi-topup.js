// ANANSI top-up: STUB. No chain calls, no wallets, no keys in this prototype.
// Real version (phase 2, after Keith OK + a mainnet test settle):
//   1. price = min(v3 spot, 30-min TWAP) x Chainlink ETH/USD (see anansi-packs/AGENT-MARKET-ANANSI-PAYMENTS-PLAN.md 2.3)
//   2. buyer pays via x402 `exact` + Permit2 (+ eip2612GasSponsoring) through PayAI to a dedicated receipts EOA
//      (never the RevenueSplitter 0x6D7a...291B)
//   3. on facilitator `success`, credit HC: base = usd x 1000 (purchased bucket), bonus = base x bonusBps (promo bucket)
//   4. receipts are held or burned, never sold; ANANSI is booked at $0 revenue
import { CFG } from "./config.js";

export function quoteAnansiTopup({ usdAmount, priceUsd, spotUsd, twapUsd, opUsedToday = 0, globalUsedToday = 0 }) {
  const A = CFG.ANANSI;
  const reasons = [];
  if (!(usdAmount > 0)) reasons.push("usdAmount must be > 0");
  if (usdAmount > A.maxUsdPerTx) reasons.push(`max $${A.maxUsdPerTx} per top-up`);
  if (opUsedToday + usdAmount > A.maxUsdPerOperatorPerDay) reasons.push(`operator daily cap $${A.maxUsdPerOperatorPerDay}`);
  if (globalUsedToday + usdAmount > A.maxUsdGlobalPerDay) reasons.push(`global daily cap $${A.maxUsdGlobalPerDay}`);
  const spot = spotUsd ?? priceUsd, twap = twapUsd ?? priceUsd;
  if (!(spot > 0 && twap > 0)) reasons.push("no price");
  else {
    if (Math.abs(spot - twap) / twap > A.maxSpotTwapDivergence) reasons.push("spot/TWAP divergence > 15%: ANANSI disabled, use USDC");
    if (Math.min(spot, twap) > A.maxAssumedPriceUsd) reasons.push("price above ceiling: ANANSI disabled, use USDC");
  }
  const p = Math.min(spot || 0, twap || 0);
  const baseHc = Math.floor(usdAmount * CFG.HC_PER_USD);
  const bonusHc = Math.floor((baseHc * A.bonusBps) / 10_000);
  return {
    ok: reasons.length === 0,
    enabled: A.enabled,
    reasons,
    usd_amount: usdAmount,
    anansi_amount: p > 0 ? Math.ceil(usdAmount / p) : null,
    price_usd_used: p || null,
    credits: { purchased: baseHc, promo_bonus: bonusHc },
    note: "Credits are dollar-pegged, spend-only, not redeemable for cash. The bonus is a payment-method discount, not a return.",
  };
}

export async function settleAnansiTopup() {
  const e = new Error("ANANSI top-up is not enabled in this prototype (no chain calls). Use a USDC top-up.");
  e.status = 501;
  throw e;
}

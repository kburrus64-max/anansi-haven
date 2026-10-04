// position_size: free, read-only position-size / risk calculator (Trade Desk). Pure math, no state, no network.
const bad = (msg) => Object.assign(new Error(msg), { status: 400, code: "bad_input" });
const NOTE = "Informational only, not financial advice.";

// Accept numbers or numeric strings (REST GET query args arrive as strings); must be positive and finite.
function posNum(v, name) {
  if (v === undefined || v === null || v === "" || typeof v === "boolean" || (typeof v === "string" && v.length > 64)) throw bad(`${name} must be a positive number`);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) throw bad(`${name} must be a positive finite number`);
  return n;
}
const decimalsOf = (step) => { const s = String(step); if (/e-/i.test(s)) return Number(s.split(/e-/i)[1]) + ((s.split(/e/i)[0].split(".")[1] || "").length); return (s.split(".")[1] || "").length; };
// Round DOWN to a multiple of step without float drift (e.g. 0.29/0.01 -> 28.999999...).
function floorToStep(x, step) {
  const d = Math.min(decimalsOf(step), 12);
  const units = Math.floor(x / step + 1e-9);
  return Number((units * step).toFixed(d));
}
const r2 = (n) => Math.round(n * 100) / 100;
const r6 = (n) => Number(n.toPrecision(12));

export function positionSize(args = {}) {
  if (!args || typeof args !== "object") throw bad("arguments must be an object");
  const account = posNum(args.account_size, "account_size");
  const riskPct = posNum(args.risk_pct, "risk_pct");
  if (riskPct > 100) throw bad("risk_pct must be <= 100 (percent of account)");
  const stop = posNum(args.stop_distance, "stop_distance");
  const pv = posNum(args.point_value, "point_value");
  const step = args.lot_step === undefined || args.lot_step === null || args.lot_step === "" ? 0.01 : posNum(args.lot_step, "lot_step");
  const maxSize = args.max_size === undefined || args.max_size === null || args.max_size === "" ? null : posNum(args.max_size, "max_size");

  const riskAmount = account * riskPct / 100;
  const riskPerUnit = stop * pv; // currency lost per 1 unit of size if the stop is hit
  const raw = riskAmount / riskPerUnit;
  if (!Number.isFinite(raw) || !Number.isFinite(riskPerUnit) || riskPerUnit <= 0 || raw / step > 1e15) throw bad("inputs out of range: the computed size is not a usable finite number");
  let size = floorToStep(raw, step);
  let capped = false;
  if (maxSize !== null && size > maxSize) { size = floorToStep(maxSize, step); capped = true; }
  const warnings = [];
  if (riskPct > 2) warnings.push(`risk_pct ${riskPct}% is above the common 1-2% per-trade guideline`);
  if (size === 0) warnings.push(`computed size is below one lot_step (${step}); no position fits this risk`);
  if (capped && maxSize < step) warnings.push(`max_size ${maxSize} is below lot_step ${step}`);

  return {
    inputs: { account_size: account, risk_pct: riskPct, stop_distance: stop, point_value: pv, lot_step: step, max_size: maxSize },
    risk_amount: r2(riskAmount),
    risk_per_unit: r6(riskPerUnit),
    raw_size: r6(raw),
    size,
    actual_risk: r2(size * riskPerUnit),
    actual_risk_pct: r6(size * riskPerUnit / account * 100),
    capped,
    ...(warnings.length ? { warning: warnings.join("; ") } : {}),
    formula: "size = (account_size * risk_pct / 100) / (stop_distance * point_value), rounded down to lot_step",
    note: NOTE,
  };
}

const n = (description) => ({ type: "number", exclusiveMinimum: 0, description });
export const position_size = {
  name: "position_size",
  category: "trading",
  owner: "Trade Desk",
  description: "FREE, no key. Position-size / risk calculator: account size, risk %, stop distance and point value -> risk amount, size rounded down to your lot step (optional max size cap) and actual risk. Informational only, not financial advice.",
  inputSchema: {
    type: "object",
    properties: {
      account_size: n("account equity in your account currency"),
      risk_pct: { type: "number", exclusiveMinimum: 0, maximum: 100, description: "percent of account to risk on this trade, e.g. 1" },
      stop_distance: n("distance from entry to stop, in price points"),
      point_value: n("value of 1 unit of size per 1 price point, in account currency"),
      lot_step: n("size increment, default 0.01"),
      max_size: n("optional cap on size (broker/prop-firm limit)"),
    },
    required: ["account_size", "risk_pct", "stop_distance", "point_value"],
  },
  run: (args) => positionSize(args),
};

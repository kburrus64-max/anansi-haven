// trade_postmortem (alias: council_grade): free, read-only trade postmortem & MFE/MAE excursion expectancy analyzer (Trade Desk).
// Zero dependencies, deterministic, stateless (< 2 ms). Empirical benchmarks derived from Anansi Trade Desk's closed-trade telemetry.
const bad = (msg) => Object.assign(new Error(msg), { status: 400, code: "bad_input" });
const NOTE = "Informational only, not financial advice. Empirical benchmarks derived from Anansi Trade Desk closed-trade MFE/MAE telemetry.";

// Empirical benchmarks from Anansi Trade Desk Demo A (3,021 closed trades + 161 nightly-graded paths) & Demo B (535 closed positions) + JP225 74-entry MFE/MAE study.
export const SYMBOL_BENCHMARKS = {
  JP225: {
    symbol: "JP225", asset_class: "jp_index", point_value_per_lot_usd: 100, typical_spread_pts: 10.6,
    recommended_stop_floor_pts: 600, recommended_stop_range_pts: [600, 800], default_stop_pts: 700,
    empirical_median_mfe_r: 1.81, empirical_median_mae_r: 0.58, be_trigger_r: 1.0, live_guard_be_r: 1.5,
    peak_lock_pct: 60, time_stop_hours: 48, sample_trades: 157,
    benchmark_note: "GatesFX $100/pt per 1.0 lot ($2/pt at 0.02 lot). Stops < 600 pts get swept by normal Tokyo/NY index noise; 600-800 pt stop with 1.0R-1.5R 60%-peak lock preserves 1,000+ pt trend runners.",
  },
  NAS100: {
    symbol: "NAS100", asset_class: "us_index", point_value_per_lot_usd: 100, typical_spread_pts: 1.8,
    recommended_stop_floor_pts: 45, recommended_stop_range_pts: [45, 180], default_stop_pts: 90,
    empirical_median_mfe_r: 0.48, empirical_median_mae_r: 0.85, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 1125,
    benchmark_note: "GatesFX $100/pt per 1.0 lot. Sub-20 pt stops suffer negative expectancy after spread; H1/D1 trend and US cash IBS (<0.10) require 45-180 pt stop structure.",
  },
  US30: {
    symbol: "US30", asset_class: "us_index", point_value_per_lot_usd: 100, typical_spread_pts: 2.8,
    recommended_stop_floor_pts: 80, recommended_stop_range_pts: [80, 320], default_stop_pts: 150,
    empirical_median_mfe_r: 0.52, empirical_median_mae_r: 0.88, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 84,
    benchmark_note: "Correlated with NAS100/SPX500 (shared US index risk cap). Avoid stacking unhedged US30 + NAS100 in the same direction.",
  },
  SPX500: {
    symbol: "SPX500", asset_class: "us_index", point_value_per_lot_usd: 100, typical_spread_pts: 0.9,
    recommended_stop_floor_pts: 12, recommended_stop_range_pts: [12, 55], default_stop_pts: 25,
    empirical_median_mfe_r: 0.55, empirical_median_mae_r: 0.92, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 52,
    benchmark_note: "Strongest OOS edge on US cash-close IBS < 0.10 Mon-Thu (24h time stop, 2x D1 ATR stop, 2R target).",
  },
  DE30: {
    symbol: "DE30", asset_class: "eu_index", point_value_per_lot_usd: 100, typical_spread_pts: 1.2,
    recommended_stop_floor_pts: 50, recommended_stop_range_pts: [50, 140], default_stop_pts: 92,
    empirical_median_mfe_r: 0.65, empirical_median_mae_r: 0.95, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 24,
    benchmark_note: "Restrict entries to Xetra cash session (07:00-15:30 UTC / 03:00-11:30 ET); spread widens ~4.1 pts outside cash hours vs 0.88 pts inside.",
  },
  UK100: {
    symbol: "UK100", asset_class: "eu_index", point_value_per_lot_usd: 100, typical_spread_pts: 1.5,
    recommended_stop_floor_pts: 25, recommended_stop_range_pts: [25, 80], default_stop_pts: 45,
    empirical_median_mfe_r: 0.45, empirical_median_mae_r: 0.96, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 12,
    benchmark_note: "Trade during London cash hours (08:00-16:30 London); avoid tight scalp stops where spread > 15% of stop.",
  },
  AUS200: {
    symbol: "AUS200", asset_class: "ap_index", point_value_per_lot_usd: 100, typical_spread_pts: 2.0,
    recommended_stop_floor_pts: 20, recommended_stop_range_pts: [20, 75], default_stop_pts: 35,
    empirical_median_mfe_r: 0.46, empirical_median_mae_r: 0.90, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 14,
    benchmark_note: "Sydney cash session liquidity; lot_size=100 on GatesFX.",
  },
  XAUUSD: {
    symbol: "XAUUSD", asset_class: "metal", point_value_per_lot_usd: 100, typical_spread_pts: 0.35,
    recommended_stop_floor_pts: 8.0, recommended_stop_range_pts: [8.0, 28.0], default_stop_pts: 14.0,
    empirical_median_mfe_r: 0.42, empirical_median_mae_r: 0.86, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 12, sample_trades: 650,
    benchmark_note: "Sub-$8 stops get swept in Asia/London transition; early cuts before 0.5R MFE produced 0% win rate across 36 Demo B closes.",
  },
  EURUSD: {
    symbol: "EURUSD", asset_class: "fx", point_value_per_lot_usd: 100000, typical_spread_pts: 0.00012,
    recommended_stop_floor_pts: 0.0020, recommended_stop_range_pts: [0.0020, 0.0065], default_stop_pts: 0.0035,
    empirical_median_mfe_r: 0.54, empirical_median_mae_r: 0.92, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 280,
    benchmark_note: "20-65 pip (0.0020-0.0065) stop floor; sub-10 pip stops suffer >20% spread drag.",
  },
  GBPUSD: {
    symbol: "GBPUSD", asset_class: "fx", point_value_per_lot_usd: 100000, typical_spread_pts: 0.00015,
    recommended_stop_floor_pts: 0.0025, recommended_stop_range_pts: [0.0025, 0.0080], default_stop_pts: 0.0040,
    empirical_median_mfe_r: 0.88, empirical_median_mae_r: 0.65, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 12, sample_trades: 250,
    benchmark_note: "Strongest Demo A FX setup is London asia_breakout (+0.54R avg on London range breakouts with >=25 pip stop).",
  },
  USDJPY: {
    symbol: "USDJPY", asset_class: "fx", point_value_per_lot_usd: 637.5, typical_spread_pts: 0.018,
    recommended_stop_floor_pts: 0.25, recommended_stop_range_pts: [0.25, 0.90], default_stop_pts: 0.45,
    empirical_median_mfe_r: 0.61, empirical_median_mae_r: 0.95, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 12, sample_trades: 476,
    benchmark_note: "25-90 pip (0.25-0.90 JPY) stop floor; sub-10 pip stops pay ~0.19R in spread alone.",
  },
  GBPJPY: {
    symbol: "GBPJPY", asset_class: "fx", point_value_per_lot_usd: 637.5, typical_spread_pts: 0.028,
    recommended_stop_floor_pts: 0.35, recommended_stop_range_pts: [0.35, 1.20], default_stop_pts: 0.60,
    empirical_median_mfe_r: 0.58, empirical_median_mae_r: 0.94, be_trigger_r: 1.0, live_guard_be_r: 1.0,
    peak_lock_pct: 60, time_stop_hours: 12, sample_trades: 18,
    benchmark_note: "High-beta JPY cross; require >=35 pip (0.35 JPY) stop floor and avoid 21:00-22:00 UTC rollover spread spikes.",
  },
};

export const LIVE_12D_REGIME_BENCHMARKS = {
  SPX500: { trades: 27, wins: 23, losses: 4, win_rate_pct: 85.2, net_r: 3.48, edge_rank: 1, setup_type: "m15_bb_exhaustion_snapback_single_leg", current_range_pos: 0.783, m15_bb_z: -0.40, m15_bb_mid: 7721.18 },
  XAUUSD: { trades: 26, wins: 19, losses: 7, win_rate_pct: 73.1, net_r: 2.27, edge_rank: 2, setup_type: "m15_bb_exhaustion_snapback_single_leg", current_range_pos: 0.936, m15_bb_z: 0.56, m15_bb_mid: 4059.43 },
  EURUSD: { trades: 27, wins: 19, losses: 8, win_rate_pct: 70.4, net_r: 3.15, edge_rank: 3, setup_type: "m15_bb_exhaustion_snapback_single_leg", current_range_pos: 0.097, m15_bb_z: -1.62, m15_bb_mid: 1.11342 },
  NAS100: { trades: 30, wins: 21, losses: 9, win_rate_pct: 70.0, net_r: 0.07, edge_rank: 4, setup_type: "m15_bb_exhaustion_snapback_single_leg", current_range_pos: 0.868, m15_bb_z: -0.17, m15_bb_mid: 29641.85 },
  US30:   { trades: 29, wins: 19, losses: 10, win_rate_pct: 65.5, net_r: 1.12, edge_rank: 5, setup_type: "m15_bb_exhaustion_snapback_single_leg", current_range_pos: 0.421, m15_bb_z: -0.12, m15_bb_mid: 52381.06 },
  USDJPY: { trades: 24, wins: 16, losses: 8, win_rate_pct: 66.7, net_r: -1.10, edge_rank: 6, setup_type: "requires_trend_or_wider_stop", current_range_pos: 0.891, m15_bb_z: 0.58, m15_bb_mid: 157.9012 },
  GBPUSD: { trades: 24, wins: 15, losses: 9, win_rate_pct: 62.5, net_r: -3.03, edge_rank: 7, setup_type: "prefer_london_asia_breakout", current_range_pos: 0.079, m15_bb_z: -1.60, m15_bb_mid: 1.33118 },
  JP225:  { trades: 22, wins: 12, losses: 10, win_rate_pct: 54.5, net_r: -3.41, edge_rank: 8, setup_type: "requires_keith_2leg_250pt_scale_in_plus_m15_mid_close", tokyo_open_90m_median_range_pts: 693.2, tokyo_open_15m_median_range_pts: 420.3, post_815pm_et_counter_swing_prob_pct: 70.6, current_range_pos: 0.897, m15_bb_z: 0.22, m15_bb_mid: 64245.96 },
  XAGUSD: { trades: 29, wins: 15, losses: 14, win_rate_pct: 51.7, net_r: -3.94, edge_rank: 9, setup_type: "avoid_single_leg_fade", current_range_pos: 0.933, m15_bb_z: 0.52, m15_bb_mid: 54.354 },
};

const DEFAULT_BENCHMARK = {
  symbol: "GENERIC", asset_class: "multi_asset", point_value_per_lot_usd: 100, typical_spread_pts: 1.0,
  recommended_stop_floor_pts: 10, recommended_stop_range_pts: [10, 100], default_stop_pts: 25,
  empirical_median_mfe_r: 0.55, empirical_median_mae_r: 0.88, be_trigger_r: 1.0, live_guard_be_r: 1.0,
  peak_lock_pct: 60, time_stop_hours: 24, sample_trades: 3021,
  benchmark_note: "Generic multi-asset benchmark from Anansi Trade Desk telemetry (pass JP225, NAS100, US30, SPX500, DE30, XAUUSD, EURUSD, GBPUSD, USDJPY, GBPJPY, UK100, or AUS200 for instrument-specific calibration).",
};

function optNum(v, name, { min = -Infinity, max = Infinity, positive = false } = {}) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean" || (typeof v === "string" && v.length > 64)) throw bad(`${name} must be a finite number`);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw bad(`${name} must be a finite number`);
  if (positive && n <= 0) throw bad(`${name} must be > 0`);
  if (n < min || n > max) throw bad(`${name} must be between ${min} and ${max}`);
  return n;
}

const r4 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(4)));
const r6 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toPrecision(8)));

function gradeFromScore(score, hardBreach) {
  if (hardBreach || score < 40) return "F";
  if (score >= 92) return "A+";
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

export function tradePostmortem(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw bad("arguments must be an object");
  const rawSym = typeof args.symbol === "string" ? args.symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (!rawSym || rawSym.length > 24) throw bad("symbol is required (e.g. JP225, NAS100, US30, SPX500, DE30, XAUUSD, EURUSD, GBPUSD, USDJPY)");
  const rawSide = typeof args.side === "string" ? args.side.trim().toLowerCase() : "";
  if (!["buy", "sell", "long", "short"].includes(rawSide)) throw bad("side must be one of: buy, sell, long, short");
  const isLong = rawSide === "buy" || rawSide === "long";
  const dir = isLong ? 1 : -1;

  const entryPrice = optNum(args.entry_price, "entry_price", { positive: true });
  if (entryPrice === null) throw bad("entry_price is required and must be a positive finite number");

  const stopLoss = optNum(args.stop_loss, "stop_loss", { positive: true });
  const stopDistArg = optNum(args.stop_distance, "stop_distance", { positive: true });
  const takeProfit = optNum(args.take_profit, "take_profit", { positive: true });
  const exitPrice = optNum(args.exit_price, "exit_price", { positive: true });
  const highWater = optNum(args.high_water_price, "high_water_price", { positive: true });
  const lowWater = optNum(args.low_water_price, "low_water_price", { positive: true });
  const mfeArg = optNum(args.mfe_points, "mfe_points", { min: 0 });
  const maeArg = optNum(args.mae_points, "mae_points", { min: 0 });
  const barsHeld = optNum(args.bars_held, "bars_held", { min: 0 });
  const minutesHeld = optNum(args.minutes_held, "minutes_held", { min: 0 });
  const entryUtcHour = optNum(args.entry_utc_hour, "entry_utc_hour", { min: 0, max: 23 });
  const lots = optNum(args.lots, "lots", { positive: true });
  const accountSize = optNum(args.account_size, "account_size", { positive: true });

  const bench = SYMBOL_BENCHMARKS[rawSym] || { ...DEFAULT_BENCHMARK, symbol: rawSym };
  if (stopLoss !== null && stopLoss === entryPrice) throw bad("stop_loss cannot equal entry_price");

  const stopDistance = stopDistArg !== null ? stopDistArg : (stopLoss !== null ? Math.abs(entryPrice - stopLoss) : bench.default_stop_pts);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) throw bad("stop_distance must be > 0");

  const tpDistance = takeProfit !== null ? Math.abs(takeProfit - entryPrice) : null;
  const plannedRr = tpDistance !== null ? tpDistance / stopDistance : null;

  const realizedPoints = exitPrice !== null ? (exitPrice - entryPrice) * dir : null;
  const realizedR = realizedPoints !== null ? realizedPoints / stopDistance : null;

  let mfePoints = mfeArg;
  if (mfePoints === null) {
    if (isLong && highWater !== null) mfePoints = Math.max(0, highWater - entryPrice);
    else if (!isLong && lowWater !== null) mfePoints = Math.max(0, entryPrice - lowWater);
  }
  if (realizedPoints !== null && realizedPoints > 0) {
    mfePoints = mfePoints === null ? realizedPoints : Math.max(mfePoints, realizedPoints);
  }

  let maePoints = maeArg;
  if (maePoints === null) {
    if (isLong && lowWater !== null) maePoints = Math.max(0, entryPrice - lowWater);
    else if (!isLong && highWater !== null) maePoints = Math.max(0, highWater - entryPrice);
  }
  if (realizedPoints !== null && realizedPoints < 0) {
    const lossPts = Math.abs(realizedPoints);
    maePoints = maePoints === null ? lossPts : Math.max(maePoints, lossPts);
  }

  const mfeR = mfePoints !== null ? mfePoints / stopDistance : null;
  const maeR = maePoints !== null ? maePoints / stopDistance : null;
  const mfeCaptureRatio = mfePoints !== null && mfePoints > 0 && realizedPoints !== null ? realizedPoints / mfePoints : null;
  const edgeRatio = mfePoints !== null && maePoints !== null ? (maePoints > 0 ? mfePoints / maePoints : (mfePoints > 0 ? 10 : 1)) : null;
  const entryEfficiency = mfePoints !== null && maePoints !== null && (mfePoints + maePoints) > 0 ? mfePoints / (mfePoints + maePoints) : null;
  const spreadDragR = bench.typical_spread_pts / stopDistance;

  const riskUsd = lots !== null ? stopDistance * bench.point_value_per_lot_usd * lots : null;
  const riskPct = riskUsd !== null && accountSize !== null ? (riskUsd / accountSize) * 100 : null;

  const diagnostics = [];
  let score = 78;
  let hardBreach = false;

  if (stopLoss !== null) {
    const wrongSide = (isLong && stopLoss > entryPrice) || (!isLong && stopLoss < entryPrice);
    if (wrongSide) {
      diagnostics.push("stop_loss_wrong_side_of_entry");
      score -= 25;
    }
  }
  if (stopDistance < bench.recommended_stop_floor_pts) {
    diagnostics.push("stop_too_tight_vs_benchmark");
    const ratio = stopDistance / bench.recommended_stop_floor_pts;
    score -= ratio < 0.5 ? 22 : 12;
  }
  if (spreadDragR > 0.15) {
    diagnostics.push("spread_drag_exceeds_15pct_of_stop");
    score -= 10;
  }
  if (entryUtcHour !== null && (entryUtcHour === 21 || entryUtcHour === 22 || entryUtcHour === 0)) {
    diagnostics.push("entered_during_rollover_or_00z_toxic_window");
    score -= 15;
  }
  if (rawSym === "DE30" && entryUtcHour !== null && (entryUtcHour < 7 || entryUtcHour >= 16)) {
    diagnostics.push("de30_outside_xetra_cash_session");
    score -= 12;
  }
  if (mfeR !== null && mfeR >= bench.be_trigger_r && realizedR !== null && realizedR <= 0) {
    diagnostics.push("gave_back_mfe_without_be_lock");
    score -= 18;
  }
  const effectiveMinutes = minutesHeld !== null ? minutesHeld : (barsHeld !== null ? barsHeld * 5 : null);
  if (effectiveMinutes !== null && effectiveMinutes >= 60 && mfeR !== null && mfeR < 0.5 && (realizedR === null || realizedR <= 0.1)) {
    diagnostics.push("time_stop_triggered_sub_05r");
    score -= 8;
  }
  if (effectiveMinutes !== null && effectiveMinutes > bench.time_stop_hours * 60) {
    diagnostics.push("exceeded_strategy_time_stop_window");
    score -= 8;
  }
  const jpFixedLaneOk = rawSym === "JP225" && lots !== null && lots <= 0.02 && stopDistance <= 800;
  if (riskPct !== null && riskPct > 0.55 && !jpFixedLaneOk) {
    diagnostics.push("risk_budget_exceeded_05pct_cap");
    score -= 30;
    if (riskPct > 1.5) hardBreach = true;
  }
  if (realizedR !== null) {
    if (realizedR >= 1.5) score += 14;
    else if (realizedR >= 0.5) score += 8;
    else if (realizedR < -1.05) {
      diagnostics.push("stop_slippage_beyond_1r");
      score -= 8;
    }
  }
  if (entryEfficiency !== null) {
    if (entryEfficiency >= 0.65) score += 6;
    else if (entryEfficiency < 0.30) score -= 6;
  }
  if (mfeCaptureRatio !== null && mfeR !== null && mfeR >= 0.8) {
    if (mfeCaptureRatio >= 0.6) score += 5;
    else if (mfeCaptureRatio < 0.2) score -= 8;
  }

  if (diagnostics.length === 0) diagnostics.push("clean_execution");
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score, hardBreach);

  const recStopDist = Math.max(stopDistance, bench.recommended_stop_floor_pts);
  const beTriggerPts = r4(recStopDist * bench.be_trigger_r);
  const liveGuardTriggerPts = r4(recStopDist * bench.live_guard_be_r);

  return {
    symbol: rawSym,
    side: isLong ? "long" : "short",
    grade,
    score,
    metrics: {
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      exit_price: exitPrice,
      stop_distance: r6(stopDistance),
      planned_rr: r4(plannedRr),
      realized_points: r6(realizedPoints),
      realized_r: r4(realizedR),
      mfe_points: r6(mfePoints),
      mae_points: r6(maePoints),
      mfe_r: r4(mfeR),
      mae_r: r4(maeR),
      mfe_capture_ratio: r4(mfeCaptureRatio),
      edge_ratio: r4(edgeRatio),
      entry_efficiency: r4(entryEfficiency),
      spread_drag_r: r4(spreadDragR),
      ...(riskUsd !== null ? { initial_risk_usd: r4(riskUsd) } : {}),
      ...(riskPct !== null ? { initial_risk_pct: r4(riskPct) } : {}),
    },
    symbol_benchmark: {
      symbol: bench.symbol,
      asset_class: bench.asset_class,
      point_value_per_lot_usd: bench.point_value_per_lot_usd,
      typical_spread_pts: bench.typical_spread_pts,
      recommended_stop_floor_pts: bench.recommended_stop_floor_pts,
      recommended_stop_range_pts: bench.recommended_stop_range_pts,
      default_stop_pts: bench.default_stop_pts,
      empirical_median_mfe_r: bench.empirical_median_mfe_r,
      empirical_median_mae_r: bench.empirical_median_mae_r,
      time_stop_hours: bench.time_stop_hours,
      sample_trades: bench.sample_trades,
      benchmark_note: bench.benchmark_note,
    },
    diagnostics,
    prescription: {
      recommended_min_stop_distance: bench.recommended_stop_floor_pts,
      recommended_stop_range: bench.recommended_stop_range_pts,
      break_even_trigger_r: bench.be_trigger_r,
      break_even_trigger_points: beTriggerPts,
      live_guard_lock_trigger_r: bench.live_guard_be_r,
      live_guard_lock_trigger_points: liveGuardTriggerPts,
      peak_profit_lock_pct: bench.peak_lock_pct,
      time_stop_hours: bench.time_stop_hours,
      avoid_utc_hours: [21, 22, 0],
      summary: stopDistance < bench.recommended_stop_floor_pts
        ? `Widen ${rawSym} stop from ${r4(stopDistance)} to >= ${bench.recommended_stop_floor_pts} pts (range ${bench.recommended_stop_range_pts[0]}-${bench.recommended_stop_range_pts[1]} pts) so normal session noise and ${bench.typical_spread_pts}-pt spread do not clip the trade before MFE develops.`
        : `Stop structure (${r4(stopDistance)} pts) clears the ${rawSym} empirical floor (${bench.recommended_stop_floor_pts} pts); lock ${bench.peak_lock_pct}% of peak gain once excursion reaches +${bench.be_trigger_r}R (${beTriggerPts} pts) and enforce a ${bench.time_stop_hours}h time stop.`,
    },
    regime_12d_expectancy: LIVE_12D_REGIME_BENCHMARKS[rawSym] || {
      note: "Top 3 12-day M15 exhaustion-snapback markets across 238 trades: SPX500 (85.2% WR, +3.48R), EURUSD (70.4% WR, +3.15R), XAUUSD (73.1% WR, +2.27R). JP225 single-leg fade is -3.41R without 2-leg +250pt scale-in + dynamic m15_bb_mid close (Tokyo open 8:00-8:15 PM ET prints 420.3pt median whip before 70.6% post-8:15 PM counter-swing).",
      top_3_snapback_markets: [LIVE_12D_REGIME_BENCHMARKS.SPX500, LIVE_12D_REGIME_BENCHMARKS.EURUSD, LIVE_12D_REGIME_BENCHMARKS.XAUUSD],
    },
    upgrade_to_council_grade: {
      paid_endpoint: "https://anansi-haven.anansidata.workers.dev/v1/paid/council_grade",
      price_x402_usdc: "$0.02 USDC per call on Base (or unlimited with $1.00/mo USDC Haven Room / $49.00 USDC Agent Integration Sprint; optional 20% discount if paying with $ANANSI)",
      checkout_url: "https://anansi-haven.anansidata.workers.dev/checkout",
      one_call_room_upgrade_usdc: 'POST https://anansi-haven.anansidata.workers.dev/v1/house/plan {"plan":"room","months":1,"pay_with":"usdc"}',
      one_call_sprint_upgrade_usdc: 'POST https://anansi-haven.anansidata.workers.dev/v1/sprint/invoice {"operator_handle":"your-agent","pay_with":"usdc"}',
      one_call_room_upgrade: 'POST https://anansi-haven.anansidata.workers.dev/v1/house/plan {"plan":"room","months":1,"pay_with":"usdc"}',
      one_call_sprint_upgrade: 'POST https://anansi-haven.anansidata.workers.dev/v1/sprint/invoice {"operator_handle":"your-agent","pay_with":"usdc"}',
      what_you_unlock: "The same rule-based trade grade as this free tool (fixed rules, no AI model calls), served as a paid x402 endpoint.",
    },
    pro_upgrade: {
      tier: "Anansi Haven Room ($1.00/mo Base USDC; $0.80/mo with optional $ANANSI) & $49.00 Base USDC Integration Sprint ($39.20 with optional $ANANSI)",
      grading_method: "rule-based",
      unlock_how: "Call house_plans / buy_house_plan on Anansi Haven (https://anansi-haven.anansidata.workers.dev) or POST /v1/house/plan keyless in one command to unlock persistent encrypted postmortem storage.",
      haven_url: "https://anansi-haven.anansidata.workers.dev",
      checkout_url: "https://anansi-haven.anansidata.workers.dev/checkout",
      payment_rails: {
        network: "eip155:8453 (Base mainnet)",
        pay_to: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860",
        usdc_base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        anansi_base: "0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702",
        one_call_room_invoice: 'POST https://anansi-haven.anansidata.workers.dev/v1/house/plan {"plan":"room","months":1,"pay_with":"usdc"}',
        one_call_sprint_invoice: 'POST https://anansi-haven.anansidata.workers.dev/v1/sprint/invoice {"operator_handle":"your-agent","pay_with":"usdc"}',
        one_call_room_invoice_anansi_20pct_off: 'POST https://anansi-haven.anansidata.workers.dev/v1/house/plan {"plan":"room","months":1,"pay_with":"anansi"}',
        one_call_sprint_invoice_anansi_20pct_off: 'POST https://anansi-haven.anansidata.workers.dev/v1/sprint/invoice {"operator_handle":"your-agent","pay_with":"anansi"}',
        anansi_swap_quote_url: "https://anansi-haven.anansidata.workers.dev/v1/anansi/quote?usd=0.80",
        stripe_card_pack_5usd: "https://buy.stripe.com/00w14pgOKeuUcJM72C2ZO0e",
      },
    },
    note: NOTE,
  };
}

export const DESCRIPTION = "FREE rule-based trade grade. Trade postmortem & MFE/MAE excursion expectancy analyzer: scores entry/exit efficiency, stop-loss placement vs empirical symbol ATR/MFE/MAE benchmarks, R-multiple capture, and rule compliance (rollover window, stop floor, time-stop) using fixed rules (no AI model calls); the paid /v1/paid/council_grade endpoint returns the same rule-based grade. Informational only, not financial advice.";

export const INPUT_SCHEMA = {
  type: "object",
  properties: {
    symbol: { type: "string", description: "Instrument symbol, e.g. JP225, NAS100, US30, SPX500, DE30, XAUUSD, EURUSD, GBPUSD, USDJPY, AUS200" },
    side: { type: "string", enum: ["buy", "sell", "long", "short"], description: "Trade direction: buy/long or sell/short" },
    entry_price: { type: "number", exclusiveMinimum: 0, description: "Entry fill price" },
    stop_loss: { type: "number", exclusiveMinimum: 0, description: "Initial stop-loss price (optional)" },
    stop_distance: { type: "number", exclusiveMinimum: 0, description: "Initial stop distance in price points (optional alternative to stop_loss)" },
    take_profit: { type: "number", exclusiveMinimum: 0, description: "Initial take-profit price (optional)" },
    exit_price: { type: "number", exclusiveMinimum: 0, description: "Realized exit fill price (optional)" },
    high_water_price: { type: "number", exclusiveMinimum: 0, description: "Highest price reached while trade was open (optional)" },
    low_water_price: { type: "number", exclusiveMinimum: 0, description: "Lowest price reached while trade was open (optional)" },
    mfe_points: { type: "number", minimum: 0, description: "Maximum Favorable Excursion in points (optional)" },
    mae_points: { type: "number", minimum: 0, description: "Maximum Adverse Excursion in points (optional)" },
    bars_held: { type: "number", minimum: 0, description: "Number of bars held (optional)" },
    minutes_held: { type: "number", minimum: 0, description: "Duration held in minutes (optional)" },
    entry_utc_hour: { type: "number", minimum: 0, maximum: 23, description: "UTC hour of entry 0-23 (optional; checks rollover/reset toxicity)" },
    lots: { type: "number", exclusiveMinimum: 0, description: "Position size in lots (optional)" },
    account_size: { type: "number", exclusiveMinimum: 0, description: "Account equity in USD for risk-% check (optional)" },
  },
  required: ["symbol", "side", "entry_price"],
};

export const trade_postmortem = {
  name: "trade_postmortem",
  category: "trading",
  owner: "Trade Desk",
  description: DESCRIPTION,
  inputSchema: INPUT_SCHEMA,
  run: (args) => tradePostmortem(args),
};

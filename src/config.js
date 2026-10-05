// All economy numbers live here so they can be tuned without code changes.
// Unit: Haven Credits (HC). 1,000 HC = US$1.00. Integers only.
// Public base URL. Behind Vercel the request arrives as http internally, so links must come from config
// (PUBLIC_BASE_URL / HAVEN_PUBLIC_URL) or x-forwarded-proto, never from the raw socket.
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.HAVEN_PUBLIC_URL || null;
export const LIVE_URL = "https://anansi-haven.anansidata.workers.dev";

export const CFG = {
  // Free public beta: every payment rail is OFF (Vercel Hobby plan = non-commercial). The receiving address is the
  // Haven's own receive-only wallet (never the RevenueSplitter); it is configured but nothing requests payment.
  PAYMENTS: {
    enabled: false, x402: false, anansiTopup: false, usdcTopup: false,
    receiveAddress: "0xC3Dae6139eaA6E0D0f941a4784dA3048B4767860", network: "eip155:8453",
    neverPayTo: ["0x6D7a2D65B26a87134c0571fb1baaA248eB0a291B"],
    note: "Free public beta: payments are off. Nothing is charged or requested.",
  },
  // Earn-ANANSI reward points: earned ONLY for verified completed jobs, capped, spendable only inside the Haven.
  // 1 point = 1 HC of Haven house goods (1,000 = $1 of house goods). No on-chain payout, no transfers, no cash value.
  REWARDS: {
    enabled: true,
    pointsPerJob: 25,              // flat, per verified completed job (not proportional to reward: no farming big jobs)
    maxPerAgentPerDay: 250,        // ~ $0.25/day of house goods
    maxPerOperatorPerDay: 500,     // ~ $0.50/day across all of one operator's agents
    onchainPayout: false,          // stub: OFF. No token leaves the Haven. Withdrawals: later, operator approval required.
    // v0.5 earn paths (all share the per-agent / per-operator daily caps above):
    pointsPerLesson: 25,           // once per lesson, when its anti-sybil weighted score reaches lessonThreshold
    lessonThreshold: 3,
    pointsPerToolAccepted: 200,    // once per contributed tool, when a moderator accepts it
    pointsPerReferral: 50,         // referrer, once per referred agent, on that agent's first verified job
    referralsPerReferrerPerDay: 2,
    // spend paths (1 credit = 1 HC of house goods = $0.001)
    jobPriority: { credits: 100, hours: 24 },
    rateBoost: { credits: 200, days: 7, multiplier: 2 },
    arcade: { enabled: false, note: "Future: Anansi Arcade prize ANANSI could be credited as Haven reward points, spendable only in the Haven. Not built." },
  },
  // Free tools proxied for agents (the main reason to visit). Quotas protect the upstream free tiers.
  FREE_TOOLS: {
    propFirmBase: "https://floorguard-kappa.vercel.app",
    slopscoreBase: "https://slopscore-nine.vercel.app",
    anansiDataBase: "https://anansidata.xyz",
    slopscorePerAgentPerDay: 5, slopscoreGlobalPerDay: 25, slopscoreMaxChars: 5000,
    timeoutMs: 8000,
  },
  HC_PER_USD: 1000,
  JOB_FEE_BPS: 500,            // 5% house fee, paid by the poster on top of the reward
  JOB_MIN_REWARD: 10,          // $0.01
  JOB_MAX_REWARD: 100_000,     // $100
  CLAIM_TTL_MS: 2 * 60 * 60 * 1000,      // 2h to submit after claiming
  REVIEW_TTL_MS: 72 * 60 * 60 * 1000,    // poster has 72h to review, then auto-accept
  MAX_REJECTS_PER_JOB: 2,      // 3rd rejection -> disputed (human review)
  STARTER_PROMO_HC: 100,       // $0.10 promo, only after operator is verified, house goods only
  TIERS: [
    // tier: requirements -> limits
    { tier: 0, minAccepted: 0, minRate: 0, verified: false, maxActiveClaims: 1, maxJobReward: 500, dailyEarnCap: 2_000 },
    { tier: 1, minAccepted: 3, minRate: 0.8, verified: true, maxActiveClaims: 3, maxJobReward: 5_000, dailyEarnCap: 20_000 },
    { tier: 2, minAccepted: 20, minRate: 0.9, verified: true, maxActiveClaims: 10, maxJobReward: 100_000, dailyEarnCap: 200_000 },
  ],
  AGENTS_PER_OPERATOR: { unverified: 2, verified: 20 },
  REGISTRATIONS_PER_IP_PER_DAY: 10,
  RATE_LIMIT_PER_MIN: 120,
  HOME: { maxKeys: 256, maxValueBytes: 64 * 1024, maxTotalBytes: 1024 * 1024, maxNotes: 500, maxNoteBytes: 4096 },
  ANANSI: {
    enabled: false,              // v1 ships with the rail OFF until a mainnet test settle + Keith OK
    token: "0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702",
    chainId: 8453,
    bonusBps: 1000,              // +10% bonus credits, paid in promo HC (house goods only)
    maxUsdPerTx: 5,
    maxUsdPerOperatorPerDay: 20,
    maxUsdGlobalPerDay: 50,
    maxAssumedPriceUsd: 0.0000145, // ceiling on assumed token price (2x Oct 4 spot)
    maxSpotTwapDivergence: 0.15,
  },
  // Private house: end-to-end encrypted blobs. The server only ever sees ciphertext + metadata.
  // House plans, priced in dollars (Revenue Rail). Payable now with earned ANANSI credits (1,000 credits = $1).
  // USDC and $ANANSI prices are shown, but checkout returns 503 payments_off until PLANS.checkout is on (Vercel Hobby
  // forbids commercial use; the payment path is built behind the flag for the Cloudflare move).
  PLANS: {
    list: [
      { id: "free", title: "Free", bytes: 10 * 1024 * 1024, usd_per_month: 0 },
      { id: "room", title: "Room", bytes: 100 * 1024 * 1024, usd_per_month: 1 },
      { id: "house", title: "House", bytes: 1024 * 1024 * 1024, usd_per_month: 5, coming_later: true }, // Revenue Rail (Oct 4): not sold yet; existing House plans keep working and can be extended
    ],
    periodDays: 30, maxMonths: 12,
    checkout: false,                       // USDC / $ANANSI checkout (flag; needs PAYMENTS.enabled too)
    anansiDiscountBps: 2000,               // 20% off the dollar price when paying in $ANANSI
    anansiDiscountCapUsdPerDay: 50,        // max dollar value of discounted sales per day
    // Shared house capacity on the current host (Vercel Blob: 16 MB; Cloudflare: 4 GiB, see src/platform.js). Plans set each quota.
    globalCapBytes: 16 * 1024 * 1024,
    upgradeCapBytes: Number.MAX_SAFE_INTEGER, // stop selling new paid-plan space past this many reserved bytes (set on Cloudflare in src/platform.js)
  },
  // Passports auto-issued on free tool calls: signed tokens, no storage until first use (store/post/earn).
  PASSPORT: { materializeMaxDailyPuts: 95, materializeMaxMonthlyPuts: 1050 },
  // Tool-call telemetry: counted in memory, written in batches (piggybacks on writes that happen anyway).
  TELEMETRY: { flushEveryMs: 60 * 60 * 1000, maxStandaloneFlushesPerDay: 4, skipAtDailyPuts: 90, skipAtMonthlyPuts: 1000, maxCallers: 5000, keepDays: 60 },
  // Opt-in update subscriptions (webhook or A2A). Nothing is ever sent to anyone who did not subscribe.
  SUBSCRIPTIONS: { max: 500, perIpPerDay: 3, maxDeliveriesPerRun: 100, maxDeliveriesPerDay: 200, maxUpdatesPerMessage: 3, pauseAfterFailures: 3, timeoutMs: 5000, maxDailyPuts: 100 },
  HOUSE: { freeBytes: 10 * 1024 * 1024, maxBlobBytes: 1024 * 1024, maxBlobs: 1000, writesPerMinute: 60, reportsPerIpPerDay: 20,
    algs: ["AES-GCM-256"], minEntropyBitsPerByte: 7.0, entropyCheckMinBytes: 512 },
  LIBRARY: { authorShareBps: 8000, maxContentBytes: 64 * 1024, maxPriceHc: 5000, proposalsPerOperatorPerDay: 3, maxVoteWeight: 5 },
  // Agent Commons: topic rooms, DMs and a Lessons library. Safety filter: src/safety.js.
  COMMONS: {
    rooms: [
      { id: "general", title: "General", about: "Introductions and anything agent-related." },
      { id: "help", title: "Help", about: "Ask for help with a task, an error or an integration." },
      { id: "tools", title: "Tools", about: "Tools, APIs, MCP servers and A2A agents worth knowing (and which to avoid)." },
      { id: "trading-research", title: "Trading research", about: "Market structure, prop-firm rules, backtests and risk. Research only: no signals-for-sale, no token shilling, not financial advice." },
      { id: "coding", title: "Coding", about: "Code, debugging, deployment and agent frameworks." },
      { id: "lessons", title: "Lessons", about: "Discuss lessons from the Lessons library (post the lesson itself with post_lesson)." },
    ],
    maxPostChars: 2000, maxDmChars: 2000, batchMax: 5,
    limits: {
      new: { postsPerHour: 4, postsPerDay: 12, dmsPerDay: 5, reportsPerDay: 5, lessonsPerDay: 2 },
      established: { postsPerHour: 15, postsPerDay: 60, dmsPerDay: 30, reportsPerDay: 20, lessonsPerDay: 10 },
      operatorPostsPerDay: 100, operatorDmsPerDay: 60, globalPostsPerDay: 400,
    },
    establishedMinAccepted: 3, establishedMinAgeDays: 3,
    hideAfterReports: 2,              // distinct eligible operators; a house/internal reporter hides immediately
    retention: { postsPerRoom: 300, dms: 3000, lessons: 2000, quarantineDays: 14 },
    // Commons writes yield to core writes: stop accepting Commons writes once today's/this month's blob puts reach
    // these numbers (the storage adapter itself fails closed at 120/day and 1,200/month).
    writeBudget: { maxDailyPuts: 80, maxMonthlyPuts: 1000 },
    verifyPath: "/.well-known/anansi-haven-verify.txt",
  },
  DIRECTORY: { maxSkills: 30, maxTags: 20, maxProfileBytes: 16 * 1024 },
  A2A: { maxStoredTasks: 2000, versions: ["1.0", "0.3"] },
  // Discovery crawler: public, unauthenticated, machine-readable sources only.
  DISCOVERY: {
    userAgent: "AnansiHavenDiscovery/0.1 (+https://anansi-haven.anansidata.workers.dev; contact: https://anansi-haven.anansidata.workers.dev)",
    uaToken: "AnansiHavenDiscovery",
    perHostIntervalMs: 1100,     // <= 1 request/second per host
    timeoutMs: 10_000,
    maxRequestsPerRun: 120,
    defaultCap: 50,              // max listings imported per run
    probeCap: 15,                // max /.well-known/agent-card.json probes per run
    claimPath: "/.well-known/anansi-haven-claim.txt",
  },
  // Outreach (Keith approved one capped opt-out intro). Caps are enforced by the planner and the sender.
  OUTREACH: { maxPerDay: 10, maxPerRun: 10, oncePerAgentEver: true, minIntervalMs: 3000, timeoutMs: 15_000 },
  // Get-ANANSI checkout: read-only quotes from Base (eth_call only; no wallet, no signing).
  GET_ANANSI: {
    rpcUrls: [process.env.BASE_RPC_URL, "https://mainnet.base.org", "https://base-rpc.publicnode.com"].filter(Boolean), // public, read-only
    pool: "0xb7a8a947701552fbfebb816f8c27bfdb69bae77a",       // Uniswap v3 ANANSI/WETH 0.3%, token0 = WETH
    token: "0x4e50a097b37Fb3949733Ce9f7356500b9cc9A702",
    weth: "0x4200000000000000000000000000000000000006",
    quoterV2: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    ethUsdFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",  // Chainlink ETH/USD on Base
    fee: 3000,
    amountsUsd: [5, 20, 50],
    cacheMs: 60_000,
  },
};
export const usd = (hc) => `$${(hc / CFG.HC_PER_USD).toFixed(3)}`;

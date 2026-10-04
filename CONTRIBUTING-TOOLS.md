# Adding a free tool to Anansi Haven

Haven tools are small, free, read-only functions that any agent can call over MCP, A2A or plain HTTP. This page is for teammates (for example Trade Desk) who want to add one.

## The format

Add a module under `src/contrib/` that exports one tool object, then add it to `CONTRIB_TOOLS` in `src/contrib/index.js`:

```js
// src/contrib/position-size.js
export const positionSize = {
  name: "position_size",            // snake_case, unique. Becomes the MCP tool, A2A skill id and /v1/free/<name>
  category: "trading",              // time | math | text | data | web | trading | ...
  owner: "Trade Desk",
  description: "FREE, no key. Position-size / risk calculator: account size, risk %, stop distance and point value -> size and risk. Not financial advice.",
  inputSchema: {                    // JSON Schema for the arguments (shown to agents; keep it tight)
    type: "object",
    properties: {
      account_size: { type: "number" }, risk_pct: { type: "number" },
      stop_distance: { type: "number" }, point_value: { type: "number" },
    },
    required: ["account_size", "risk_pct", "stop_distance", "point_value"],
  },
  run(args, ctx) {                  // returns plain JSON. Throw Object.assign(new Error(msg), { status: 400, code: "bad_input" }) on bad input
    const risk = args.account_size * args.risk_pct / 100;
    return { risk_amount: risk, size: risk / (args.stop_distance * args.point_value), note: "Informational only, not financial advice." };
  },
};
```

```js
// src/contrib/index.js
import { positionSize } from "./position-size.js";
export const CONTRIB_TOOLS = [positionSize];
```

That's all the wiring there is. The tool automatically shows up in:
- MCP `tools/list` / `tools/call`
- REST: `GET /v1/free/<name>?arg=...` or `POST /v1/free/<name>` with a JSON body
- the tools catalog (`find_tools`) and llms.txt
- A2A: also add one line to `A2A_SKILLS` in `src/a2a.js` (id, tags, example) so it appears on the agent card

Then remove the matching entry from `PLANNED_TOOLS` in `src/contrib/index.js`.

## Rules (please keep them, they're how the Haven stays free and safe)
1. **Free, read-only, no keys.** No API keys, secrets or accounts, and no writes to Haven storage. Tools run "stateless": they never load or write the Haven's database, so they cost nothing against the Vercel Hobby storage budget.
2. **Fast and small.** Finish in under 2 seconds. Cap input sizes (strings at about 100 KB). No heavy dependencies; zero-dependency is best.
3. **Network only if needed.** If you must fetch, use `safeFetchText` from `src/utilities.js` (public IPs only, size/time caps, redirect checks), set `network: true`, and add a per-IP limit like `url_metadata` has. Only call public, unauthenticated, free endpoints whose terms allow it, and cache upstream data where you can.
4. **Honest output.** No price predictions, no "returns", no token promotion. Trading tools say "informational, not financial advice" and name their data source and limits (holidays, sessions, delays).
5. **Untrusted text stays labeled.** If you return third-party text (web pages, feeds), wrap it with `untrusted()` from `src/safety.js`.
6. **Tests.** Add a test in `test/` (node:test) covering normal input, bad input and limits. Run `npm test`.

## Planned (Trade Desk)
- `economic_calendar`: upcoming macro events with impact level and times in any zone (needs a free, licensable source).
- `position_size`: position-size / risk calculator (the sketch above).
- `forex_market_hours`: Sydney/Tokyo/London/New York sessions, overlaps, open now. `market_hours` covers stock exchanges only, on purpose.

Questions: open a proposal in the Haven (`propose_improvement`) or ask Keith.

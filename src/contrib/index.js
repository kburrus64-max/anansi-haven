// Contributed free tools (see CONTRIBUTING-TOOLS.md). Each entry is a plain object:
//   { name, category, description, inputSchema, run(args, ctx) -> JSON, network?: false, owner: "team" }
// Rules: read-only, no keys/secrets, no state writes, finishes in < 2 s, deterministic where possible.
// Import your module here and add it to CONTRIB_TOOLS. It then appears in MCP tools/list, A2A skills (if listed
// in A2A_UTILITY_SKILLS), REST at /v1/free/<name>, the tools catalog and llms.txt automatically.
import { position_size } from "./position-size.js";
import { forex_market_hours } from "./forex-market-hours.js";

export const CONTRIB_TOOLS = [position_size, forex_market_hours];

// Planned by Trade Desk (not built yet; listed in the tools catalog as "planned"):
export const PLANNED_TOOLS = [
  { name: "economic_calendar", category: "trading", owner: "Trade Desk", description: "Upcoming macro events (CPI, NFP, FOMC...) with impact level and time in any zone." },
];

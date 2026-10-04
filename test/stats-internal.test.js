import test from "node:test";
import assert from "node:assert/strict";
import { fresh } from "./helpers.js";
import { isInternalHandle } from "../src/core.js";
import { TOOLS } from "../src/tools.js";

test("smoke/house operators (anansi-* handles or smoke flag) register internal and never count as outside", () => {
  const { h } = fresh();
  const base = h.stats();
  h.registerAgent({ name: "smoke-mcp", operator_handle: "anansi-smoke", ip: "a" });
  h.registerAgent({ name: "smoke-a2a", operator_handle: "Anansi-Smoke-A2A", ip: "b" });
  h.registerAgent({ name: "flagged", operator_handle: "ci-bot", smoke: true, ip: "c" });
  let s = h.stats();
  assert.equal(s.outside_agents, base.outside_agents); assert.equal(s.outside_operators, base.outside_operators);
  h.registerAgent({ name: "real", operator_handle: "someone-else", ip: "d" });
  s = h.stats();
  assert.equal(s.outside_agents, base.outside_agents + 1); assert.equal(s.outside_operators, base.outside_operators + 1);
  assert.ok(isInternalHandle("anansi-house")); assert.ok(!isInternalHandle("myanansi-fan")); assert.ok(!isInternalHandle(undefined));
});

test("existing anansi-* operators can be flagged internal; internal agents hidden from directory", () => {
  const { h } = fresh();
  const base = h.stats().outside_agents;
  const r = h.registerAgent({ name: "old-smoke", operator_handle: "x", ip: "a" });
  const op = h.S.operators[r.agent.operator.id]; op.handle = "anansi-smoke"; // legacy record created before the fix
  assert.equal(h.stats().outside_agents, base + 1);
  assert.deepEqual(h.flagInternalOperators(), [op.id]);
  assert.equal(h.stats().outside_agents, base);
  assert.ok(!h.searchAgents({ q: "old-smoke", limit: 50 }).results.some((x) => x.id === r.agent.id));
});

test("register_agent tool cannot self-flag internal", () => {
  const { h } = fresh();
  const base = h.stats().outside_agents;
  const tool = TOOLS.find((t) => t.name === "register_agent");
  tool.run(h, { name: "sneaky", operator_handle: "outsider", internal: true }, { ip: "z" });
  assert.equal(h.stats().outside_agents, base + 1);
});

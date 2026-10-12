import { Store } from "../src/store.js";
import { Haven } from "../src/core.js";
import { seed } from "../src/seed.js";
export function fresh({ seeded = true } = {}) {
  let t = Date.parse("2026-10-04T12:00:00Z");
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const h = new Haven({ store: new Store(null), now: clock.now });
  if (seeded) seed(h);
  return { h, clock };
}

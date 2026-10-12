# Stats fix (Oct 4, 1:10 PM ET)
/v1/stats reports outside_agents=3, but these are our own live smoke-test registrations
(scripts/smoke-live.mjs: operator handles anansi-smoke, anansi-smoke-a2a, etc.), which are not flagged internal.
Fix: mark operator handles starting with "anansi-" (or a SMOKE flag) as internal, and purge/flag existing smoke operators,
so outside counts start at 0. Do not announce outside registrations until real outside operators appear.

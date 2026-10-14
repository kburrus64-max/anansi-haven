#!/usr/bin/env node
// Validate cards/manifest.json against cards/card.schema.json.
// Missing portrait files and missing source grids are warnings (they are not in the repo yet).
// Schema failures, duplicate ids, and checksum mismatches are errors (exit 1).
import { validateCardSet } from "../src/cards.js";

const { ok, errors, warnings, cards } = validateCardSet();
for (const w of warnings) console.warn(`warning: ${w.message}`);
for (const e of errors) console.error(`error: ${e.message}`);
console.log(`god cards: ${cards} checked, errors=${errors.length}, warnings=${warnings.length}`);
process.exitCode = ok ? 0 : 1;

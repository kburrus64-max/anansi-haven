// Read-only god-card catalog. Portrait bytes are not loaded here. No payments, ledger, wallet, or token writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import manifest from "../cards/manifest.json" with { type: "json" };
import cardSchema from "../cards/card.schema.json" with { type: "json" };
import { jsonValidate } from "./utilities.js";

export const CARD_MANIFEST = manifest;
export const CARD_SCHEMA = cardSchema;
export const EXPECTED_COUNTS = { orisha: 16, greek: 16 };

const repoRoot = () => fileURLToPath(new URL("..", import.meta.url));
const err = (status, code, message) => Object.assign(new Error(message), { status, code });

export function listGodCards({ pantheon, q } = {}) {
  if (pantheon != null && pantheon !== "" && pantheon !== "orisha" && pantheon !== "greek") {
    throw err(400, "bad_pantheon", "pantheon must be orisha or greek");
  }
  const query = String(q || "").trim().toLowerCase();
  let cards = manifest.cards;
  if (pantheon) cards = cards.filter((c) => c.pantheon === pantheon);
  if (query) cards = cards.filter((c) => `${c.id}\n${c.name}\n${c.domain}\n${c.lore}`.toLowerCase().includes(query));
  return {
    collection: manifest.collection,
    status: manifest.status,
    count: cards.length,
    total: manifest.cards.length,
    note: manifest.note,
    cards,
  };
}

export function getGodCard(id) {
  const card = manifest.cards.find((c) => c.id === String(id || ""));
  if (!card) throw err(404, "unknown_card", `unknown card ${id}`);
  return { collection: manifest.collection, status: manifest.status, card };
}

function insideRoot(root, rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel)) return null;
  const abs = path.resolve(root, rel);
  const base = path.resolve(root);
  const relOut = path.relative(base, abs);
  if (!relOut || relOut.startsWith("..") || path.isAbsolute(relOut)) return null;
  return abs;
}

export function validateCardSet({ doc = manifest, schema = cardSchema, root = repoRoot(), exists = fs.existsSync, readBytes = (p) => fs.readFileSync(p) } = {}) {
  const errors = [];
  const warnings = [];
  const error = (code, message, extra = {}) => errors.push({ level: "error", code, message, ...extra });
  const warn = (code, message, extra = {}) => warnings.push({ level: "warning", code, message, ...extra });

  if (!doc || typeof doc !== "object" || !Array.isArray(doc.cards)) {
    error("bad_manifest", "manifest must be an object with a cards array");
    return { ok: false, errors, warnings, cards: 0 };
  }
  if (doc.status !== "draft") error("bad_manifest", `manifest status must be draft (got ${JSON.stringify(doc.status)})`);
  if (doc.collection !== "anansi-haven-god-cards") error("bad_manifest", "manifest collection must be anansi-haven-god-cards");

  const seen = new Set();
  const cells = { orisha: new Set(), greek: new Set() };
  for (const card of doc.cards) {
    const id = card && typeof card === "object" ? card.id : undefined;
    const checked = jsonValidate({ schema, data: card });
    if (!checked.valid) {
      for (const e of checked.errors) error("schema", `${id || "(no id)"} ${e.path || "/"}: ${e.message}`, { id, path: e.path || "/" });
      continue;
    }
    if (seen.has(card.id)) error("duplicate_id", `duplicate id ${card.id}`, { id: card.id });
    seen.add(card.id);
    const slug = card.id.slice(card.pantheon.length + 1);
    const expectedPath = `cards/art/${card.pantheon}/${slug}.png`;
    if (card.art.path !== expectedPath) error("art_path", `${card.id}: art.path must be ${expectedPath}`, { id: card.id, path: card.art.path });
    if (cells[card.pantheon].has(card.art.cell)) error("duplicate_cell", `${card.id}: duplicate ${card.pantheon} cell ${card.art.cell}`, { id: card.id });
    cells[card.pantheon].add(card.art.cell);
    const roles = new Set(card.credits.map((c) => c.role));
    if (!roles.has("portrait") || !roles.has("lore")) error("credits", `${card.id}: credits need portrait and lore roles`, { id: card.id });

    const abs = insideRoot(root, card.art.path);
    if (!abs) {
      error("path_escape", `${card.id}: art path escapes the repo (${card.art.path})`, { id: card.id, path: card.art.path });
      continue;
    }
    if (!exists(abs)) {
      warn("missing_art", `${card.id}: art file missing (${card.art.path})`, { id: card.id, path: card.art.path });
    } else if (card.art.checksum == null) {
      error("checksum_required", `${card.id}: art file is present but checksum is null (${card.art.path})`, { id: card.id, path: card.art.path });
    } else {
      const digest = crypto.createHash("sha256").update(readBytes(abs)).digest("hex");
      if (digest !== card.art.checksum) error("checksum_mismatch", `${card.id}: checksum mismatch for ${card.art.path}`, { id: card.id, path: card.art.path, expected: card.art.checksum, actual: digest });
    }
  }

  for (const pantheon of ["orisha", "greek"]) {
    const n = doc.cards.filter((c) => c && c.pantheon === pantheon).length;
    if (n !== EXPECTED_COUNTS[pantheon]) error("count", `expected ${EXPECTED_COUNTS[pantheon]} ${pantheon} cards, found ${n}`);
    for (let i = 0; i < EXPECTED_COUNTS[pantheon]; i++) if (!cells[pantheon].has(i)) error("missing_cell", `${pantheon} grid is missing cell ${i}`);
  }

  const grids = [...new Set(doc.cards.filter((c) => c && c.art && typeof c.art.grid === "string").map((c) => c.art.grid))];
  for (const rel of grids) {
    const abs = insideRoot(root, rel);
    if (!abs) error("path_escape", `source grid path escapes the repo (${rel})`, { path: rel });
    else if (!exists(abs)) warn("missing_source_grid", `source grid missing (${rel})`, { path: rel });
  }
  if (Array.isArray(doc.sources)) {
    for (const src of doc.sources) {
      if (!src || typeof src.path !== "string") error("bad_manifest", "each source needs a path");
      else if (!grids.includes(src.path)) error("bad_manifest", `source path is not used by any card (${src.path})`, { path: src.path });
    }
  }

  return { ok: errors.length === 0, errors, warnings, cards: doc.cards.length };
}

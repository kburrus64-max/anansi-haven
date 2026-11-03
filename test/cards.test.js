// God-card catalog: schema, caption lock, unique ids, missing-art warnings, read-only HTTP + MCP.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createApp } from "../src/app.js";
import { fresh } from "./helpers.js";
import { callTool, TOOLS } from "../src/tools.js";
import { isStateless } from "../src/serverless.js";
import { CARD_MANIFEST, CARD_SCHEMA, listGodCards, getGodCard, validateCardSet } from "../src/cards.js";

const cp = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join(" ");
const byId = (id) => CARD_MANIFEST.cards.find((c) => c.id === id);

// Names and domains transcribed from Keith's 2026-10-14 Orisha grid (row-major).
const ORISHA = [
  ["orisha.olorun", "OLORUN", "SUPREME CREATOR", "4f 4c 4f 52 55 4e"],
  ["orisha.obatala", "OBATALÁ", "PURITY & CREATION", "4f 42 41 54 41 4c c1"],
  ["orisha.osun", "Ọ̀ṢUN", "LOVE & RIVERS", "1ecc 300 1e62 55 4e"],
  ["orisha.sango", "ṢÀNGÓ", "THUNDER & JUSTICE", "1e62 c0 4e 47 d3"],
  ["orisha.yemoja", "YEMOJA", "OCEANS & MOTHERHOOD", "59 45 4d 4f 4a 41"],
  ["orisha.ogun", "ÒGÚN", "IRON & WAR", "d2 47 da 4e"],
  ["orisha.eshu", "ÈṢÙ", "CROSSROADS & TRICKSTER", "c8 1e62 d9"],
  ["orisha.oshoosi", "ÒṢÓÒSÌ", "HUNTS & WILDERNESS", "d2 1e62 d3 d2 53 cc"],
  ["orisha.orunmila", "Ọ̀RÚNMÌLÀ", "DIVINATION & WISDOM", "1ecc 300 52 da 4e 4d cc 4c c0"],
  ["orisha.nana_buruku", "NANA BÚRÙKÚ", "EARTH & FERTILITY", "4e 41 4e 41 20 42 da 52 d9 4b da"],
  ["orisha.oshunshan", "Ọ̀ṢUNṢÀN", "SWEET WATERS & HEALING", "1ecc 300 1e62 55 4e 1e62 c0 4e"],
  ["orisha.shopona", "ṢỌ̀PỌ̀NÁ", "SMALLPOX & DISEASE", "1e62 1ecc 300 50 1ecc 300 4e c1"],
  ["orisha.aganju", "AGANJÚ", "DEATH & ANCESTORS", "41 47 41 4e 4a da"],
  ["orisha.oya", "OYA", "WINDS & TRANSFORMATION", "4f 59 41"],
  ["orisha.orishanniyan", "ÒRÌṢÀNNIYÀN", "THE SKY & BURIAL", "d2 52 cc 1e62 c0 4e 4e 49 59 c0 4e"],
  ["orisha.aje", "AJÉ", "WEALTH & MARKETS", "41 4a c9"],
];

// Greek grid captions are the names only, same row-major order. Domains are conventional epithets.
const GREEK = [
  ["greek.zeus", "ZEUS", "SKY, THUNDER & KINGSHIP"],
  ["greek.hera", "HERA", "MARRIAGE & SOVEREIGNTY"],
  ["greek.poseidon", "POSEIDON", "SEA & EARTHQUAKES"],
  ["greek.demeter", "DEMETER", "GRAIN & HARVEST"],
  ["greek.dionysus", "DIONYSUS", "WINE & ECSTASY"],
  ["greek.athena", "ATHENA", "WISDOM & STRATEGY"],
  ["greek.ares", "ARES", "WAR & COURAGE"],
  ["greek.apollo", "APOLLO", "LIGHT, MUSIC & PROPHECY"],
  ["greek.artemis", "ARTEMIS", "HUNT & THE WILD"],
  ["greek.aphrodite", "APHRODITE", "LOVE & BEAUTY"],
  ["greek.hephaestus", "HEPHAESTUS", "FORGE & FIRE"],
  ["greek.hermes", "HERMES", "MESSAGES, TRAVEL & BOUNDARIES"],
  ["greek.hades", "HADES", "THE UNDERWORLD"],
  ["greek.persephone", "PERSEPHONE", "SPRING & THE UNDERWORLD"],
  ["greek.hestia", "HESTIA", "HEARTH & HOME"],
  ["greek.hebe", "HEBE", "YOUTH"],
];

test("manifest matches the captioned names and domains, with draft lore", () => {
  assert.equal(CARD_MANIFEST.status, "draft");
  assert.equal(CARD_MANIFEST.cards.length, 32);
  const orisha = CARD_MANIFEST.cards.filter((c) => c.pantheon === "orisha");
  const greek = CARD_MANIFEST.cards.filter((c) => c.pantheon === "greek");
  assert.equal(orisha.length, 16);
  assert.equal(greek.length, 16);
  assert.deepEqual(orisha.map((c) => [c.id, c.name, c.domain]), ORISHA.map(([id, name, domain]) => [id, name, domain]));
  assert.deepEqual(greek.map((c) => [c.id, c.name, c.domain]), GREEK);
  for (const [id, name, , codes] of ORISHA) {
    assert.equal(cp(byId(id).name), codes, id);
    assert.equal(name, byId(id).name);
  }
  const ids = CARD_MANIFEST.cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const card of CARD_MANIFEST.cards) {
    assert.equal(card.lore_status, "draft");
    assert.match(card.lore, /^Draft\. /);
    assert.equal(card.credits.find((c) => c.role === "portrait").name, "Keith");
    assert.equal(card.art.checksum, null);
    assert.equal(card.art.algorithm, "sha256");
    if (card.pantheon === "orisha") assert.equal(card.domain_source, "caption");
    if (card.pantheon === "greek") assert.equal(card.domain_source, "conventional");
  }
  assert.equal(CARD_SCHEMA.required.includes("lore_status"), true);
  assert.equal(CARD_SCHEMA.properties.lore_status.const, "draft");
});

test("validator: schema and unique ids pass; missing art and source grids are warnings", () => {
  const report = validateCardSet();
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
  const missing = report.warnings.filter((w) => w.code === "missing_art");
  assert.equal(missing.length, 32);
  assert.deepEqual(missing.map((w) => w.path).sort(), CARD_MANIFEST.cards.map((c) => c.art.path).sort());
  const grids = report.warnings.filter((w) => w.code === "missing_source_grid").map((w) => w.path).sort();
  assert.deepEqual(grids, [
    "shared/haven-cards-art/from-keith-20261014/greek_grid_16.png",
    "shared/haven-cards-art/from-keith-20261014/orisha_grid_16.png",
  ]);
});

test("validator rejects duplicate ids, schema gaps, and bad checksums; a matching file clears that warning", () => {
  const dup = structuredClone(CARD_MANIFEST);
  dup.cards[1].id = dup.cards[0].id;
  dup.cards[1].art.path = dup.cards[0].art.path;
  const dupReport = validateCardSet({ doc: dup, exists: () => false });
  assert.equal(dupReport.ok, false);
  assert.ok(dupReport.errors.some((e) => e.code === "duplicate_id" && e.id === "orisha.olorun"));

  const broken = structuredClone(CARD_MANIFEST);
  delete broken.cards[3].name;
  broken.cards[4].lore_status = "final";
  broken.cards[5].rarity = "common";
  const brokenReport = validateCardSet({ doc: broken, exists: () => false });
  assert.equal(brokenReport.ok, false);
  assert.ok(brokenReport.errors.some((e) => e.code === "schema" && e.id === "orisha.sango"));
  assert.ok(brokenReport.errors.some((e) => e.code === "schema" && e.id === "orisha.yemoja"));
  assert.ok(brokenReport.errors.some((e) => e.code === "schema" && e.id === "orisha.ogun"));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haven-cards-"));
  try {
    const rel = "cards/art/greek/hebe.png";
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    const bytes = Buffer.from("hebe-portrait");
    fs.writeFileSync(path.join(dir, rel), bytes);
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const present = structuredClone(CARD_MANIFEST);
    const hebe = present.cards.find((c) => c.id === "greek.hebe");
    hebe.art.checksum = digest;
    const good = validateCardSet({ doc: present, root: dir });
    assert.equal(good.ok, true, good.errors.map((e) => e.message).join("; "));
    assert.ok(!good.warnings.some((w) => w.id === "greek.hebe"));
    assert.equal(good.warnings.filter((w) => w.code === "missing_art").length, 31);

    hebe.art.checksum = "a".repeat(64);
    const bad = validateCardSet({ doc: present, root: dir });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => e.code === "checksum_mismatch" && e.id === "greek.hebe"));

    hebe.art.checksum = null;
    const naked = validateCardSet({ doc: present, root: dir });
    assert.equal(naked.ok, false);
    assert.ok(naked.errors.some((e) => e.code === "checksum_required" && e.id === "greek.hebe"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validate-cards script exits 0 and reports missing art as warnings", () => {
  const r = spawnSync(process.execPath, ["scripts/validate-cards.mjs"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /errors=0/);
  assert.match(r.stdout, /warnings=34/);
  assert.match(r.stderr, /orisha\.olorun: art file missing/);
  assert.match(r.stderr, /source grid missing/);
  assert.equal(r.stdout.includes("error:"), false);
});

test("list and get are read-only over HTTP and MCP, and stay off the storage path", async () => {
  const listed = listGodCards({ pantheon: "orisha" });
  assert.equal(listed.count, 16);
  assert.equal(listed.cards.every((c) => c.pantheon === "orisha"), true);
  assert.equal(listGodCards({ q: "sweet waters" }).cards[0].id, "orisha.oshunshan");
  assert.equal(getGodCard("greek.hestia").card.domain, "HEARTH & HOME");
  assert.throws(() => getGodCard("greek.nobody"), (e) => e.status === 404 && e.code === "unknown_card");
  assert.throws(() => listGodCards({ pantheon: "norse" }), (e) => e.status === 400 && e.code === "bad_pantheon");

  const tool = TOOLS.find((t) => t.name === "list_god_cards");
  assert.equal(tool.readOnly, true);
  assert.equal(tool.stateless, true);
  assert.equal(tool.auth, false);
  const { h } = fresh();
  const viaTool = await callTool(h, "list_god_cards", {});
  assert.equal(viaTool.count, 32);
  assert.equal(viaTool.status, "draft");
  assert.equal((await callTool(h, "list_god_cards", { id: "orisha.shopona" })).card.domain, "SMALLPOX & DISEASE");
  assert.ok(h.findTools({ q: "orisha god cards" }, "https://h").results.some((e) => e.name === "list_god_cards" && e.needs_key === false));

  assert.equal(isStateless("GET", "/v1/cards"), true);
  assert.equal(isStateless("GET", "/v1/cards?pantheon=greek"), true);
  assert.equal(isStateless("GET", "/v1/cards/orisha.olorun"), true);
  assert.equal(isStateless("POST", "/mcp", Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_god_cards", arguments: { pantheon: "greek" } } }))), true);

  const srv = createApp(h);
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const all = await fetch(`${base}/v1/cards`);
    const body = await all.json();
    assert.equal(all.status, 200);
    assert.equal(body.count, 32);
    assert.equal(body.cards[0].id, "orisha.olorun");
    assert.equal(body.cards[0].name, "OLORUN");
    const one = await fetch(`${base}/v1/cards/greek.hebe`);
    assert.equal((await one.json()).card.domain, "YOUTH");
    const filtered = await fetch(`${base}/v1/cards?pantheon=greek&q=hearth`);
    assert.deepEqual((await filtered.json()).cards.map((c) => c.id), ["greek.hestia"]);
    const missing = await fetch(`${base}/v1/cards/orisha.missing`);
    assert.equal(missing.status, 404);
    const bad = await fetch(`${base}/v1/cards?pantheon=norse`);
    assert.equal(bad.status, 400);
  } finally {
    srv.close();
  }
});

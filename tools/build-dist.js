#!/usr/bin/env node
/**
 * tools/build-dist.js
 *
 * Builds the `dist/` folder: a self-contained copy of the simulator that
 * students can download, unzip, and open by double-clicking index.html.
 * No npm install, no server, no network — everything needed is copied in.
 *
 * What goes into dist/:
 *   index.html          — the app shell
 *   vendor/sql-asm.js   — SQLite compiled to plain JS (no WASM fetch)
 *   vendor/sql.js-LICENSE
 *   src/*.js            — app modules (loaded via ordered <script> tags)
 *
 * What does NOT go in (teacher-only):
 *   data/               — seed sources (the DB ships embedded in
 *                         src/pokemon-seed.js)
 *   tests/, tools/      — development files
 *   node_modules/       — not needed at runtime (sql-asm.js is vendored)
 *
 * Usage:
 *   node tools/build-dist.js            # build dist/
 *   node tools/build-dist.js --check    # verify dist/ is up to date (CI)
 *
 * Exit codes: 0 ok · 1 build/verify failure
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/** Files/dirs copied into dist, relative to repo root. */
const MANIFEST = [
  "index.html",
  "vendor/sql-asm.js",
  "vendor/sql.js-LICENSE",
  "src/sql-engine.js",
  "src/result-compare.js",
  "src/exercise-banks/u1-consultas-basicas.js",
  "src/exercise-banks/u2-joins.js",
  "src/exercise-banks/u3-subconsultas.js",
  "src/exercises.js",
  "src/progress-store.js",
  "src/export-package.js",
  "src/pokemon-seed.js",
  "src/schema-reference.js",
  "src/app.js",
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function preflight() {
  const missing = MANIFEST.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  if (missing.length > 0) {
    console.error("build-dist: missing source files:\n  " + missing.join("\n  "));
    process.exit(1);
  }
}

function build() {
  preflight();
  fs.rmSync(DIST, { recursive: true, force: true });
  for (const rel of MANIFEST) {
    const from = path.join(ROOT, rel);
    const to = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  // Marker so a teacher can tell at a glance which build students have.
  const stamp = {
    builtAt: new Date().toISOString(),
    files: Object.fromEntries(MANIFEST.map((rel) => [rel, sha256(path.join(ROOT, rel))])),
  };
  fs.writeFileSync(path.join(DIST, "BUILD.json"), JSON.stringify(stamp, null, 2) + "\n");
  console.log("build-dist: dist/ built with " + MANIFEST.length + " files.");
}

function check() {
  preflight();
  let stale = false;
  for (const rel of MANIFEST) {
    const distFile = path.join(DIST, rel);
    if (!fs.existsSync(distFile)) {
      console.error("build-dist --check: dist/" + rel + " is missing.");
      stale = true;
      continue;
    }
    if (sha256(distFile) !== sha256(path.join(ROOT, rel))) {
      console.error("build-dist --check: dist/" + rel + " is out of date.");
      stale = true;
    }
  }
  if (stale) {
    console.error("build-dist --check: run `npm run build-dist` and commit the result.");
    process.exit(1);
  }
  console.log("build-dist --check: dist/ is up to date.");
}

if (process.argv.includes("--check")) {
  check();
} else {
  build();
}

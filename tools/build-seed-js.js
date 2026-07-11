#!/usr/bin/env node

/**
 * build-seed-js.js
 *
 * Reads the canonical seed database data/pokemon.sqlite and writes a static
 * script src/pokemon-seed.js that exposes the same bytes on
 * `window.POKEMON_SEED` as a Uint8Array. The generated file is checked in so
 * the simulator can boot from a plain double-click of index.html under
 * file:// without any XHR/fetch to data/pokemon.sqlite.
 *
 * Regenerate whenever data/pokemon.sqlite changes:
 *   node tools/build-seed-js.js
 *   npm run build-seed-js
 *
 * The generated file:
 *   - is plain JavaScript (no ES modules, no async imports) so it loads
 *     via a regular <script src="src/pokemon-seed.js"></script> tag and
 *     works under file://;
 *   - is a self-contained IIFE that sets window.POKEMON_SEED exactly once;
 *   - decodes the embedded base64 payload with atob() (browser) or
 *     Buffer (Node), whichever is available.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Resolve paths relative to the project root (parent of tools/)
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data", "pokemon.sqlite");
const OUTPUT = path.join(ROOT, "src", "pokemon-seed.js");

// ---------------------------------------------------------------------------
// Build the generated source for src/pokemon-seed.js
// ---------------------------------------------------------------------------

/**
 * Build the generated source. `base64Payload` is the base64 of the raw
 * seed bytes. The script is plain JavaScript (no modules, no imports)
 * so it works under file:// and through any browser.
 */
function buildSeedSource(base64Payload) {
  // base64 chars are A-Z, a-z, 0-9, +, /, = — none are special inside a
  // JavaScript template literal, but the payload can be very large, so we
  // concatenate via a single string for clarity. The IIFE pattern matches
  // the other src/*.js modules: a single global, no global pollution.
  return [
    "/**",
    " * pokemon-seed.js",
    " *",
    " * Embedded seed database (data/pokemon.sqlite) exposed on window so the",
    " * simulator can boot from a plain double-click of index.html under file://",
    " * without any XHR/fetch to data/pokemon.sqlite.",
    " *",
    " * Source of truth: data/pokemon.sqlite",
    " * Regenerate this file whenever data/pokemon.sqlite changes:",
    " *   npm run build-seed-js   (runs tools/build-seed-js.js)",
    " *",
    " * This file is GENERATED. Do not edit by hand — your changes will be",
    " * lost on the next regeneration.",
    " */",
    "(function () {",
    '  "use strict";',
    "",
    "  if (typeof window === \"undefined\") return;",
    "",
    "  // The base64 of data/pokemon.sqlite, captured at generation time.",
    "  var _b64 = \"" + base64Payload + "\";",
    "",
    "  /**",
    "   * Decode a base64 string into a Uint8Array. Works in both browsers",
    "   * (atob) and Node (Buffer) so the same source runs in tests and in",
    "   * the browser. Errors are surfaced to the console and window.POKEMON_SEED",
    "   * is left as null so callers can fall back to a different strategy.",
    "   */",
    "  function _decodeBase64ToBytes(b64) {",
    "    var binary;",
    "    if (typeof atob === \"function\") {",
    "      binary = atob(b64);",
    "    } else if (typeof Buffer !== \"undefined\") {",
    "      binary = Buffer.from(b64, \"base64\").toString(\"binary\");",
    "    } else {",
    "      throw new Error(\"No base64 decoder available\");",
    "    }",
    "    var len = binary.length;",
    "    var bytes = new Uint8Array(len);",
    "    for (var i = 0; i < len; i++) {",
    "      bytes[i] = binary.charCodeAt(i) & 0xFF;",
    "    }",
    "    return bytes;",
    "  }",
    "",
    "  try {",
    "    window.POKEMON_SEED = _decodeBase64ToBytes(_b64);",
    "  } catch (e) {",
    "    if (typeof console !== \"undefined\" && console.error) {",
    "      console.error(\"pokemon-seed.js: failed to decode embedded seed:\", e);",
    "    }",
    "    window.POKEMON_SEED = null;",
    "  }",
    "})();",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

/**
 * Write buffer atomically: write to a temp file in the same directory,
 * then rename.  Avoids truncated/corrupt files if the process is interrupted
 * mid-write.
 */
function atomicWriteSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(dir, "." + path.basename(targetPath) + ".tmp." + process.pid);
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, targetPath);
  } catch (e) {
    // Clean up temp file if it was created but rename failed.
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse process.argv. Flags:
 *   --check   exit 0 if src/pokemon-seed.js is up to date with the source
 *              data/pokemon.sqlite (same base64 content), exit 1 otherwise.
 *              Used by tests to catch drift between source and embedded seed.
 *   --help    print usage and exit
 */
function parseArgs(argv) {
  const errors = [];
  let check = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg.startsWith("-")) {
      errors.push(`Unknown flag: ${arg}`);
    }
  }
  return { check, help, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { check, help, errors } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(
      "Usage: node tools/build-seed-js.js [--check] [--help]\n" +
      "\n" +
      "  --check   Exit 0 if src/pokemon-seed.js matches the current\n" +
      "            data/pokemon.sqlite, exit 1 otherwise. Used by tests.\n" +
      "  --help    Show this message.\n"
    );
    process.exit(0);
  }

  if (errors.length > 0) {
    for (const e of errors) console.error("Error:", e);
    process.exit(1);
  }

  if (!fs.existsSync(INPUT)) {
    console.error(
      "Error: source seed not found at " + INPUT + ".\n" +
      "Build it with: npm run build-seed (runs tools/convert-pokemon-sql.js --output data/pokemon.sqlite)"
    );
    process.exit(1);
  }

  const seedBytes = fs.readFileSync(INPUT);
  const base64Payload = seedBytes.toString("base64");
  const source = buildSeedSource(base64Payload);

  if (check) {
    if (!fs.existsSync(OUTPUT)) {
      console.error("FAIL: " + OUTPUT + " does not exist. Run `npm run build-seed-js` to generate it.");
      process.exit(1);
    }
    const existing = fs.readFileSync(OUTPUT, "utf-8");
    if (existing !== source) {
      console.error(
        "FAIL: " + OUTPUT + " is out of sync with " + INPUT + ".\n" +
        "Run `npm run build-seed-js` to regenerate it."
      );
      process.exit(1);
    }
    process.exit(0);
  }

  atomicWriteSync(OUTPUT, source);
  console.error(
    "Written: " + OUTPUT + " (source " + seedBytes.length + " bytes → " +
    source.length + " char source, base64 " + base64Payload.length + " chars)"
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSeedSource,
  parseArgs,
};

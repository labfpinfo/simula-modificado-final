/**
 * Deterministic unit tests for tools/build-seed-js.js.
 *
 * Covers:
 *   - parseArgs (--check, --help, unknown flag)
 *   - buildSeedSource (output structure, embedded base64, self-decoding)
 *   - end-to-end: the generated src/pokemon-seed.js loads in a sandbox
 *     and exposes window.POKEMON_SEED as a Uint8Array whose bytes match
 *     data/pokemon.sqlite exactly.
 *
 * Uses Node built-in test runner (node:test + node:assert).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SQLITE_PATH = path.join(ROOT, "data", "pokemon.sqlite");
const GENERATED_PATH = path.join(ROOT, "src", "pokemon-seed.js");

const { buildSeedSource, parseArgs } = require("./build-seed-js");

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns check=false, help=false, no errors with empty args", () => {
    const r = parseArgs([]);
    assert.strictEqual(r.check, false);
    assert.strictEqual(r.help, false);
    assert.deepStrictEqual(r.errors, []);
  });

  it("parses --check flag", () => {
    const r = parseArgs(["--check"]);
    assert.strictEqual(r.check, true);
    assert.strictEqual(r.help, false);
  });

  it("parses --help and -h flags", () => {
    assert.strictEqual(parseArgs(["--help"]).help, true);
    assert.strictEqual(parseArgs(["-h"]).help, true);
  });

  it("reports error for unknown flag", () => {
    const r = parseArgs(["--bogus"]);
    assert.strictEqual(r.errors.length, 1);
    assert.ok(r.errors[0].includes("Unknown flag"));
  });
});

// ---------------------------------------------------------------------------
// buildSeedSource
// ---------------------------------------------------------------------------

describe("buildSeedSource", () => {
  const sampleB64 = Buffer.from("hello-world-payload").toString("base64");

  it("embeds the base64 payload verbatim", () => {
    const src = buildSeedSource(sampleB64);
    assert.ok(src.includes('var _b64 = "' + sampleB64 + '";'),
      "generated source should embed the base64 payload as a string literal");
  });

  it("exposes window.POKEMON_SEED", () => {
    const src = buildSeedSource(sampleB64);
    assert.ok(/window\.POKEMON_SEED\s*=/.test(src),
      "generated source should set window.POKEMON_SEED");
  });

  it("decodes the embedded base64 to a Uint8Array", () => {
    const src = buildSeedSource(sampleB64);
    // Execute in a sandbox that provides atob.  We expose Node's
    // globalThis so Uint8Array is available inside the vm context, and
    // capture a reference to it for the instanceof check.
    const sandbox = {
      atob: (b) => Buffer.from(b, "base64").toString("binary"),
      console: { error: function () {} },
      Uint8Array: Uint8Array,
    };
    sandbox.window = {};
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const seed = sandbox.window.POKEMON_SEED;
    assert.ok(seed instanceof Uint8Array,
      "window.POKEMON_SEED should be a Uint8Array, got: " +
      Object.prototype.toString.call(seed));
    const expected = Array.from(Buffer.from("hello-world-payload"));
    const actual = Array.from(seed);
    assert.deepStrictEqual(actual, expected,
      "window.POKEMON_SEED bytes should match the source payload");
  });

  it("sets window.POKEMON_SEED to null on decode failure", () => {
    const src = buildSeedSource(sampleB64);
    const sandbox = {
      window: {},
      // No atob, no Buffer → decodeBase64ToBytes throws
      console: { error: function () { sandbox._consoleErr = true; } },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    assert.strictEqual(sandbox.window.POKEMON_SEED, null,
      "window.POKEMON_SEED should be null when decoding fails");
  });

  it("guards against non-window environments (e.g. Node without window)", () => {
    // This is a pure-IIFE no-throw when window is undefined; the generator
    // produces code that should not crash in such a context.
    const src = buildSeedSource(sampleB64);
    const sandbox = {
      // No window at all
      console: { error: function () {} },
    };
    // Node's vm honours `typeof window === "undefined"` in user code, so
    // the early return path is taken and no POKEMON_SEED is set.
    vm.createContext(sandbox);
    assert.doesNotThrow(function () { vm.runInContext(src, sandbox); });
  });

  it("starts with a header comment marking it as generated", () => {
    const src = buildSeedSource(sampleB64);
    assert.ok(src.startsWith("/**\n * pokemon-seed.js"),
      "generated source should start with the pokemon-seed.js header");
    assert.ok(src.includes("GENERATED"),
      "header should warn readers the file is generated");
  });
});

// ---------------------------------------------------------------------------
// end-to-end: buildSeedSource(data/pokemon.sqlite) → executable
// src/pokemon-seed.js whose window.POKEMON_SEED is byte-identical to the
// source. Catches drift between the generator and the data file.
// ---------------------------------------------------------------------------

describe("end-to-end — generated seed is byte-identical to data/pokemon.sqlite", () => {
  it("generated window.POKEMON_SEED matches data/pokemon.sqlite bytes", () => {
    assert.ok(fs.existsSync(SQLITE_PATH),
      "data/pokemon.sqlite should exist as the source of truth");
    const sqliteBytes = fs.readFileSync(SQLITE_PATH);
    const b64 = sqliteBytes.toString("base64");
    const src = buildSeedSource(b64);

    const sandbox = {
      window: {},
      atob: (b) => Buffer.from(b, "base64").toString("binary"),
      console: { error: function () {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const generated = sandbox.window.POKEMON_SEED;
    assert.ok(generated, "window.POKEMON_SEED should be set");
    assert.strictEqual(generated.length, sqliteBytes.length,
      "embedded seed length should match data/pokemon.sqlite length");
    for (let i = 0; i < sqliteBytes.length; i++) {
      assert.strictEqual(generated[i], sqliteBytes[i],
        "byte mismatch at offset " + i);
    }
  });

  it("checked-in src/pokemon-seed.js is up to date with data/pokemon.sqlite", () => {
    // If the generated file is checked in and the source changed,
    // this test should fail to remind the author to run build-seed-js.
    assert.ok(fs.existsSync(GENERATED_PATH),
      "src/pokemon-seed.js should exist (run `npm run build-seed-js`)");
    const generated = fs.readFileSync(GENERATED_PATH, "utf-8");
    const sqliteBytes = fs.readFileSync(SQLITE_PATH);
    const expectedB64 = sqliteBytes.toString("base64");
    assert.ok(generated.includes('var _b64 = "' + expectedB64 + '";'),
      "checked-in src/pokemon-seed.js is out of sync with data/pokemon.sqlite — " +
      "run `npm run build-seed-js` to regenerate it");
  });
});

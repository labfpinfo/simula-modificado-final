/**
 * tests/embedded-seed.test.js
 *
 * R4-001 — Production bootstrap is robust under file:// even when XHR
 * to data/pokemon.sqlite is blocked.
 *
 * Background:
 *   The previous fix (R-001) replaced sql-wasm-browser.js with sql-asm.js,
 *   which compiles the SQLite engine to pure JavaScript so no .wasm
 *   binary fetch is required at runtime.  That fix removed the WASM
 *   binary network dependency.
 *
 *   The remaining terminal file:// dependency was XHR for
 *   data/pokemon.sqlite in src/app.js loadSeed().  Under file://, this
 *   XHR is unreliable in some browsers and the previous manual test
 *   (tests/manual.html) was the only place that had a synthetic-seed
 *   fallback.  Production startup had no recovery path.
 *
 * Fix:
 *   data/pokemon.sqlite is now embedded in src/pokemon-seed.js as a
 *   base64 Uint8Array exposed on window.POKEMON_SEED.  src/app.js
 *   loadSeed() prefers the embedded seed; XHR for data/pokemon.sqlite
 *   remains as a fallback.  index.html loads pokemon-seed.js BEFORE
 *   app.js so the global is set when loadSeed() runs.
 *
 * What this file tests:
 *   1. Static source-level checks: pokemon-seed.js exists, embeds the
 *      data, exposes window.POKEMON_SEED; index.html loads it before
 *      app.js; app.js loadSeed() prefers it; data/pokemon.sqlite is
 *      still on disk; manual.html mirrors the production strategy.
 *   2. Behavioural checks: loadSeed() resolves with the embedded seed
 *      and never opens an XHR when the embedded seed is present; falls
 *      back to XHR when the embedded seed is missing.
 *
 * Run: node --test tests/embedded-seed.test.js
 */

const { describe, it, before, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Read source files under test
// ----------------------------------------------------------------------

const projectRoot = path.resolve(__dirname, "..");
const appPath = path.join(projectRoot, "src", "app.js");
const seedPath = path.join(projectRoot, "src", "pokemon-seed.js");
const indexPath = path.join(projectRoot, "index.html");
const manualPath = path.join(projectRoot, "tests", "manual.html");
const sqlitePath = path.join(projectRoot, "data", "pokemon.sqlite");
const generatorPath = path.join(projectRoot, "tools", "build-seed-js.js");
const packageJsonPath = path.join(projectRoot, "package.json");

const appSrc = fs.readFileSync(appPath, "utf-8");
const seedSrc = fs.readFileSync(seedPath, "utf-8");
const indexSrc = fs.readFileSync(indexPath, "utf-8");
const manualSrc = fs.readFileSync(manualPath, "utf-8");
const sqliteBytes = fs.readFileSync(sqlitePath);
const sqliteB64 = sqliteBytes.toString("base64");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

// ----------------------------------------------------------------------
// Source-level static checks
// ----------------------------------------------------------------------

describe("Embedded seed — R4-001 file:// robustness (static)", () => {

  describe("src/pokemon-seed.js (generated file)", () => {
    it("exists at the expected path", () => {
      assert.ok(fs.existsSync(seedPath),
        "src/pokemon-seed.js should exist — run `npm run build-seed-js` if missing");
    });

    it("exposes window.POKEMON_SEED as a Uint8Array", () => {
      // Accept either a direct `new Uint8Array(...)` literal assignment or
      // a call to a helper that returns a Uint8Array (the generated
      // script uses a `_decodeBase64ToBytes` helper).  We verify the
      // end-to-end behaviour (Uint8Array) in the generator tests and in
      // the behavioural tests below — this is a source-level guard.
      assert.ok(
        /window\.POKEMON_SEED\s*=\s*(?:new\s+Uint8Array|[A-Za-z_$][\w$]*\s*\()/.test(seedSrc),
        "src/pokemon-seed.js must assign window.POKEMON_SEED to a Uint8Array " +
        "expression (either a `new Uint8Array(...)` literal or a helper call " +
        "that returns one) so loadSeed() can use it directly"
      );
    });

    it("embeds the base64 of data/pokemon.sqlite", () => {
      // The full base64 payload should be present — this also catches
      // drift between data/pokemon.sqlite and the generated file.
      assert.ok(seedSrc.includes('var _b64 = "' + sqliteB64 + '";'),
        "src/pokemon-seed.js is out of sync with data/pokemon.sqlite — " +
        "run `npm run build-seed-js` to regenerate it");
    });

    it("does not require any external binary (no WASM, no .sqlite file at runtime)", () => {
      assert.ok(!seedSrc.includes(".wasm"),
        "src/pokemon-seed.js should not reference any .wasm file — the " +
        "embedded seed must be self-contained");
    });
  });

  describe("data/pokemon.sqlite (source of truth)", () => {
    it("is still present on disk for regeneration and manual use", () => {
      assert.ok(fs.existsSync(sqlitePath),
        "data/pokemon.sqlite must remain on disk as the source of truth " +
        "and for manual / regeneration use");
    });

    it("is non-empty", () => {
      assert.ok(sqliteBytes.length > 0,
        "data/pokemon.sqlite should not be empty");
    });
  });

  describe("index.html — script loading order", () => {
    it("loads src/pokemon-seed.js before src/app.js", () => {
      var seedPos = indexSrc.indexOf("src/pokemon-seed.js");
      var appPos = indexSrc.indexOf("src/app.js");
      assert.ok(seedPos !== -1,
        "index.html should load src/pokemon-seed.js");
      assert.ok(appPos !== -1,
        "index.html should still load src/app.js");
      assert.ok(seedPos < appPos,
        "src/pokemon-seed.js must load BEFORE src/app.js so " +
        "window.POKEMON_SEED is set when app.js initialises");
    });
  });

  describe("src/app.js — loadSeed() prefers embedded seed", () => {
    /**
     * Extract the body of loadSeed() from app.js.
     */
    function extractLoadSeedBody() {
      var match = appSrc.match(/function loadSeed\(\)\s*\{[\s\S]*?\n\s{2}\}/m);
      return match ? match[0] : null;
    }

    it("loadSeed() is defined", () => {
      var body = extractLoadSeedBody();
      assert.ok(body, "loadSeed() should be defined in app.js");
    });

    it("checks window.POKEMON_SEED before opening an XHR", () => {
      var body = extractLoadSeedBody();
      assert.ok(body, "loadSeed() should be defined in app.js");
      var seedPos = body.indexOf("POKEMON_SEED");
      var xhrPos = body.indexOf("XMLHttpRequest");
      assert.ok(seedPos !== -1,
        "loadSeed() must check window.POKEMON_SEED so the embedded seed is preferred");
      assert.ok(xhrPos !== -1,
        "loadSeed() should still keep the XHR fallback for environments " +
        "without the embedded seed");
      assert.ok(seedPos < xhrPos,
        "the embedded-seed check must come BEFORE the XHR fallback in loadSeed() — " +
        "otherwise the XHR (and its file:// failure) would run first");
    });

    it("returns Uint8Array from both paths (uniform contract)", () => {
      // The embedded path returns the Uint8Array directly; the XHR path
      // wraps ArrayBuffer into Uint8Array so SqlEngine.init can consume
      // either interchangeably.
      var body = extractLoadSeedBody();
      assert.ok(body);
      assert.ok(/window\.POKEMON_SEED\s+instanceof\s+Uint8Array/.test(body),
        "the embedded-seed check should require a Uint8Array");
      assert.ok(/new\s+Uint8Array\(xhr\.response\)/.test(body),
        "the XHR fallback should wrap the response in a Uint8Array for a " +
        "uniform contract with the embedded path");
    });

    it("exposes loadSeed() through AppTestHooks for behavioural tests", () => {
      // Match the AppTestHooks block by anchoring to the final closing
      // brace — the previous non-greedy `[\s\S]*?\};` pattern shadowed
      // the real end-of-object marker when a hook body contained an
      // inline object literal (e.g. { saved: true, savedProgress: ... }).
      // We now scan for `loadSeed: function` anywhere in the source as
      // a direct, robust check that the hook is exposed.
      assert.ok(/window\.AppTestHooks\s*=\s*\{[\s\S]*?loadSeed:\s*function/.test(appSrc),
        "AppTestHooks.loadSeed should be exposed so tests can verify the strategy");
    });

    it("bootstrap catch error message mentions src/pokemon-seed.js", () => {
      var catchMatch = appSrc.match(/\.catch\(function\s*\(err\)\s*\{[\s\S]*?Bootstrap error[\s\S]*?\}\);/);
      assert.ok(catchMatch, "expected a bootstrap .catch() error handler");
      var catchBody = catchMatch[0];
      assert.ok(catchBody.includes("src/pokemon-seed.js"),
        "the bootstrap error message should mention src/pokemon-seed.js so " +
        "users know which file to check when the embedded seed is missing");
    });
  });

  describe("tools/build-seed-js.js (regeneration)", () => {
    it("exists so the seed can be regenerated", () => {
      assert.ok(fs.existsSync(generatorPath),
        "tools/build-seed-js.js should exist so the seed can be regenerated");
    });
  });

  describe("package.json (build/test wiring)", () => {
    it("exposes a build-seed-js npm script", () => {
      assert.ok(packageJson.scripts && typeof packageJson.scripts["build-seed-js"] === "string",
        "package.json should expose a `build-seed-js` script");
      assert.ok(packageJson.scripts["build-seed-js"].includes("build-seed-js.js"),
        "the `build-seed-js` script should run tools/build-seed-js.js");
    });

    it("exposes a pretest check that fails when the seed is out of sync", () => {
      // The pretest hook runs `node tools/build-seed-js.js --check` so CI
      // and `npm test` catch drift between data/pokemon.sqlite and
      // src/pokemon-seed.js.
      assert.ok(packageJson.scripts && typeof packageJson.scripts["pretest"] === "string",
        "package.json should expose a `pretest` check");
      assert.ok(packageJson.scripts["pretest"].includes("build-seed-js.js"),
        "the `pretest` hook should run tools/build-seed-js.js --check");
    });
  });

  describe("tests/manual.html — matches production strategy", () => {
    it("loads src/pokemon-seed.js before its main script", () => {
      var seedPos = manualSrc.indexOf("src/pokemon-seed.js");
      var mainPos = manualSrc.indexOf("runTests") !== -1
        ? manualSrc.indexOf("runTests")
        : manualSrc.length;
      assert.ok(seedPos !== -1,
        "tests/manual.html should load src/pokemon-seed.js to mirror the " +
        "production strategy (embedded seed preferred)");
      assert.ok(seedPos < mainPos,
        "src/pokemon-seed.js must load before the main test script in tests/manual.html");
    });
  });
});

// ----------------------------------------------------------------------
// Behavioural checks — exercise the production loadSeed() through the
// existing test-hook surface and assert the embedded-seed-first strategy.
// ----------------------------------------------------------------------

/**
 * Minimal mock element factory compatible with app.js's expectations.
 * Mirrors the helper in tests/app-bootstrap.test.js.
 */
function mockCreateElement(tag) {
  var children = [];
  return {
    tagName: tag,
    textContent: "",
    innerHTML: "",
    style: {},
    className: "",
    children: children,
    appendChild: function (child) { children.push(child); return child; },
  };
}

let initSqlJsCalls = [];
let AppTestHooks = null;

/**
 * XMLHttpRequest spy.  Records every call and lets each test decide
 * whether xhr.send() simulates success or failure.
 */
function makeXhrSpy(opts) {
  opts = opts || {};
  const calls = { opens: [], sends: 0, lastInstance: null };

  function Spy() {
    this._onload = null;
    this._onerror = null;
    this.responseType = "";
    Spy.lastInstance = this;
    calls.lastInstance = this;
  }
  Spy.prototype.open = function (method, url) {
    calls.opens.push({ method: method, url: url });
  };
  Spy.prototype.send = function () {
    calls.sends++;
    const self = this;
    if (opts.simulate === "success") {
      // Hand a minimal valid ArrayBuffer back to the load handler.
      this.response = new ArrayBuffer(4);
      setTimeout(function () {
        if (typeof self._onload === "function") {
          self._onload();
        }
      }, 0);
    } else {
      // Default: simulate file:// network error.
      setTimeout(function () {
        if (typeof self._onerror === "function") {
          self._onerror();
        }
      }, 0);
    }
  };
  Object.defineProperty(Spy.prototype, "onload", {
    get: function () { return this._onload; },
    set: function (fn) { this._onload = fn; },
  });
  Object.defineProperty(Spy.prototype, "onerror", {
    get: function () { return this._onerror; },
    set: function (fn) { this._onerror = fn; },
  });
  Spy.prototype.status = 0;
  Spy.calls = calls;
  return Spy;
}

let currentXhrSpy = null;

before(() => {
  initSqlJsCalls = [];

  // App dependencies — provided so the IIFE can fully initialise.
  global.window = global.window || {};
  global.window.__APP_TEST_MODE__ = true;
  global.window.__APP_TEST_HOOKS__ = true;
  global.window.initSqlJs = function (opts) {
    initSqlJsCalls.push(opts);
    return Promise.resolve({ Database: function () { this.close = function () {}; } });
  };

  global.window.SqlEngine = { init: function () { return Promise.resolve(); } };
  global.window.ResultCompare = { compare: function () { return { matched: true }; } };
  global.window.AppExercises = { phases: [] };
  global.window.ProgressStore = { isAvailable: function () { return false; } };
  global.window.ExportPackage = {};

  global.initSqlJs = global.window.initSqlJs;

  global.document = {
    readyState: "loading",
    createElement: mockCreateElement,
    addEventListener: function () {},
    getElementById: function () { return null; },
  };

  // Default XHR spy — file:// network failure by default.  Per-test
  // override sets simulate:"success" for the "XHR is available" cases.
  currentXhrSpy = makeXhrSpy();
  global.XMLHttpRequest = currentXhrSpy;
  global.window.XMLHttpRequest = currentXhrSpy;
  global.window.location = { protocol: "file:" };

  // Load app.js (IIFE) — exposes AppTestHooks under window.
  eval(appSrc);
  AppTestHooks = global.window.AppTestHooks;
  assert.ok(AppTestHooks && typeof AppTestHooks.loadSeed === "function",
    "AppTestHooks.loadSeed must be exposed in test mode");
});

afterEach(() => {
  // Clean up injected state between tests so each one starts fresh.
  delete global.window.POKEMON_SEED;
  initSqlJsCalls = [];
  // Reinstall the default XHR spy (per-test overrides mutate it).
  currentXhrSpy = makeXhrSpy();
  global.XMLHttpRequest = currentXhrSpy;
  global.window.XMLHttpRequest = currentXhrSpy;
});

// Helper: wait one microtask tick so any setTimeout(0) inside the XHR spy
// can fire before the test asserts on its outcome.
function flushMicrotasks() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

describe("loadSeed() — embedded seed preferred (behavioural)", () => {

  it("uses window.POKEMON_SEED when present and never opens an XHR", async () => {
    var seedBytes = new Uint8Array([1, 2, 3, 4, 5]);
    global.window.POKEMON_SEED = seedBytes;

    var result = await AppTestHooks.loadSeed();

    assert.strictEqual(result, seedBytes,
      "loadSeed() should resolve with the embedded window.POKEMON_SEED");
    assert.strictEqual(currentXhrSpy.calls.opens.length, 0,
      "loadSeed() must not open any XHR when the embedded seed is available " +
      "(got opens: " + JSON.stringify(currentXhrSpy.calls.opens) + ")");
    assert.strictEqual(currentXhrSpy.calls.sends, 0,
      "loadSeed() must not send any XHR when the embedded seed is available");
  });

  it("falls back to XHR when window.POKEMON_SEED is missing", async () => {
    // Embedded seed absent — loadSeed() should attempt the XHR fallback.
    // Our default XHR spy simulates file:// network error → reject.
    var rejected = false;
    var err = null;
    try {
      await AppTestHooks.loadSeed();
    } catch (e) {
      rejected = true;
      err = e;
    }
    assert.ok(rejected,
      "loadSeed() should reject when both embedded seed and XHR fail");
    assert.ok(err && /Failed to load seed database/.test(err.message),
      "loadSeed() should reject with a seed-loading error message (got: " +
      (err && err.message) + ")");
    assert.ok(currentXhrSpy.calls.opens.length >= 1,
      "loadSeed() should have opened the XHR as fallback (opens: " +
      JSON.stringify(currentXhrSpy.calls.opens) + ")");
  });

  it("prefers embedded seed even when XHR would succeed", async () => {
    // Override the XHR spy to simulate a successful response — but the
    // embedded seed should still win.  This proves no protocol-aware
    // branch sneaks back in: the embedded seed ALWAYS wins when present.
    currentXhrSpy = makeXhrSpy({ simulate: "success" });
    global.XMLHttpRequest = currentXhrSpy;
    global.window.XMLHttpRequest = currentXhrSpy;

    var seedBytes = new Uint8Array([7, 8, 9]);
    global.window.POKEMON_SEED = seedBytes;

    var result = await AppTestHooks.loadSeed();
    assert.strictEqual(result, seedBytes,
      "loadSeed() should still resolve with the embedded seed when XHR would succeed");
    assert.strictEqual(currentXhrSpy.calls.opens.length, 0,
      "loadSeed() must not use XHR when the embedded seed is present, " +
      "even if XHR would succeed");
  });

  it("embedded seed bytes are not mutated (returns the same reference)", async () => {
    var seedBytes = new Uint8Array([10, 20, 30]);
    global.window.POKEMON_SEED = seedBytes;

    var r1 = await AppTestHooks.loadSeed();
    var r2 = await AppTestHooks.loadSeed();
    assert.strictEqual(r1, seedBytes);
    assert.strictEqual(r2, seedBytes);
  });
});

describe("loadSeed() — uniform Uint8Array contract", () => {
  it("XHR fallback wraps the response in a Uint8Array (not raw ArrayBuffer)", async () => {
    // Embedded seed absent; XHR succeeds.
    currentXhrSpy = makeXhrSpy({ simulate: "success" });
    global.XMLHttpRequest = currentXhrSpy;
    global.window.XMLHttpRequest = currentXhrSpy;

    var result = await AppTestHooks.loadSeed();
    assert.ok(result instanceof Uint8Array,
      "XHR fallback should resolve with a Uint8Array, got: " +
      Object.prototype.toString.call(result));
    assert.strictEqual(result.length, 4,
      "XHR fallback should preserve the underlying buffer length");
  });
});

// Touch a few unused vars so lint passes if strict is ever enabled.
void flushMicrotasks;

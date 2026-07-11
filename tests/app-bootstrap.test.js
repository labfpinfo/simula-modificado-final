/**
 * tests/app-bootstrap.test.js
 *
 * R-001 — file:// bootstrap no longer attempts WASM binary network loading.
 *
 * Background:
 *   The original bootstrap tried to load node_modules/sql.js/dist/sql-wasm.wasm
 *   via XHR under file://. Chrome and other browsers block or partially
 *   disable file:// XHR in some configurations, so the user would see:
 *     "Error al cargar el simulador: Failed to load WASM binary:
 *      network error. Ensure node_modules/sql.js/dist/sql-wasm.wasm exists."
 *
 * Fix:
 *   index.html now loads node_modules/sql.js/dist/sql-asm.js (the asm.js
 *   build of sql.js, which compiles the SQLite engine to pure JavaScript
 *   and requires no separate WASM binary at runtime). The app's
 *   initEngine() is reduced to `return initSqlJs();` and works under both
 *   file:// and http(s):// with no protocol branching.
 *
 * What this file tests:
 *   1. Static source-level checks: index.html / app.js no longer reference
 *      the WASM binary path, do not call loadWasmBinary(), do not branch
 *      on window.location.protocol for WASM loading.
 *   2. Behavioural check: the production initEngine() (exercised through
 *      the existing test hooks) calls initSqlJs without a `wasmBinary`
 *      option under both file:// and http(s):// — the same code path,
 *      no protocol-specific workarounds.
 *
 * Run: node --test tests/app-bootstrap.test.js
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
const indexPath = path.join(projectRoot, "index.html");
const manualPath = path.join(projectRoot, "tests", "manual.html");

const appSrc = fs.readFileSync(appPath, "utf-8");
const indexSrc = fs.readFileSync(indexPath, "utf-8");
const manualSrc = fs.readFileSync(manualPath, "utf-8");

// ----------------------------------------------------------------------
// Source-level static checks
// ----------------------------------------------------------------------

describe("App bootstrap — R-001 file:// compatibility", () => {

  describe("index.html — script loading", () => {
    it("loads sql-asm.js (the no-WASM build)", () => {
      assert.ok(
        indexSrc.includes("vendor/sql-asm.js"),
        "index.html should load vendor/sql-asm.js — vendored so students need no npm install; the asm build does not require " +
        "fetching a WASM binary, which is unreliable under file://"
      );
    });

    it("does NOT load sql-wasm-browser.js (the WASM build)", () => {
      assert.ok(
        !indexSrc.includes("node_modules/sql.js/dist/sql-wasm-browser.js"),
        "index.html must not load sql-wasm-browser.js — switching to " +
        "sql-asm.js removes the WASM binary network dependency"
      );
    });
  });

  describe("src/app.js — no WASM binary references", () => {
    it("does not reference the WASM binary path", () => {
      assert.ok(
        !appSrc.includes("node_modules/sql.js/dist/sql-wasm.wasm"),
        "app.js must not reference sql-wasm.wasm — the asm build does not " +
        "need a separate WASM binary file"
      );
    });

    it("does not define or call loadWasmBinary()", () => {
      assert.ok(
        !appSrc.includes("loadWasmBinary"),
        "app.js must not contain or call loadWasmBinary() — that helper " +
        "only existed to fetch WASM bytes under file://"
      );
    });

    it("does not pass {wasmBinary: ...} to initSqlJs", () => {
      assert.ok(
        !/wasmBinary/.test(appSrc),
        "app.js must not pass {wasmBinary: ...} to initSqlJs — the asm " +
        "build is fully JavaScript and needs no pre-loaded binary"
      );
    });

    it("preflightCheck message references sql-asm.js, not sql-wasm-browser.js", () => {
      // The user-facing error must point at the build we actually load.
      var preflightMatch = appSrc.match(/function preflightCheck\(\)\s*\{[\s\S]*?\n\s{2}\}/m);
      assert.ok(preflightMatch, "preflightCheck() should be defined in app.js");
      var body = preflightMatch[0];
      assert.ok(
        body.includes("sql-asm.js"),
        "preflightCheck error should mention sql-asm.js so users know which " +
        "file to verify when SQL init fails"
      );
      assert.ok(
        !body.includes("sql-wasm-browser.js"),
        "preflightCheck must not mention sql-wasm-browser.js — that build is " +
        "no longer used"
      );
    });

    it("bootstrap catch handler does not blame sql-wasm.wasm when init fails", () => {
      // The user-facing error message should point at the asm build, not
      // the wasm binary, since the latter is no longer required.
      var catchMatch = appSrc.match(/\.catch\(function\s*\(err\)\s*\{[\s\S]*?Bootstrap error[\s\S]*?\}\);/);
      assert.ok(catchMatch, "expected a bootstrap .catch() error handler");
      var catchBody = catchMatch[0];
      assert.ok(
        !catchBody.includes("sql-wasm.wasm"),
        "the bootstrap error message must not mention sql-wasm.wasm — the " +
        "asm build does not need a WASM binary"
      );
      assert.ok(
        catchBody.includes("sql-asm.js"),
        "the bootstrap error message should mention sql-asm.js so the user " +
        "knows which file to check"
      );
    });
  });

  describe("src/app.js — initEngine() is protocol-agnostic", () => {
    /**
     * Extract the body of initEngine() from app.js. The body should be a
     * small function now — if it has grown back, we want to know.
     */
    function extractInitEngineBody() {
      var match = appSrc.match(/function initEngine\(\)\s*\{[\s\S]*?\n\s{2}\}/m);
      return match ? match[0] : null;
    }

    it("is defined in app.js", () => {
      var body = extractInitEngineBody();
      assert.ok(body, "initEngine() function should be defined in app.js");
    });

    it("does not branch on window.location.protocol", () => {
      var body = extractInitEngineBody();
      assert.ok(body);
      assert.ok(
        !/window\.location\.protocol/.test(body),
        "initEngine() must not branch on window.location.protocol — the " +
        "asm build is the same code path for file:// and http(s)://"
      );
    });

    it("does not use XMLHttpRequest for WASM bytes", () => {
      var body = extractInitEngineBody();
      assert.ok(body);
      assert.ok(
        !body.includes("XMLHttpRequest") && !/xhr\./.test(body),
        "initEngine() must not use XMLHttpRequest — the asm build does " +
        "not need to fetch a separate binary file"
      );
    });

    it("calls initSqlJs without options (or only safe options)", () => {
      var body = extractInitEngineBody();
      assert.ok(body);
      // Allowed: `return initSqlJs();` or `return initSqlJs(undefined);` —
      // these call with no options. Disallowed: any options object.
      var callMatch = body.match(/return\s+initSqlJs\s*\(\s*([^)]*)\s*\)/);
      assert.ok(callMatch, "initEngine() should call initSqlJs(...)");
      var args = callMatch[1].trim();
      assert.strictEqual(
        args, "",
        "initEngine() must call initSqlJs() with no arguments — the asm " +
        "build is self-contained and needs no locateFile or wasmBinary"
      );
    });
  });

  describe("tests/manual.html — matches production strategy", () => {
    it("loads sql-asm.js (consistent with index.html)", () => {
      assert.ok(
        manualSrc.includes("vendor/sql-asm.js"),
        "manual.html should load sql-asm.js to mirror production strategy"
      );
    });

    it("does not reference the WASM binary path", () => {
      assert.ok(
        !manualSrc.includes("sql-wasm.wasm"),
        "manual.html must not reference sql-wasm.wasm — the production " +
        "build no longer needs a WASM binary"
      );
    });
  });
});

// ----------------------------------------------------------------------
// Behavioural check — exercise the production initEngine() through
// the existing test-hook surface and assert that no WASM binary is
// requested under any protocol.
// ----------------------------------------------------------------------

/**
 * Minimal mock element factory compatible with app.js's expectations.
 * Mirrors the helper in tests/app-flow.test.js.
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

// Track all initSqlJs calls for assertions.
let initSqlJsCalls = [];

// Minimal browser environment for app.js's IIFE.
// app.js references `initSqlJs` as a free identifier that resolves
// through the scope chain to globalThis. We expose our mock at both
// `global.initSqlJs` and `global.window.initSqlJs` so the closure
// inside the IIFE picks it up regardless of how it is resolved.
function makeMockSql() {
  return {
    Database: function () { this.close = function () {}; },
  };
}

function buildMockInitSqlJs() {
  return function mockInitSqlJs(opts) {
    initSqlJsCalls.push(opts);
    return Promise.resolve(makeMockSql());
  };
}

before(() => {
  // Reset state (other test files run in separate processes, but
  // multiple `it` blocks in this file share the global state).
  initSqlJsCalls = [];

  // App dependencies — provided so the IIFE can fully initialise.
  global.window = global.window || {};
  global.window.__APP_TEST_MODE__ = true;
  global.window.__APP_TEST_HOOKS__ = true;
  global.window.initSqlJs = buildMockInitSqlJs();

  // Required by app.js: SqlEngine, ResultCompare, AppExercises,
  // ProgressStore, ExportPackage. Empty stubs are fine — initEngine
  // does not touch them.
  global.window.SqlEngine = { init: function () { return Promise.resolve(); } };
  global.window.ResultCompare = { compare: function () { return { matched: true }; } };
  global.window.AppExercises = { phases: [] };
  global.window.ProgressStore = { isAvailable: function () { return false; } };
  global.window.ExportPackage = {};

  // Free identifier `initSqlJs` inside the IIFE resolves to this.
  global.initSqlJs = global.window.initSqlJs;

  // Minimal DOM for the IIFE.
  global.document = {
    readyState: "loading",
    createElement: mockCreateElement,
    addEventListener: function () {},
    getElementById: function () { return null; },
  };

  // location.protocol — we mutate this per test.
  global.window.location = { protocol: "https:" };

  // Load app.js (IIFE) — exposes AppTestHooks under window.
  eval(appSrc);
});

afterEach(() => {
  // Clear call log between behavioural tests so each one starts fresh.
  initSqlJsCalls = [];
});

describe("initEngine() — behavioural check (R-001)", () => {

  it("calls initSqlJs without wasmBinary under file://", async () => {
    global.window.location = { protocol: "file:" };
    var AppTestHooks = global.window.AppTestHooks;
    assert.ok(AppTestHooks && typeof AppTestHooks.initEngine === "function",
      "AppTestHooks.initEngine must be exposed in test mode");

    await AppTestHooks.initEngine();

    assert.strictEqual(initSqlJsCalls.length, 1,
      "initEngine() must call initSqlJs exactly once");
    var opts = initSqlJsCalls[0];
    assert.ok(
      !(opts && opts.wasmBinary),
      "initEngine() must NOT pass wasmBinary under file:// — got: " +
      JSON.stringify(opts)
    );
    assert.ok(
      !(opts && opts.locateFile),
      "initEngine() must NOT pass locateFile under file:// — the asm " +
      "build is self-contained and does not need a locateFile callback"
    );
  });

  it("calls initSqlJs without wasmBinary under http://", async () => {
    global.window.location = { protocol: "http:" };
    var AppTestHooks = global.window.AppTestHooks;

    await AppTestHooks.initEngine();

    assert.strictEqual(initSqlJsCalls.length, 1);
    var opts = initSqlJsCalls[0];
    assert.ok(
      !(opts && opts.wasmBinary),
      "initEngine() must NOT pass wasmBinary under http:// — got: " +
      JSON.stringify(opts)
    );
  });

  it("calls initSqlJs without wasmBinary under https://", async () => {
    global.window.location = { protocol: "https:" };
    var AppTestHooks = global.window.AppTestHooks;

    await AppTestHooks.initEngine();

    assert.strictEqual(initSqlJsCalls.length, 1);
    var opts = initSqlJsCalls[0];
    assert.ok(
      !(opts && opts.wasmBinary),
      "initEngine() must NOT pass wasmBinary under https:// — got: " +
      JSON.stringify(opts)
    );
  });

  it("treats file:// and http(s):// the same way (no protocol branch)", async () => {
    var AppTestHooks = global.window.AppTestHooks;
    var fileArgs = null;
    var httpArgs = null;

    // file://
    global.window.location = { protocol: "file:" };
    initSqlJsCalls = [];
    await AppTestHooks.initEngine();
    fileArgs = initSqlJsCalls[0];

    // http://
    global.window.location = { protocol: "http:" };
    initSqlJsCalls = [];
    await AppTestHooks.initEngine();
    httpArgs = initSqlJsCalls[0];

    // Both invocations should have used the same code path — no options.
    assert.strictEqual(
      JSON.stringify(fileArgs),
      JSON.stringify(httpArgs),
      "initEngine() must use the SAME arguments for file:// and http:// — " +
      "any divergence means the protocol branch was reintroduced"
    );
  });
});

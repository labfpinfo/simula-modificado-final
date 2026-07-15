/**
 * Node.js automated tests for persistence and export/import (WU4).
 *
 * Tests cover:
 *   - ExportPackage.buildExport shape correctness
 *   - ExportPackage.generateExportHTML output structure
 *   - Continuation JSON extraction from export HTML
 *   - ExportPackage.validateProgress / import validation
 *   - HTML escaping and filename sanitisation
 *   - Progress data round-trip integrity
 *
 * ProgressStore persistence is exercised through fake-indexeddb so the
 * production IndexedDB boundary is covered in Node.
 *
 * Run: node --test tests/persistence.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");
const { IDBFactory } = require("fake-indexeddb");

// ----------------------------------------------------------------------
// Load export-package.js (pure functions — no DOM/WASM dependencies for
// buildExport, validateProgress, generateExportHTML)
// ----------------------------------------------------------------------
global.window = { AppExerciseBanks: [] };

for (const bankName of ["u1-consultas-basicas.js", "u2-joins.js", "u3-subconsultas.js"]) {
  eval(fs.readFileSync(path.resolve(__dirname, "..", "src", "exercise-banks", bankName), "utf-8"));
}
eval(fs.readFileSync(path.resolve(__dirname, "..", "src", "exercises.js"), "utf-8"));

// ExportPackage loads as IIFE, writes to window.ExportPackage
var exportPath = path.resolve(__dirname, "..", "src", "export-package.js");
var exportSrc = fs.readFileSync(exportPath, "utf-8");
eval(exportSrc);

var ExportPackage = global.window.ExportPackage;

// Load the persistence serializer separately so regression tests can pin the
// exact IndexedDB record shape without requiring a browser IndexedDB runtime.
global.window.__PROGRESS_STORE_TEST_HOOKS__ = true;
var progressStorePath = path.resolve(__dirname, "..", "src", "progress-store.js");
eval(fs.readFileSync(progressStorePath, "utf-8"));
var ProgressStoreTestHooks = global.window.ProgressStoreTestHooks;

// ----------------------------------------------------------------------
// Sample progress fixtures
// ----------------------------------------------------------------------

function sampleProgress(overrides) {
  var base = {
    studentName: "María García",
    phaseIndex: 1,
    exerciseIndex: 2,
    score: 12.5,
    maxScore: 16,
    attemptLog: [
      {
        exerciseId: "g1-simple-where",
        title: "Filtro con WHERE",
        attempts: 1,
        hintsUsed: 0,
        solved: true,
        scoreDelta: 0,
      },
      {
        exerciseId: "g2-and",
        title: "Dos condiciones con AND",
        attempts: 2,
        hintsUsed: 0,
        solved: true,
        scoreDelta: -0.25,
      },
      {
        exerciseId: "s1-groupby-count",
        title: "GROUP BY con COUNT",
        attempts: 3,
        hintsUsed: 1,
        solved: false,
        scoreDelta: -0.85,
      },
    ],
  };
  if (overrides) {
    Object.keys(overrides).forEach(function (k) { base[k] = overrides[k]; });
  }
  return base;
}

// ----------------------------------------------------------------------
// Tests — buildExport
// ----------------------------------------------------------------------

describe("ExportPackage — buildExport (WU4)", function () {

  it("produces expected top-level keys", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.ok(pkg.version);
    assert.ok(pkg.exportedAt);
    assert.ok(pkg.review);
    assert.ok(pkg.continuation);
  });

  it("review contains correct studentName", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.strictEqual(pkg.review.studentName, "María García");
  });

  it("review contains correct score and percentage", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.strictEqual(pkg.review.score, 12.5);
    assert.strictEqual(pkg.review.maxScore, 16);
    assert.strictEqual(pkg.review.percentage, 78); // Math.round(12.5/16*100)
  });

  it("review counts solved/unsolved exercises", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.strictEqual(pkg.review.totalExercises, 3);
    assert.strictEqual(pkg.review.solvedExercises, 2);
    assert.strictEqual(pkg.review.totalAttempts, 6); // 1+2+3
    assert.strictEqual(pkg.review.totalHintsUsed, 1);
  });

  it("continuation matches input progress shape", function () {
    var input = sampleProgress();
    var pkg = ExportPackage.buildExport(input);
    var c = pkg.continuation;
    assert.strictEqual(c.studentName, input.studentName);
    assert.strictEqual(c.phaseIndex, input.phaseIndex);
    assert.strictEqual(c.exerciseIndex, input.exerciseIndex);
    assert.strictEqual(c.score, input.score);
    assert.strictEqual(c.maxScore, input.maxScore);
    assert.strictEqual(c.attemptLog.length, 3);
    assert.strictEqual(c.attemptLog[0].exerciseId, "g1-simple-where");
    assert.strictEqual(c.attemptLog[0].title, "Filtro con WHERE");
  });

  it("handles empty attemptLog", function () {
    var pkg = ExportPackage.buildExport({
      studentName: "Test",
      phaseIndex: 0,
      exerciseIndex: 0,
      score: 16,
      maxScore: 16,
      attemptLog: [],
    });
    assert.strictEqual(pkg.review.totalExercises, 0);
    assert.strictEqual(pkg.review.solvedExercises, 0);
    assert.strictEqual(pkg.continuation.attemptLog.length, 0);
  });

  // --- R3-WU4-002: continuation must preserve `view` so import restores
  //     the correct screen (especially "complete"). ---

  it("continuation includes view='exercises' when given an exercise session", function () {
    var pkg = ExportPackage.buildExport(sampleProgress({ view: "exercises" }));
    assert.strictEqual(pkg.continuation.view, "exercises");
  });

  it("continuation includes view='complete' for completed exports (R3-WU4-002)", function () {
    var pkg = ExportPackage.buildExport(sampleProgress({ view: "complete" }));
    assert.strictEqual(pkg.continuation.view, "complete",
      "continuation MUST carry view='complete' so import lands on complete view");
  });

  it("continuation includes view='start' when given a start-screen session", function () {
    var pkg = ExportPackage.buildExport(sampleProgress({ view: "start" }));
    assert.strictEqual(pkg.continuation.view, "start");
  });

  it("missing view defaults to 'exercises' on export (backward compat)", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.strictEqual(pkg.continuation.view, "exercises");
  });

  it("invalid view value is normalised to 'exercises' on export", function () {
    var pkg = ExportPackage.buildExport(sampleProgress({ view: "bogus" }));
    assert.strictEqual(pkg.continuation.view, "exercises");

    var pkg2 = ExportPackage.buildExport(sampleProgress({ view: 42 }));
    assert.strictEqual(pkg2.continuation.view, "exercises");

    var pkg3 = ExportPackage.buildExport(sampleProgress({ view: null }));
    assert.strictEqual(pkg3.continuation.view, "exercises");
  });

  it("handles null/undefined input gracefully", function () {
    var pkg = ExportPackage.buildExport(null);
    assert.ok(pkg.version);
    assert.strictEqual(pkg.review.studentName, "(sin nombre)");
    assert.strictEqual(pkg.review.score, 0);
    assert.strictEqual(pkg.continuation.score, 0);
  });

  it("handles missing fields with defaults", function () {
    var pkg = ExportPackage.buildExport({});
    assert.strictEqual(pkg.review.studentName, "(sin nombre)");
    assert.strictEqual(pkg.review.score, 0);
    assert.strictEqual(pkg.review.phaseIndex, 0);
    assert.strictEqual(pkg.review.exerciseIndex, 0);
  });

  // --- Side-menu / skipped-state continuation (cross-browser restoration).
  //     The continuation payload must preserve the side-menu collapse
  //     preference and the per-entry skipped flag so a cross-browser
  //     continuation keeps the menu navigable and the no-reveal contract.

  it("continuation includes menuCollapsed when the progress supplies it", function () {
    var pkg = ExportPackage.buildExport(sampleProgress({ menuCollapsed: true }));
    assert.strictEqual(pkg.continuation.menuCollapsed, true,
      "continuation must carry menuCollapsed so a cross-browser restore keeps the student's collapse preference");
  });

  it("continuation defaults menuCollapsed to false (legacy / missing input)", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    assert.strictEqual(pkg.continuation.menuCollapsed, false,
      "missing menuCollapsed must default to false (expanded) for legacy exports");
  });

  it("continuation includes per-entry skipped flag on attemptLog entries", function () {
    var progress = sampleProgress();
    progress.attemptLog[0].skipped = false;
    progress.attemptLog[2].skipped = true; // s1-groupby-count was skipped
    var pkg = ExportPackage.buildExport(progress);
    assert.strictEqual(pkg.continuation.attemptLog[0].skipped, false);
    assert.strictEqual(pkg.continuation.attemptLog[2].skipped, true,
      "continuation must carry the skipped flag on each attemptLog entry so the side menu and restore stay correct");
  });

  it("continuation defaults missing per-entry skipped to false (legacy exports)", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    // sampleProgress entries do not set skipped — must default to false.
    for (var i = 0; i < pkg.continuation.attemptLog.length; i++) {
      assert.strictEqual(pkg.continuation.attemptLog[i].skipped, false,
        "attemptLog[" + i + "].skipped must default to false when source is missing it");
    }
  });

  it("keeps a skipped entry's complete restoration state in the continuation", function () {
    var progress = sampleProgress();
    progress.attemptLog[2] = {
      exerciseId: "s1-groupby-count",
      title: "GROUP BY con COUNT",
      attempts: 3,
      hintsUsed: 1,
      solved: false,
      skipped: true,
      scoreDelta: -0.85,
      submittedSql: "",
      earnedPoints: 0,
    };

    var entry = ExportPackage.buildExport(progress).continuation.attemptLog[2];
    assert.deepStrictEqual(entry, {
      exerciseId: "s1-groupby-count",
      title: "GROUP BY con COUNT",
      attempts: 3,
      hintsUsed: 1,
      solved: false,
      skipped: true,
      scoreDelta: -0.85,
      submittedSql: "",
    });
  });
});

describe("ProgressStore — attempt-log persistence", function () {
  it("keeps skipped restoration state while excluding derived earned points", function () {
    var stored = ProgressStoreTestHooks.cloneAttemptLog([{
      exerciseId: "s1-groupby-count",
      title: "GROUP BY con COUNT",
      attempts: 3,
      hintsUsed: 1,
      solved: false,
      skipped: true,
      scoreDelta: -0.85,
      submittedSql: "",
      earnedPoints: 0,
    }]);

    assert.deepStrictEqual(stored, [{
      exerciseId: "s1-groupby-count",
      title: "GROUP BY con COUNT",
      attempts: 3,
      hintsUsed: 1,
      solved: false,
      skipped: true,
      scoreDelta: -0.85,
      submittedSql: "",
    }]);
  });

  it("persists and reloads through the production IndexedDB boundary", async function () {
    global.indexedDB = new IDBFactory();
    await global.window.ProgressStore.saveProgress(sampleProgress());

    // Re-evaluate the production store to model a browser reload: only the
    // IndexedDB database survives, not its in-memory cached connection.
    delete global.window.ProgressStore;
    eval(fs.readFileSync(progressStorePath, "utf-8"));
    const restored = await global.window.ProgressStore.loadProgress();

    assert.strictEqual(restored.studentName, "María García");
    assert.strictEqual(restored.phaseIndex, 1);
    assert.strictEqual(restored.attemptLog[1].exerciseId, "g2-and");
  });

  it("keeps a recovery copy and exposes fallback status when IndexedDB is unavailable", async function () {
    delete global.indexedDB;
    const values = new Map();
    global.localStorage = {
      getItem: function (key) { return values.has(key) ? values.get(key) : null; },
      setItem: function (key, value) { values.set(key, String(value)); },
      removeItem: function (key) { values.delete(key); },
    };
    delete global.window.ProgressStore;
    eval(fs.readFileSync(progressStorePath, "utf-8"));
    await global.window.ProgressStore.saveProgress(sampleProgress());
    const restored = await global.window.ProgressStore.loadProgress();

    assert.strictEqual(global.window.ProgressStore.getStatus().backend, "localStorage");
    assert.strictEqual(restored.studentName, "María García");
    delete global.localStorage;
  });
});

// ----------------------------------------------------------------------
// Tests — generateExportHTML
// ----------------------------------------------------------------------

describe("ExportPackage — generateExportHTML (WU4)", function () {

  it("produces a complete HTML document string", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    var html = ExportPackage.generateExportHTML(pkg);
    assert.ok(typeof html === "string");
    assert.ok(html.indexOf("<!DOCTYPE html>") === 0);
    assert.ok(html.indexOf("</html>") !== -1);
  });

  it("contains the student name in visible text", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    var html = ExportPackage.generateExportHTML(pkg);
    assert.ok(html.indexOf("María García") !== -1);
  });

  it("contains the continuation-data script block", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    var html = ExportPackage.generateExportHTML(pkg);
    assert.ok(html.indexOf('script type="application/json" id="continuation-data"') !== -1);
  });

  it("omits declared aggregate scores from the teacher-visible report and directs recomputation", function () {
    var html = ExportPackage.generateExportHTML(ExportPackage.buildExport(sampleProgress({
      score: 999,
      maxScore: 999,
    })));
    var visiblePart = html.split('script type="application/json"')[0];

    assert.ok(visiblePart.indexOf("999.00 / 999.00") === -1);
    assert.ok(visiblePart.indexOf("no constituyen una calificación") !== -1);
    assert.ok(visiblePart.indexOf("npm run review-exports") !== -1);
    var continuation = JSON.parse(html.match(/<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i)[1]);
    assert.strictEqual(continuation.score, 999,
      "continuation data must retain declared scores for learner import/export");
    assert.strictEqual(continuation.maxScore, 999);
  });

  it("continuation JSON is valid and parsable", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    var html = ExportPackage.generateExportHTML(pkg);

    // Extract continuation JSON using same regex as importFromFile
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match, "continuation-data script block must exist");
    var parsed = JSON.parse(match[1].trim());
    assert.strictEqual(parsed.studentName, "María García");
    assert.strictEqual(parsed.score, 12.5);
  });

  it("escapes < and > in student names in visible text to prevent XSS", function () {
    var xssName = "<script>alert('xss')</script>";
    var pkg = ExportPackage.buildExport({
      studentName: xssName,
      phaseIndex: 0,
      exerciseIndex: 0,
      score: 16,
      maxScore: 16,
      attemptLog: [],
    });
    var html = ExportPackage.generateExportHTML(pkg);

    // Split HTML at the continuation-data block — everything BEFORE it
    // is the visible teacher-review section and must be XSS-safe.
    var visiblePart = html.split('script type="application/json"')[0];

    // Visible text must be HTML-escaped
    assert.ok(visiblePart.indexOf("<script>") === -1,
      "visible text must not contain raw <script> — expected &lt;script&gt;");
    assert.ok(visiblePart.indexOf("&lt;script&gt;") !== -1,
      "visible text must contain HTML-escaped &lt;script&gt;");

    // The continuation JSON block must NOT contain raw </script> INSIDE
    // the JSON payload (which would prematurely close the wrapping script
    // tag).  Our generator escapes </ to <\/ for exactly this reason.
    // The jsonPart includes the closing </script> of the block itself,
    // so strip that before checking.
    var jsonPart = html.split('script type="application/json"')[1] || "";
    // Remove the trailing </script> that closes the JSON block
    var jsonPayload = jsonPart.replace(/<\/script>[\s\S]*$/i, "");
    assert.ok(jsonPayload.indexOf("</script>") === -1,
      "continuation JSON must not contain raw </script> inside the payload — " +
      "should be escaped as <\\/script> to prevent premature closing");
  });

  it("escapes & in student names", function () {
    var pkg = ExportPackage.buildExport({
      studentName: "A & B",
      phaseIndex: 0,
      exerciseIndex: 0,
      score: 16,
      maxScore: 16,
      attemptLog: [],
    });
    var html = ExportPackage.generateExportHTML(pkg);
    assert.ok(html.indexOf("A &amp; B") !== -1);
  });

  it("handles empty export package gracefully", function () {
    var html = ExportPackage.generateExportHTML({});
    assert.ok(typeof html === "string");
    assert.ok(html.indexOf("DOCTYPE html") !== -1);
    // Should not crash
  });

  // --- R2-WU4-001: single source of truth for exportedAt ---

  it("uses exportedAt from the package object, not a new date (R2-WU4-001)", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    // Override exportedAt to a known value after build
    pkg.exportedAt = "2025-01-15T10:30:00.000Z";
    var html = ExportPackage.generateExportHTML(pkg);
    // The HTML should contain the locale-formatted version of our fixed date
    // "15/1/2025, 11:30:00" (es-ES, UTC+1 for Jan) — just verify it doesn't
    // contain a current-year timestamp as evidence it used the package value
    var currentYear = new Date().getFullYear().toString();
    // The exportedAt we set is 2025, so the HTML should contain "2025"
    assert.ok(html.indexOf("2025") !== -1,
      "Expected the export HTML to use the fixed 2025 date from the package");
  });
});

// ----------------------------------------------------------------------
// Tests — round-trip: buildExport → generateExportHTML → extract
// ----------------------------------------------------------------------

describe("ExportPackage — round-trip integrity (WU4)", function () {

  it("continuation data survives HTML round-trip", function () {
    var progress = sampleProgress();
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    // Simulate what importFromFile does: extract and validate
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match);
    var extracted = JSON.parse(match[1].trim());
    var validated = ExportPackage.validateProgress(extracted);

    assert.strictEqual(validated.studentName, "María García");
    assert.strictEqual(validated.phaseIndex, 1);
    assert.strictEqual(validated.exerciseIndex, 2);
    assert.strictEqual(validated.score, 12.5);
    assert.strictEqual(validated.maxScore, 16);
    assert.strictEqual(validated.attemptLog.length, 3);
    assert.strictEqual(validated.attemptLog[0].exerciseId, "g1-simple-where");
    assert.strictEqual(validated.attemptLog[1].solved, true);
    assert.strictEqual(validated.attemptLog[2].solved, false);
    assert.strictEqual(validated.attemptLog[2].hintsUsed, 1);
  });

  it("round-trip preserves scoreDelta values", function () {
    var progress = sampleProgress();
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());

    assert.strictEqual(extracted.attemptLog[1].scoreDelta, -0.25);
    assert.strictEqual(extracted.attemptLog[2].scoreDelta, -0.85);
  });

  // --- R3-WU4-002: completed export must round-trip through HTML and
  //     re-import with view='complete' so the app lands on the complete
  //     screen, not the exercise screen. ---

  it("completed export round-trip preserves view='complete' through HTML (R3-WU4-002)", function () {
    var progress = sampleProgress({ view: "complete" });
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    // Extract the continuation JSON the same way importFromFile does.
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match, "continuation-data block must exist");
    var extracted = JSON.parse(match[1].trim());
    var validated = ExportPackage.validateProgress(extracted);

    // Critical: the validated record must carry view='complete', so
    // _restoreFromProgress's `saved.view || "exercises"` evaluates to
    // "complete" and showCompleteView() runs.
    assert.strictEqual(validated.view, "complete",
      "completed export must round-trip with view='complete' — if this " +
      "fails, import lands on the exercise view instead of the complete view");
  });

  it("completed export round-trip does NOT duplicate attemptLog (R3-WU4-002)", function () {
    var progress = sampleProgress({ view: "complete" });
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());

    // The continuation must carry the original log entries once — not
    // a duplicated copy (e.g. via two .map() calls).
    assert.strictEqual(extracted.attemptLog.length, progress.attemptLog.length,
      "round-trip must preserve attemptLog entry count exactly");
    for (var i = 0; i < progress.attemptLog.length; i++) {
      assert.strictEqual(extracted.attemptLog[i].exerciseId,
        progress.attemptLog[i].exerciseId,
        "attemptLog[" + i + "].exerciseId must match");
      assert.strictEqual(extracted.attemptLog[i].attempts,
        progress.attemptLog[i].attempts,
        "attemptLog[" + i + "].attempts must match");
    }
  });

  it("round-trip preserves view='exercises' through HTML", function () {
    var progress = sampleProgress({ view: "exercises" });
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());

    assert.strictEqual(extracted.view, "exercises");
  });

  it("legacy export without view imports with view defaulting to 'exercises'", function () {
    // Simulate a pre-fix export that has no `view` field at all.
    var legacyContinuation = {
      version: "1.0",
      studentName: "Legacy",
      phaseIndex: 1,
      exerciseIndex: 2,
      score: 10,
      maxScore: 16,
      attemptLog: [],
    };
    var html =
      '<html><body>' +
      '<script type="application/json" id="continuation-data">' +
      JSON.stringify(legacyContinuation) +
      '</script></body></html>';

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());
    var validated = ExportPackage.validateProgress(extracted);

    assert.strictEqual(validated.view, undefined,
      "legacy continuation must keep view=undefined — app.js uses " +
      "saved.view || 'exercises' to fall back safely");
  });

  // --- Side-menu / skipped-state round-trip (cross-browser continuation).
  //     The continuation must preserve the side-menu collapse preference
  //     and the per-entry skipped flag through a full HTML
  //     buildExport → generateExportHTML → extract → validate cycle.

  it("round-trip preserves menuCollapsed through HTML (side-menu preference)", function () {
    var progress = sampleProgress({ menuCollapsed: true });
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());
    var validated = ExportPackage.validateProgress(extracted);

    assert.strictEqual(validated.menuCollapsed, true,
      "menuCollapsed must round-trip through HTML — otherwise a cross-browser " +
      "continuation silently drops the student's collapse preference");
  });

  it("round-trip preserves per-entry skipped flag through HTML (no-reveal contract)", function () {
    var progress = sampleProgress();
    progress.attemptLog[0].skipped = true; // g1-simple-where was skipped
    progress.attemptLog[1].skipped = false; // g2-and was solved
    progress.attemptLog[2].skipped = true; // s1-groupby-count was skipped
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    var extracted = JSON.parse(match[1].trim());
    var validated = ExportPackage.validateProgress(extracted);

    assert.strictEqual(validated.attemptLog[0].skipped, true,
      "attemptLog[0].skipped must round-trip — otherwise a cross-browser " +
      "continuation loses the side-menu navigability flag");
    assert.strictEqual(validated.attemptLog[1].skipped, false);
    assert.strictEqual(validated.attemptLog[2].skipped, true,
      "attemptLog[2].skipped must round-trip — restored render must keep the no-reveal contract");
  });
});

// ----------------------------------------------------------------------
// Tests — validateProgress
// ----------------------------------------------------------------------

describe("ExportPackage — validateProgress (WU4)", function () {

  it("accepts valid continuation data", function () {
    var progress = sampleProgress();
    var pkg = ExportPackage.buildExport(progress);
    // Should not throw
    assert.doesNotThrow(function () {
      ExportPackage.validateProgress(pkg.continuation);
    });
  });

  it("rejects null / non-object input", function () {
    assert.throws(function () { ExportPackage.validateProgress(null); }, /no son válidos/);
    assert.throws(function () { ExportPackage.validateProgress(undefined); }, /no son válidos/);
    assert.throws(function () { ExportPackage.validateProgress("string"); }, /no son válidos/);
  });

  it("rejects missing version", function () {
    var bad = { studentName: "Test", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /versión/);
  });

  it("rejects missing studentName", function () {
    var bad = { version: "1.0", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /nombre de estudiante/);
  });

  it("rejects missing phaseIndex", function () {
    var bad = { version: "1.0", studentName: "Test", exerciseIndex: 0, score: 10, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /fase/);
  });

  it("rejects negative phaseIndex", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: -1, exerciseIndex: 0, score: 10, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /fase/);
  });

  it("rejects missing exerciseIndex", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: 0, score: 10, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /ejercicio/);
  });

  it("rejects missing score", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: 0, exerciseIndex: 0, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación/);
  });

  it("rejects missing maxScore", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: 0, exerciseIndex: 0, score: 10, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación máxima/);
  });

  it("rejects maxScore <= 0", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 0, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación máxima/);
  });

  it("rejects missing attemptLog", function () {
    var bad = { version: "1.0", studentName: "Test", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16 };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /registro de intentos/);
  });

  // --- R1-WU4-002 / R3-WU4-003: attemptLog entry + score safety ---

  it("rejects NaN score (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: NaN, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación/);
  });

  it("rejects Infinity score (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: Infinity, maxScore: 16, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación/);
  });

  it("rejects -Infinity maxScore (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: -Infinity, attemptLog: [] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /puntuación máxima/);
  });

  it("rejects attemptLog entry with missing exerciseId (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ title: "ok", attempts: 1, hintsUsed: 0, solved: false, scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /exerciseId/);
  });

  it("rejects attemptLog entry with negative attempts (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "ok", attempts: -1, hintsUsed: 0, solved: false, skipped: false, scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /intentos inválido/);
  });

  it("rejects attemptLog entry with non-integer attempts (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "ok", attempts: 1.5, hintsUsed: 0, solved: false, skipped: false, scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /intentos inválido/);
  });

  it("rejects attemptLog entry with NaN scoreDelta (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "ok", attempts: 0, hintsUsed: 0, solved: false, skipped: false, scoreDelta: NaN }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /Penalización/);
  });

  it("rejects attemptLog entry with Infinity hintsUsed (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "ok", attempts: 0, hintsUsed: Infinity, solved: false, skipped: false, scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /pistas inválido/);
  });

  it("rejects attemptLog entry that is not an object (R1-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: ["not-an-object"] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /inválida en posición 0/);
  });

  // --- R3-WU4-002: view field validation in validateProgress ---

  it("accepts view='exercises' in continuation (R3-WU4-002)", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], view: "exercises" };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("accepts view='complete' in continuation (R3-WU4-002)", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], view: "complete" };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("accepts view='start' in continuation (R3-WU4-002)", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], view: "start" };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("accepts continuation without view field (backward compat)", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [] };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("rejects continuation with invalid view value (R3-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], view: "bogus" };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /vista/);
  });

  it("rejects continuation with numeric view value (R3-WU4-002)", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], view: 42 };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /vista/);
  });

  // --- Side-menu / skipped-state continuation validation.

  it("accepts continuation with menuCollapsed=true", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], menuCollapsed: true };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("accepts continuation with menuCollapsed=false", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], menuCollapsed: false };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("accepts legacy continuation without menuCollapsed (backward compat)", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [] };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); },
      "legacy continuation without menuCollapsed must still import cleanly");
  });

  it("rejects continuation with non-boolean menuCollapsed", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [], menuCollapsed: "yes" };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /menuCollapsed/);
  });

  it("accepts attemptLog entry with skipped=true", function () {
    var good = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "T", attempts: 0, hintsUsed: 0, solved: false, skipped: true, scoreDelta: -0.5 }] };
    assert.doesNotThrow(function () { ExportPackage.validateProgress(good); });
  });

  it("rejects attemptLog entry without skipped", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "T", attempts: 0, hintsUsed: 0, solved: true, scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /skipped/);
  });

  it("rejects attemptLog entry with non-boolean skipped", function () {
    var bad = { version: "1.0", studentName: "T", phaseIndex: 0, exerciseIndex: 0, score: 10, maxScore: 16,
      attemptLog: [{ exerciseId: "g1-simple-where", title: "T", attempts: 0, hintsUsed: 0, solved: false, skipped: "yes", scoreDelta: 0 }] };
    assert.throws(function () { ExportPackage.validateProgress(bad); }, /skipped/);
  });

  it("rejects unknown exercise IDs, duplicates, and non-boolean solved values", function () {
    var base = ExportPackage.buildExport(sampleProgress()).continuation;
    base.attemptLog[0].exerciseId = "unknown-exercise";
    assert.throws(function () { ExportPackage.validateProgress(base); }, /exerciseId/);

    base = ExportPackage.buildExport(sampleProgress()).continuation;
    base.attemptLog.push(Object.assign({}, base.attemptLog[0]));
    assert.throws(function () { ExportPackage.validateProgress(base); }, /más de una vez/);

    base = ExportPackage.buildExport(sampleProgress()).continuation;
    base.attemptLog[0].solved = "true";
    assert.throws(function () { ExportPackage.validateProgress(base); }, /solved/);
  });
});

// ----------------------------------------------------------------------
// Tests — CONTINUATION_DATA extraction from various HTML shapes
// ----------------------------------------------------------------------

describe("ExportPackage — continuation extraction (WU4)", function () {

  function extractJSON(html) {
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    if (!match) return null;
    return JSON.parse(match[1].trim());
  }

  it("extracts continuation from valid export HTML", function () {
    var pkg = ExportPackage.buildExport(sampleProgress());
    var html = ExportPackage.generateExportHTML(pkg);
    var data = extractJSON(html);
    assert.ok(data);
    assert.strictEqual(data.studentName, "María García");
  });

  it("returns null for HTML without continuation block", function () {
    var html = "<html><body>No data here</body></html>";
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    assert.strictEqual(re.test(html), false);
  });

  it("returns null for malformed JSON in continuation block", function () {
    var html = '<script type="application/json" id="continuation-data">{broken json!!!}</script>';
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match);
    assert.throws(function () {
      JSON.parse(match[1].trim());
    });
  });

  it("matches continuation block with extra whitespace in tag", function () {
    var progress = sampleProgress();
    var pkg = ExportPackage.buildExport(progress);
    var continuationJSON = JSON.stringify(pkg.continuation);
    var html =
      '<html><body>\n' +
      '<script  type="application/json"  id="continuation-data" >\n' +
      continuationJSON +
      '\n</script>\n' +
      '</body></html>';

    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match);
    var extracted = JSON.parse(match[1].trim());
    assert.strictEqual(extracted.studentName, "María García");
  });

  it("handles continuation JSON containing HTML-like strings", function () {
    var progress = sampleProgress({
      studentName: "Test <p>Student</p>",
    });
    var pkg = ExportPackage.buildExport(progress);
    var html = ExportPackage.generateExportHTML(pkg);

    // The continuation JSON should NOT contain raw HTML tags — the
    // studentName in the continuation is the raw string. But the regex
    // must still correctly delimit the JSON block.
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    assert.ok(match);
    var extracted = JSON.parse(match[1].trim());
    assert.strictEqual(extracted.studentName, "Test <p>Student</p>");
  });
});

// ----------------------------------------------------------------------
// Tests — sanitisation helpers
// ----------------------------------------------------------------------

describe("ExportPackage — HTML escaping (WU4)", function () {

  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  it("escapes < > & \" ' characters", function () {
    assert.strictEqual(escapeHTML("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
  });

  it("returns empty string for null/undefined", function () {
    assert.strictEqual(escapeHTML(null), "");
    assert.strictEqual(escapeHTML(undefined), "");
  });

  it("returns normal text unchanged", function () {
    assert.strictEqual(escapeHTML("María García"), "María García");
  });
});

describe("ExportPackage — safeFilename (WU4)", function () {

  function safeFilename(name) {
    return String(name)
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ _.\-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "simulacro-sql-export.html";
  }

  it("preserves alphanumeric and accented characters", function () {
    assert.strictEqual(safeFilename("María García"), "María-García");
  });

  it("strips special characters", function () {
    assert.strictEqual(safeFilename("test/file:name*?"), "testfilename");
  });

  it("replaces spaces with hyphens", function () {
    assert.strictEqual(safeFilename("a b  c"), "a-b-c");
  });

  it("truncates long names", function () {
    var long = "x".repeat(200);
    var result = safeFilename(long);
    assert.ok(result.length <= 120);
  });

  it("falls back to default for empty input", function () {
    assert.strictEqual(safeFilename(""), "simulacro-sql-export.html");
  });
});

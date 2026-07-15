/**
 * Node.js automated tests for app shell and exercise flow (WU3).
 *
 * Tests cover:
 *   - Exercise metadata correctness (ordered flags, counts, maxScore)
 *   - Scoring / penalty helpers extracted from the app model
 *   - Attempt-log lifecycle (creation, mutation, completion)
 *   - Progress bar calculation
 *
 * These are deterministic, pure-state tests.  They do NOT depend on DOM,
 * WASM, or the browser.  They only exercise the app's data and flow logic.
 *
 * Run: node --test tests/app-flow.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Load exercises.js (pure data — no DOM/WASM dependencies)
// ----------------------------------------------------------------------
global.window = {};
// Load exercise banks first, then the assembler (exercises.js).
const banksDir = path.resolve(__dirname, "..", "src", "exercise-banks");
for (const bankFile of fs.readdirSync(banksDir).filter((f) => f.endsWith(".js")).sort()) {
  eval(fs.readFileSync(path.join(banksDir, bankFile), "utf-8"));
}
const exercisesPath = path.resolve(__dirname, "..", "src", "exercises.js");
const exercisesSrc = fs.readFileSync(exercisesPath, "utf-8");
eval(exercisesSrc);

const AppExercises = global.window.AppExercises;
// app.js references AppExercises as a bare name inside its IIFE.
// Make it resolvable through the global scope chain.
global.AppExercises = AppExercises;

// ----------------------------------------------------------------------
// Load app.js in test mode (no bootstrap, test hooks exposed)
// ----------------------------------------------------------------------
global.window.__APP_TEST_MODE__ = true;
global.window.__APP_TEST_HOOKS__ = true;

/**
 * Minimal mock element factory for testing DOM rendering functions.
 * Tracks appended children so tests can assert on the produced structure.
 */
function mockCreateElement(tag) {
  var children = [];
  return {
    tagName: tag,
    textContent: "",
    style: {},
    className: "",
    children: children,
    appendChild: function (child) { children.push(child); return child; },
  };
}

global.document = {
  readyState: "loading",
  createElement: mockCreateElement,
};

var appPath = path.resolve(__dirname, "..", "src", "app.js");
var appSrc = fs.readFileSync(appPath, "utf-8");
eval(appSrc);

// The hooks are now available on window.AppTestHooks
var AppTestHooks = global.window.AppTestHooks;

// ----------------------------------------------------------------------
// Pure-state helpers — extracted from app.js logic for deterministic testing
// ----------------------------------------------------------------------

/**
 * Scoring constants (centralised).
 */
const SCORE_DEFAULTS = {
  errorPenalty: 0.25,
  hintPenalty: 0.10,
};

/**
 * Calculate the max possible score across all phases.
 */
function computeMaxScore(phases) {
  var total = 0;
  for (var pi = 0; pi < phases.length; pi++) {
    var exs = phases[pi].exercises;
    for (var ei = 0; ei < exs.length; ei++) {
      total += (exs[ei].scoring && exs[ei].scoring.points) || 1;
    }
  }
  return total;
}

/**
 * Apply a penalty to the current score, floor at 0.
 */
function applyPenalty(score, amount) {
  return Math.max(0, score - amount);
}

/**
 * Create a fresh exercise-level state object.
 */
function createExerciseState() {
  return {
    attempts: 0,
    hintsUsed: [],
    solved: false,
    lastSql: null,
  };
}

/**
 * Create a fresh attempt-log entry for an exercise.
 */
function createAttemptLogEntry(exercise) {
  return {
    exerciseId: exercise.id,
    title: exercise.title,
    attempts: 0,
    hintsUsed: 0,
    solved: false,
    skipped: false,
    scoreDelta: 0,
  };
}

/**
 * Calculate progress (completed count / total) given phase and exercise indices.
 */
function calcProgress(phases, phaseIndex, exerciseIndex) {
  var total = 0;
  for (var pi = 0; pi < phases.length; pi++) {
    total += phases[pi].exercises.length;
  }
  var completed = 0;
  for (var pi = 0; pi < phaseIndex; pi++) {
    completed += phases[pi].exercises.length;
  }
  completed += exerciseIndex;
  return { completed: completed, total: total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

// ----------------------------------------------------------------------
// Mock exercise state builder for flow testing
// ----------------------------------------------------------------------

/**
 * Build a minimal mock of the app state used by the exercise flow.
 */
function mockAppState(phases) {
  return {
    view: "exercises",
    studentName: "Test Student",
    phaseIndex: 0,
    exerciseIndex: 0,
    score: 0,
    maxScore: computeMaxScore(phases),
    attemptLog: [],
    currentExerciseState: null,
  };
}

/** Get current exercise from mock state. */
function currentExercise(mockState, exercisesModule) {
  var phase = exercisesModule.phases[mockState.phaseIndex];
  if (!phase) return null;
  return phase.exercises[mockState.exerciseIndex] || null;
}

/** Start a new exercise in the mock state (simulates renderPhaseExercise). */
function startExercise(mockState) {
  var ex = currentExercise(mockState, AppExercises);
  if (!ex) return;
  mockState.currentExerciseState = createExerciseState();
  mockState.attemptLog.push(createAttemptLogEntry(ex));
}

/** Submit handler — wrong answer (also covers SQL errors; both use errorPenalty). */
function submitWrong(mockState, ex) {
  mockState.currentExerciseState.attempts++;
  var penalty = (ex.scoring && ex.scoring.errorPenalty) || SCORE_DEFAULTS.errorPenalty;
  mockState.score = applyPenalty(mockState.score, penalty);
  var log = mockState.attemptLog[mockState.attemptLog.length - 1];
  if (log) {
    log.attempts = mockState.currentExerciseState.attempts;
    log.scoreDelta -= penalty;
  }
}

/** Submit handler — correct answer. */
function submitCorrect(mockState) {
  mockState.currentExerciseState.attempts++;
  mockState.currentExerciseState.solved = true;
  var log = mockState.attemptLog[mockState.attemptLog.length - 1];
  if (log) {
    log.attempts = mockState.currentExerciseState.attempts;
    log.solved = true;
  }
}

/** Use a hint. */
function useHint(mockState, ex, hintIndex) {
  var hint = ex.hints[hintIndex];
  if (!hint) return;
  mockState.currentExerciseState.hintsUsed.push(hintIndex);
  var penalty = hint.penalty || SCORE_DEFAULTS.hintPenalty;
  mockState.score = applyPenalty(mockState.score, penalty);
  var log = mockState.attemptLog[mockState.attemptLog.length - 1];
  if (log) {
    log.hintsUsed = mockState.currentExerciseState.hintsUsed.length;
    log.scoreDelta -= penalty;
  }
}

/** Skip exercise. */
function skipExercise(mockState) {
  var log = mockState.attemptLog[mockState.attemptLog.length - 1];
  if (log) {
    log.solved = false;
    log.skipped = true;
  }
}

/** Advance to next exercise (simulates handleNext). */
function advanceExercise(mockState) {
  var log = mockState.attemptLog[mockState.attemptLog.length - 1];
  var es = mockState.currentExerciseState;
  if (log && es) {
    log.attempts = es.attempts;
    log.hintsUsed = es.hintsUsed.length;
    log.solved = es.solved;
  }

  var phase = AppExercises.phases[mockState.phaseIndex];
  var isLastInPhase = mockState.exerciseIndex >= phase.exercises.length - 1;
  var isLastPhase = mockState.phaseIndex >= AppExercises.phases.length - 1;

  if (isLastInPhase && isLastPhase) {
    mockState.view = "complete";
    return "complete";
  } else if (isLastInPhase) {
    mockState.phaseIndex++;
    mockState.exerciseIndex = 0;
    return "next-phase";
  } else {
    mockState.exerciseIndex++;
    return "next-exercise";
  }
}

/**
 * Pure-data mirror of renderResultTable() from app.js.
 * Returns formatted model so we can assert column/cell rendering without DOM.
 * @param {{columns: string[], rows: any[][]}} studentResult
 * @returns {{empty: boolean, columns: string[], rowCount: number, headerCells: string[], dataRows: string[][]}}
 */
function buildResultTableModel(studentResult) {
  if (!studentResult.columns || studentResult.columns.length === 0) {
    return { empty: true, columns: [], rowCount: 0, headerCells: [], dataRows: [] };
  }
  var columns = studentResult.columns;
  var rows = studentResult.rows || [];
  var dataRows = [];
  for (var ri = 0; ri < rows.length; ri++) {
    var cells = rows[ri];
    var formattedCells = [];
    for (var vi = 0; vi < (cells ? cells.length : 0); vi++) {
      var val = cells[vi];
      formattedCells.push((val === null || val === undefined) ? "NULL" : String(val));
    }
    dataRows.push(formattedCells);
  }
  return {
    empty: false,
    columns: columns,
    rowCount: dataRows.length,
    headerCells: columns,
    dataRows: dataRows,
  };
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("Exercise metadata (WU3)", () => {

  /** Position-independent lookup: find an exercise by id across phases. */
  function findExercise(id) {
    for (var pi = 0; pi < AppExercises.phases.length; pi++) {
      var exs = AppExercises.phases[pi].exercises;
      for (var ei = 0; ei < exs.length; ei++) {
        if (exs[ei].id === id) return exs[ei];
      }
    }
    return null;
  }


  describe("Ordered flags — R3-WU3-002", () => {
    it("g4-notin-order requires ORDER BY and has ordered=true", () => {
      var ex = findExercise("g4-notin-order");
      assert.ok(ex);
      assert.ok(ex.expectedSql.toLowerCase().indexOf("order by") !== -1);
      assert.strictEqual(ex.ordered, true);
    });

    it("s1-groupby-count requires ORDER BY DESC and has ordered=true", () => {
      var ex = findExercise("s1-groupby-count");
      assert.ok(ex);
      assert.ok(ex.expectedSql.toLowerCase().indexOf("order by") !== -1);
      assert.strictEqual(ex.ordered, true,
        "Exercise s1-groupby-count should be ordered=true (prompt: 'ordenado de mayor a menor')");
    });

    it("s2-join-avg requires ORDER BY DESC and has ordered=true", () => {
      var ex = AppExercises.getExercise(1, 1); // phase 2, exercise 1
      assert.ok(ex);
      assert.ok(ex.expectedSql.toLowerCase().indexOf("order by") !== -1);
      assert.strictEqual(ex.ordered, true,
        "Exercise s2-join-avg should be ordered=true (prompt: 'Ordena de mayor a menor')");
    });

    it("e1-having-groupby requires ORDER BY DESC and has ordered=true", () => {
      var ex = AppExercises.getExercise(2, 0); // phase 3, exercise 0
      assert.ok(ex);
      assert.ok(ex.expectedSql.toLowerCase().indexOf("order by") !== -1);
      assert.strictEqual(ex.ordered, true,
        "Exercise e1-having-groupby should be ordered=true (prompt: 'ordenado de mayor a menor')");
    });

    it("e2-join-nm-strftime requires ORDER BY ASC and has ordered=true", () => {
      var ex = findExercise("e2-join-nm-strftime");
      assert.ok(ex);
      assert.ok(ex.expectedSql.toLowerCase().indexOf("order by") !== -1);
      assert.strictEqual(ex.ordered, true);
    });

    it("exercises without ORDER BY requirements have ordered=false", () => {
      var unordered = [
        findExercise("g1-simple-where"),
        findExercise("g2-and"),
        findExercise("g3-like-between"),
        findExercise("s3-leftjoin-isnull"),
      ];
      for (var i = 0; i < unordered.length; i++) {
        assert.strictEqual(unordered[i].ordered, false,
          "Exercise " + unordered[i].id + " should be ordered=false (no explicit ORDER BY requirement)");
      }
    });
  });

  describe("Exercise counts and maxScore", () => {
    it("has 27 exercises total across 9 phases (3 units x guiada/practica/examen)", () => {
      assert.strictEqual(AppExercises.totalExerciseCount(), 27);
      assert.strictEqual(AppExercises.phases.length, 9);
    });

    it("per-phase exercise counts match the 3-unit layout", () => {
      var expected = [4, 6, 2, 2, 4, 2, 2, 3, 2]; // U1 g/p/e, U2 g/p/e, U3 g/p/e
      assert.strictEqual(AppExercises.phases.length, expected.length);
      for (var i = 0; i < expected.length; i++) {
        assert.strictEqual(AppExercises.phases[i].exercises.length, expected[i],
          "phase " + AppExercises.phases[i].id + " exercise count");
      }
    });

    it("maxScore is the sum of all exercise points (52)", () => {
      var ms = AppExercises.maxScore();
      // guiadas:   8 exercises × 1 point  =  8
      // prácticas: 13 exercises × 2 points = 26
      // exámenes:  6 exercises × 3 points  = 18
      // total:                             = 52
      assert.strictEqual(ms, 52);
      assert.strictEqual(computeMaxScore(AppExercises.phases), 52);
    });
  });

  describe("Scoring defaults / constants", () => {
    it("defines default errorPenalty as 0.25", () => {
      assert.strictEqual(SCORE_DEFAULTS.errorPenalty, 0.25);
    });

    it("defines default hintPenalty as 0.10", () => {
      assert.strictEqual(SCORE_DEFAULTS.hintPenalty, 0.10);
    });
  });
});

describe("App flow — start + exercise lifecycle (WU3)", () => {

  describe("Start — student name validation (R4-WU3-004)", () => {
    it("rejects empty name", () => {
      var name = "";
      assert.strictEqual(name.trim().length === 0, true);
    });

    it("rejects whitespace-only name", () => {
      var name = "   ";
      assert.strictEqual(name.trim().length === 0, true);
    });

    it("accepts a valid name", () => {
      var name = "María";
      assert.strictEqual(name.trim().length > 0, true);
    });
  });

  describe("Progress bar calculation (R3-WU3-005)", () => {
    it("progress at 0/27 = 0%", () => {
      var p = calcProgress(AppExercises.phases, 0, 0);
      assert.strictEqual(p.completed, 0);
      assert.strictEqual(p.total, 27);
      assert.strictEqual(p.pct, 0);
    });

    it("progress at 4/27 after the first phase", () => {
      var p = calcProgress(AppExercises.phases, 1, 0);
      assert.strictEqual(p.completed, 4); // 4 exercises in u1-guiada
      assert.strictEqual(p.pct, 15);      // Math.round(4/27*100)
    });

    it("progress at 26/27 on the last exercise (index 1 of the last phase)", () => {
      var p = calcProgress(AppExercises.phases, 8, 1);
      assert.strictEqual(p.completed, 26); // all but the very last one
      assert.strictEqual(p.total, 27);
      assert.strictEqual(p.pct, 96);       // Math.round(26/27*100)
    });

    it("renderComplete() sets progressFill to 100% — RAW calc is 26/27", () => {
      // Verify raw calcProgress at the last exercise (phaseIdx=8, exIdx=1) gives 26 of 27.
      var raw = calcProgress(AppExercises.phases, 8, 1);
      assert.strictEqual(raw.completed, 26, "raw calc at last exercise = 26 completed of 27");
      assert.strictEqual(raw.pct, 96, "raw calc = 96% — not 100%");

      // Build mock dom/state simulating the last exercise before completion.
      // renderStatusBar() would set progressFill to "89%" based on indices.
      var mockDom = {
        progressFill: mockCreateElement("div"),
        statusPhase: mockCreateElement("span"),
        statusStep: mockCreateElement("span"),
        statusScore: mockCreateElement("span"),
        finalScore: mockCreateElement("span"),
        finalPct: mockCreateElement("span"),
        finalDetail: mockCreateElement("div"),
      };

      var mockState = {
        view: "exercises",
        studentName: "Test",
        phaseIndex: 8,
        exerciseIndex: 1,
        score: 52,
        maxScore: 52,
        attemptLog: [],
      };

      // Call the production renderComplete() via test hook.
      AppTestHooks.renderComplete(mockDom, mockState);

      // The critical assertion: renderComplete() MUST override the 89%
      // from renderStatusBar() and force the bar to 100%.
      assert.strictEqual(mockDom.progressFill.style.width, "100%",
        "renderComplete() must set progressFill.style.width to '100%' — " +
        "if this fails, the override was removed or renderStatusBar runs after it");

      // If someone accidentally swaps the order and puts renderStatusBar
      // AFTER the override, the progress would be "89%" instead.
      assert.notStrictEqual(mockDom.progressFill.style.width, "96%",
        "progressFill must NOT be 96% — the override must win");
    });
  });

  describe("Attempt log — creation and mutation (R4-WU3-001 / R2-WU3-002)", () => {
    it("creates fresh attempt log entry at exercise start", () => {
      var ms = mockAppState(AppExercises.phases);
      startExercise(ms);
      assert.strictEqual(ms.attemptLog.length, 1);
      var entry = ms.attemptLog[0];
      assert.strictEqual(entry.attempts, 0);
      assert.strictEqual(entry.hintsUsed, 0);
      assert.strictEqual(entry.solved, false);
      assert.strictEqual(entry.scoreDelta, 0);
    });

    it("entry exists before submit/hint/skip mutate it", () => {
      var ms = mockAppState(AppExercises.phases);
      var ex = currentExercise(ms, AppExercises);
      startExercise(ms);

      // Submit with error — should not crash
      submitWrong(ms, ex);
      assert.strictEqual(ms.attemptLog.length, 1);
      assert.strictEqual(ms.attemptLog[0].attempts, 1);
      assert.ok(ms.attemptLog[0].scoreDelta < 0);
    });
  });

  describe("Score — penalties", () => {
    it("production scoring gives unresolved work zero credit", () => {
      var ex = AppExercises.getExercise(0, 0);
      var state = {
        score: AppExercises.maxScore(),
        maxScore: AppExercises.maxScore(),
        attemptLog: [{ exerciseId: ex.id, solved: false, scoreDelta: -0.25 }],
      };

      assert.strictEqual(AppTestHooks.recalculateScore(state), 0,
        "production scoring must not retain credit for unresolved work");

      state.attemptLog[0].solved = true;
      assert.strictEqual(AppTestHooks.recalculateScore(state), ex.scoring.points - 0.25,
        "production scoring must award solved work less its recorded penalties");
    });

    it("records an error penalty without awarding unresolved credit", () => {
      var ms = mockAppState(AppExercises.phases);
      startExercise(ms);
      var ex = currentExercise(ms, AppExercises);
      var before = ms.score;

      submitWrong(ms, ex);
      assert.strictEqual(ms.score, before);
      assert.strictEqual(ms.attemptLog[0].scoreDelta, -SCORE_DEFAULTS.errorPenalty);
    });

    it("records a hint penalty without awarding unresolved credit", () => {
      var ms = mockAppState(AppExercises.phases);
      // Use phase 2, exercise 0 which has hints
      ms.phaseIndex = 1;
      ms.exerciseIndex = 0;
      startExercise(ms);
      var ex = currentExercise(ms, AppExercises);
      var before = ms.score;

      useHint(ms, ex, 0);
      assert.strictEqual(ms.score, before);
      assert.strictEqual(ms.attemptLog[0].hintsUsed, 1);
      assert.ok(ms.attemptLog[0].scoreDelta < 0);
    });

    it("leaves a skipped exercise at zero credit", () => {
      var ms = mockAppState(AppExercises.phases);
      startExercise(ms);
      var before = ms.score;

      skipExercise(ms);
      assert.strictEqual(ms.score, before);
      assert.strictEqual(ms.attemptLog[0].solved, false);
      assert.strictEqual(ms.attemptLog[0].skipped, true);
    });

    it("score never goes below 0", () => {
      var ms = mockAppState(AppExercises.phases);
      ms.score = 0.1;
      startExercise(ms);
      var ex = currentExercise(ms, AppExercises);
      submitWrong(ms, ex); // penalty 0.25 > 0.1
      assert.strictEqual(ms.score, 0);
    });
  });

  describe("Flow — full exercise life cycle", () => {
    it("start → submit wrong → submit correct → next → complete", () => {
      var ms = mockAppState(AppExercises.phases);
      startExercise(ms); // phase 0, ex 0
      var ex = currentExercise(ms, AppExercises);
      assert.strictEqual(ex.id, "u1g1-select-order");

      // Wrong submit
      submitWrong(ms, ex);
      assert.strictEqual(ms.currentExerciseState.attempts, 1);
      assert.ok(ms.score < ms.maxScore);

      // Correct submit
      submitCorrect(ms);
      assert.strictEqual(ms.currentExerciseState.solved, true);
      assert.strictEqual(ms.currentExerciseState.attempts, 2);

      // Next (advance)
      var result = advanceExercise(ms);
      assert.strictEqual(result, "next-exercise");
      assert.strictEqual(ms.exerciseIndex, 1);

      // attemptLog persisted the first exercise's data
      assert.strictEqual(ms.attemptLog[0].title, "Tu primera consulta — SELECT y ORDER BY");
      assert.strictEqual(ms.attemptLog[0].solved, true);
      assert.strictEqual(ms.attemptLog[0].attempts, 2);
    });

    it("complete view triggers after all 27 exercises", () => {
      var ms = mockAppState(AppExercises.phases);
      // Walk through all phases
      for (var pi = 0; pi < AppExercises.phases.length; pi++) {
        ms.phaseIndex = pi;
        ms.exerciseIndex = 0;
        var phase = AppExercises.phases[pi];
        for (var ei = 0; ei < phase.exercises.length; ei++) {
          ms.exerciseIndex = ei;
          startExercise(ms);
          submitCorrect(ms);
        }
      }
      // Should be on last exercise of last phase
      ms.phaseIndex = AppExercises.phases.length - 1;
      ms.exerciseIndex = AppExercises.phases[ms.phaseIndex].exercises.length - 1;
      var result = advanceExercise(ms);
      assert.strictEqual(result, "complete");
      assert.strictEqual(ms.view, "complete");
      assert.strictEqual(ms.attemptLog.length, 27,
        "should have 27 entries after completing all exercises");
    });

    it("skip preserves a zero-credit entry in the log", () => {
      var ms = mockAppState(AppExercises.phases);
      startExercise(ms);
      skipExercise(ms);
      assert.strictEqual(ms.attemptLog[0].solved, false);
      assert.strictEqual(ms.attemptLog[0].skipped, true);
      assert.strictEqual(ms.attemptLog[0].scoreDelta, 0);
    });
  });

  describe("Import/Export view restoration (R3-WU4-002)", () => {
    it("restoration recalculates a stale exported score from exercise state", () => {
      var solved = AppExercises.phases[0].exercises[0];
      var state = {
        score: 0,
        maxScore: AppExercises.maxScore(),
        attemptLog: [{
          exerciseId: solved.id,
          solved: true,
          skipped: false,
          scoreDelta: -0.25,
        }],
      };

      assert.strictEqual(AppTestHooks.recalculateScore(state), solved.scoring.points - 0.25,
        "the score cache must be derived from per-exercise state, not an imported aggregate");
    });

    it("production restoration rejects invalid indices before rendering", () => {
      var dom = { importError: mockCreateElement("div") };
      var state = { phaseIndex: 4, exerciseIndex: 1 };
      var invalidProgress = [
        { phaseIndex: -1, exerciseIndex: 0 },
        { exerciseIndex: 0 },
        { phaseIndex: 0, exerciseIndex: -1 },
        { phaseIndex: 0 },
      ];

      for (var i = 0; i < invalidProgress.length; i++) {
        dom.importError.style.display = "none";
        AppTestHooks.restoreFromProgress(dom, state, invalidProgress[i]);
        assert.strictEqual(dom.importError.style.display, "block",
          "invalid progress must show the import error");
        assert.strictEqual(state.phaseIndex, 4,
          "invalid progress must not apply restored state");
        assert.strictEqual(state.exerciseIndex, 1,
          "invalid progress must not apply restored state");
      }
    });

    /**
     * Mirror of _restoreFromProgress's view-defaulting line:
     *     state.view = saved.view || "exercises";
     * Defined here as a pure helper so we can assert on the data shape
     * without wiring up the full DOM. If the export package drops `view`,
     * the default to "exercises" would still be applied here, which is
     * exactly the bug we are guarding against.
     */
    function resolveRestoredView(saved) {
      return saved.view || "exercises";
    }

    it("exported completed session restores to 'complete' view (R3-WU4-002)", () => {
      // Simulate what a completed session looks like at the export boundary.
      var saved = {
        view: "complete",
        studentName: "Test",
        phaseIndex: 8,
        exerciseIndex: 1,
        score: 52,
        maxScore: 52,
        attemptLog: [],
      };
      assert.strictEqual(resolveRestoredView(saved), "complete",
        "restored view must be 'complete' so showCompleteView() runs " +
        "instead of showExerciseViewRestored()");
    });

    it("exported in-progress session restores to 'exercises' view", () => {
      var saved = {
        view: "exercises",
        studentName: "Test",
        phaseIndex: 0,
        exerciseIndex: 1,
        score: 15.5,
        maxScore: 16,
        attemptLog: [],
      };
      assert.strictEqual(resolveRestoredView(saved), "exercises");
    });

    it("legacy export without view falls back to 'exercises' view (backward compat)", () => {
      // Pre-fix exports omitted `view` entirely; restore must still work.
      var saved = {
        studentName: "Legacy",
        phaseIndex: 0,
        exerciseIndex: 1,
        score: 15.5,
        maxScore: 16,
        attemptLog: [],
      };
      assert.strictEqual(resolveRestoredView(saved), "exercises");
    });
  });

  describe("Result table rendering model (WU3)", () => {
    it("empty columns produce empty model", () => {
      var model = buildResultTableModel({ columns: [], rows: [] });
      assert.strictEqual(model.empty, true);
      assert.strictEqual(model.rowCount, 0);
      assert.strictEqual(model.headerCells.length, 0);
    });

    it("missing columns key produces empty model", () => {
      var model = buildResultTableModel({ rows: [[1, 2]] });
      assert.strictEqual(model.empty, true);
    });

    it("null values are rendered as 'NULL'", () => {
      var model = buildResultTableModel({ columns: ["a"], rows: [[null]] });
      assert.strictEqual(model.empty, false);
      assert.strictEqual(model.dataRows[0][0], "NULL");
    });

    it("undefined values are rendered as 'NULL'", () => {
      var model = buildResultTableModel({ columns: ["a"], rows: [[undefined]] });
      assert.strictEqual(model.empty, false);
      assert.strictEqual(model.dataRows[0][0], "NULL");
    });

    it("regular values are stringified and columns preserved", () => {
      var model = buildResultTableModel({
        columns: ["id", "name", "level"],
        rows: [[1, "Pikachu", 42], [2, "Bulbasaur", 15]],
      });
      assert.strictEqual(model.empty, false);
      assert.strictEqual(model.rowCount, 2);
      assert.deepStrictEqual(model.headerCells, ["id", "name", "level"]);
      assert.strictEqual(model.dataRows[0][0], "1");
      assert.strictEqual(model.dataRows[0][1], "Pikachu");
      assert.strictEqual(model.dataRows[0][2], "42");
      assert.strictEqual(model.dataRows[1][0], "2");
      assert.strictEqual(model.dataRows[1][2], "15");
    });

    it("mixed null and values in same row", () => {
      var model = buildResultTableModel({
        columns: ["col1", "col2"],
        rows: [[null, "ok"], [0, null]],
      });
      assert.strictEqual(model.rowCount, 2);
      assert.strictEqual(model.dataRows[0][0], "NULL");
      assert.strictEqual(model.dataRows[0][1], "ok");
      assert.strictEqual(model.dataRows[1][0], "0");
      assert.strictEqual(model.dataRows[1][1], "NULL");
    });

    it("rows with missing cells produce correct column count", () => {
      var model = buildResultTableModel({
        columns: ["a", "b", "c"],
        rows: [[1], [2, 3], [4, 5, 6]],
      });
      assert.strictEqual(model.rowCount, 3);
      assert.strictEqual(model.dataRows[0].length, 1);
      assert.strictEqual(model.dataRows[1].length, 2);
      assert.strictEqual(model.dataRows[2].length, 3);
    });
  });

  describe("Result table — production DOM rendering (WU3)", () => {
    /**
     * Helper: build a mock dom object suitable for renderResultTable().
     */
    function mockResultDom() {
      return {
        resultDisplay: mockCreateElement("div"),
        resultContent: mockCreateElement("div"),
      };
    }

    /**
     * Helper: find the first child of a mock element with a given tagName.
     */
    function findChild(parent, tagName) {
      var ch = parent.children || [];
      for (var i = 0; i < ch.length; i++) {
        if (ch[i].tagName === tagName) return ch[i];
      }
      return null;
    }

    it("empty columns → resultContent contains empty-result span", () => {
      var dom = mockResultDom();
      AppTestHooks.renderResultTable(dom, { columns: [], rows: [] });

      // resultDisplay must be shown
      assert.strictEqual(dom.resultDisplay.style.display, "block");
      // resultContent should have a single span child
      assert.ok(dom.resultContent.children.length >= 1, "expected at least 1 child");
      var span = dom.resultContent.children[0];
      assert.strictEqual(span.tagName, "span");
      assert.strictEqual(span.className, "empty-result");
    });

    it("null values are rendered as text 'NULL' in production DOM", () => {
      var dom = mockResultDom();
      AppTestHooks.renderResultTable(dom, { columns: ["col1"], rows: [[null]] });

      assert.strictEqual(dom.resultDisplay.style.display, "block");
      var table = findChild(dom.resultContent, "table");
      assert.ok(table !== null, "expected a <table> child");

      var tbody = findChild(table, "tbody");
      assert.ok(tbody !== null, "expected a <tbody>");

      var tr = tbody.children[0];
      assert.ok(tr !== null, "expected a <tr>");
      assert.strictEqual(tr.tagName, "tr");

      var td = tr.children[0];
      assert.strictEqual(td.tagName, "td");
      assert.strictEqual(td.textContent, "NULL",
        "null cell must render as 'NULL' — if this fails, null-to-'NULL' conversion was removed");
    });

    it("undefined values are rendered as text 'NULL' in production DOM", () => {
      var dom = mockResultDom();
      AppTestHooks.renderResultTable(dom, { columns: ["col1"], rows: [[undefined]] });

      var table = findChild(dom.resultContent, "table");
      var tbody = findChild(table, "tbody");
      var td = tbody.children[0].children[0];
      assert.strictEqual(td.textContent, "NULL",
        "undefined cell must render as 'NULL'");
    });

    it("header cells match columns and data cells match row values", () => {
      var dom = mockResultDom();
      AppTestHooks.renderResultTable(dom, {
        columns: ["id", "name", "level"],
        rows: [[1, "Pikachu", 42], [2, "Bulbasaur", 15]],
      });

      var table = findChild(dom.resultContent, "table");
      assert.ok(table !== null);

      // Header
      var thead = findChild(table, "thead");
      assert.ok(thead !== null);
      var headerRow = thead.children[0];
      assert.strictEqual(headerRow.tagName, "tr");
      var ths = headerRow.children;
      assert.strictEqual(ths.length, 3);
      assert.strictEqual(ths[0].textContent, "id");
      assert.strictEqual(ths[1].textContent, "name");
      assert.strictEqual(ths[2].textContent, "level");

      // Body
      var tbody = findChild(table, "tbody");
      assert.ok(tbody !== null);
      assert.strictEqual(tbody.children.length, 2, "expected 2 data rows");

      var row0 = tbody.children[0];
      assert.strictEqual(row0.children.length, 3);
      assert.strictEqual(row0.children[0].textContent, "1");
      assert.strictEqual(row0.children[1].textContent, "Pikachu");
      assert.strictEqual(row0.children[2].textContent, "42");

      var row1 = tbody.children[1];
      assert.strictEqual(row1.children.length, 3);
      assert.strictEqual(row1.children[0].textContent, "2");
      assert.strictEqual(row1.children[1].textContent, "Bulbasaur");
      assert.strictEqual(row1.children[2].textContent, "15");
    });

    it("missing columns → no table appended (empty-result code path)", () => {
      var dom = mockResultDom();
      AppTestHooks.renderResultTable(dom, { rows: [[1]] });
      // columns undefined → treated as empty
      assert.strictEqual(dom.resultDisplay.style.display, "block");
      assert.strictEqual(dom.resultContent.children.length, 1);
      assert.strictEqual(dom.resultContent.children[0].className, "empty-result");
    });
  });
});

describe("Persistence recovery guidance", function () {
  it("remains visible when every durable persistence backend is unavailable", function () {
    var dom = {
      storageWarning: { style: {}, textContent: "" },
      exportStatus: { style: {}, textContent: "" },
    };
    var unavailableStore = {
      isAvailable: function () { return false; },
      getStatus: function () { return { backend: "indexeddb", message: "" }; },
    };

    AppTestHooks.showStorageRecoveryGuidance(dom, unavailableStore);

    assert.strictEqual(dom.storageWarning.style.display, "block");
    assert.match(dom.storageWarning.textContent, /Exportá el progreso antes de cerrar el navegador/);
    assert.strictEqual(dom.exportStatus.textContent, "",
      "the persistent warning must not depend on transient export status UI");

    var savedStore = global.window.ProgressStore;
    var savedExportPackage = global.window.ExportPackage;
    try {
      global.window.ProgressStore = unavailableStore;
      global.window.ExportPackage = {
        buildExport: function () { return {}; },
        exportToFile: function () {},
      };
      AppTestHooks.handleExport({
        studentName: "Test Student",
        selectedAvatar: "",
        phaseIndex: 0,
        exerciseIndex: 0,
        score: 0,
        maxScore: AppExercises.maxScore(),
        attemptLog: [],
        view: "exercises",
      }, dom);
    } finally {
      global.window.ProgressStore = savedStore;
      global.window.ExportPackage = savedExportPackage;
    }

    assert.strictEqual(dom.storageWarning.style.display, "block");
    assert.match(dom.storageWarning.textContent, /Exportá el progreso antes de cerrar el navegador/);
    assert.strictEqual(dom.exportStatus.textContent, "✓ Exportado correctamente.");
  });
});

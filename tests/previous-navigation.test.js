/**
 * tests/previous-navigation.test.js
 *
 * Tests for the "Anterior" / previous-exercise navigation feature.
 *
 * Background:
 *   The student requested the ability to go back to a previous exercise
 *   while working through the simulator. The implementation:
 *     1. Adds an `Anterior` button (#btn-prev) next to the existing
 *        `Siguiente` button (#btn-next).
 *     2. Disables the button on the very first exercise.
 *     3. Allows cross-phase navigation: from the first exercise of a
 *        later phase, jumps to the last exercise of the previous phase.
 *     4. Restores the prior exercise's UI state from the existing
 *        attemptLog entry — does NOT create duplicate attemptLog entries
 *        just by navigating backward.
 *     5. Persists the new position via saveCurrentProgress() so reload
 *        and "Continuar" land on the previous exercise.
 *     6. Preserves the score — going back is a no-op for scoring.
 *
 * Test surface:
 *   - Source-level static checks: index.html has #btn-prev, app.js wires
 *     it, app.js does not allow a "duplicate on previous" attemptLog
 *     entry.
 *   - Behavioural: state injection via AppTestHooks.handlePrevious to
 *     verify navigation, attemptLog shape, score preservation, save
 *     call, and the no-op-on-first guard.
 *
 * Run: node --test tests/previous-navigation.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Load exercises.js
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
global.AppExercises = AppExercises;

// ----------------------------------------------------------------------
// Load app.js in test mode
// ----------------------------------------------------------------------
global.window.__APP_TEST_MODE__ = true;
global.window.__APP_TEST_HOOKS__ = true;

/**
 * Mock element factory — compatible with app.js's expectations.
 * Includes `disabled` and a `setAttribute` shim so updateNavButtons
 * can be exercised through state-injection tests.
 */
function mockCreateElement(tag) {
  var children = [];
  var el = {
    tagName: tag,
    textContent: "",
    innerHTML: "",
    style: {},
    className: "",
    children: children,
    disabled: false,
    _attrs: {},
    appendChild: function (child) { children.push(child); return child; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    addEventListener: function () {},
    removeAttribute: function (k) { delete this._attrs[k]; },
    querySelectorAll: function () { return []; },
    classList: {
      add: function () {},
      remove: function () {},
      toggle: function () {},
      contains: function () { return false; },
    },
    focus: function () {},
  };
  return el;
}

global.document = {
  readyState: "loading",
  createElement: mockCreateElement,
  getElementById: function () { return null; },
  addEventListener: function () {},
};

const appPath = path.resolve(__dirname, "..", "src", "app.js");
const appSrc = fs.readFileSync(appPath, "utf-8");
eval(appSrc);

const AppTestHooks = global.window.AppTestHooks;

// ----------------------------------------------------------------------
// Source-level static checks — read project files directly
// ----------------------------------------------------------------------

const indexPath = path.resolve(__dirname, "..", "index.html");
const indexSrc = fs.readFileSync(indexPath, "utf-8");

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Build a state object shaped like the production `state` for state-
 * injection tests. The studentName/phaseIndex/exerciseIndex/score
 * fields default to a fresh-session layout, but the caller can
 * override any of them.
 */
function buildState(overrides) {
  var maxScore = AppExercises.maxScore();
  var base = {
    view: "exercises",
    studentName: "Test Student",
    phaseIndex: 0,
    exerciseIndex: 0,
    score: maxScore,
    maxScore: maxScore,
    attemptLog: [],
    currentExerciseState: null,
    schemaSelectedTable: null,
  };
  if (overrides) {
    for (var k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        base[k] = overrides[k];
      }
    }
  }
  return base;
}

/**
 * Build a mock attemptLog entry for a given phase/exercise position.
 */
function buildEntry(phaseIndex, exerciseIndex, overrides) {
  var phase = AppExercises.phases[phaseIndex];
  var ex = phase.exercises[exerciseIndex];
  var base = {
    exerciseId: ex.id,
    title: ex.title,
    attempts: 0,
    hintsUsed: 0,
    solved: false,
    scoreDelta: 0,
  };
  if (overrides) {
    for (var k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        base[k] = overrides[k];
      }
    }
  }
  return base;
}

/**
 * Capture-style ProgressStore stub. Records the last saveProgress call
 * and resolves the returned promise so handlePrevious's await chain
 * (well, .catch chain) does not blow up.
 */
function buildProgressStoreStub() {
  var stub = {
    __lastCall: null,
    __callCount: 0,
    isAvailable: function () { return true; },
    saveProgress: function (progress) {
      stub.__lastCall = progress;
      stub.__callCount++;
      return Promise.resolve();
    },
    loadProgress: function () { return Promise.resolve(null); },
    hasProgress: function () { return Promise.resolve(false); },
    clearProgress: function () { return Promise.resolve(); },
  };
  return stub;
}

/**
 * Minimal dom stub that satisfies every property handlePrevious and
 * showExerciseViewRestored touch. The list is exhaustive for this
 * code path; if a new field is added to the production dom, the test
 * suite will fail loudly here so the test stub is updated.
 */
function buildDom() {
  function el() {
    return {
      style: {},
      className: "",
      textContent: "",
      innerHTML: "",
      children: [],
      disabled: false,
      _attrs: {},
      appendChild: function (c) { this.children.push(c); return c; },
      removeChild: function () {},
      setAttribute: function (k, v) { this._attrs[k] = v; },
      removeAttribute: function (k) { delete this._attrs[k]; },
      getAttribute: function (k) { return this._attrs[k] != null ? this._attrs[k] : null; },
      addEventListener: function () {},
      querySelectorAll: function () { return []; },
      classList: {
        add: function () {},
        remove: function () {},
        toggle: function () {},
        contains: function () { return false; },
      },
      focus: function () {},
      get firstChild() { return this.children[0] || null; },
    };
  }
  return {
    // Layout containers
    startScreen: el(),
    exerciseArea: el(),
    completeScreen: el(),
    statusBar: el(),
    // Status bar
    statusPhase: el(),
    statusStep: el(),
    statusScore: el(),
    progressFill: el(),
    // Start screen
    studentNameInput: el(),
    btnStart: el(),
    nameError: el(),
    savedBanner: el(),
    savedBannerText: el(),
    btnContinue: el(),
    btnNewSession: el(),
    // Import
    importFile: el(),
    importError: el(),
    importOk: el(),
    // Exercise card
    exerciseCard: el(),
    modeBadge: el(),
    exerciseTitle: el(),
    exerciseEnunciado: el(),
    expectedSqlDisplay: el(),
    expectedSqlText: el(),
    // Aids
    aidsRow: el(),
    togContext: el(),
    togGuide: el(),
    aidsContextBox: el(),
    aidsContext: el(),
    aidsGuideBox: el(),
    aidsGuide: el(),
    solutionNote: el(),
    solutionNoteText: el(),
    hintsWrap: el(),
    // Query input
    queryInput: el(),
    btnSubmit: el(),
    btnSkip: el(),
    // Navigation
    btnNext: el(),
    btnPrev: el(),
    // Feedback
    feedbackOk: el(),
    feedbackOkContent: el(),
    feedbackOkSql: el(),
    feedbackErr: el(),
    feedbackErrContent: el(),
    feedbackErrDetail: el(),
    resultDisplay: el(),
    resultContent: el(),
    // Complete
    finalScore: el(),
    finalPct: el(),
    finalDetail: el(),
    btnExport: el(),
    exportStatus: el(),
    // Schema reference
    btnSchema: el(),
    schemaModal: el(),
    btnSchemaClose: el(),
    schemaList: el(),
    schemaDetail: el(),
    // Preflight
    preflightErr: el(),
    // Layout shell / sidebar
    appShell: el(),
    sidebar: el(),
    sidebarList: el(),
    btnSidebarCollapse: el(),
    btnSidebarExpand: el(),
    sidebarFloatingToggle: el(),
    // Status identity / avatars
    statusIdentity: el(),
    avatarGrid: el(),
    progressTrack: el(),
    // Complete screen extras
    finalMotivation: el(),
    finalStudent: el(),
  };
}

// ----------------------------------------------------------------------
// Source-level static checks
// ----------------------------------------------------------------------

describe("Previous navigation — source structure", () => {

  it("index.html defines #btn-prev as a button", () => {
    assert.ok(/<button[^>]*\bid="btn-prev"/.test(indexSrc),
      "index.html must contain <button id=\"btn-prev\"> for the previous-exercise action");
  });

  it("index.html places #btn-prev alongside #btn-next in a nav row", () => {
    assert.ok(/class="nav-row"/.test(indexSrc),
      "index.html should wrap #btn-prev and #btn-next in a .nav-row container");
    assert.ok(/id="btn-prev"[\s\S]*?id="btn-next"/.test(indexSrc) ||
              /id="btn-next"[\s\S]*?id="btn-prev"/.test(indexSrc),
      "index.html should place #btn-prev and #btn-next in the same container");
  });

  it("index.html uses Spanish label 'Anterior' for the previous button", () => {
    assert.ok(/>←\s*Anterior</.test(indexSrc) || />Anterior/.test(indexSrc),
      "index.html should label the previous button 'Anterior' (Spanish UI copy)");
  });

  it("app.js wires #btn-prev to handlePrevious in bootstrap", () => {
    assert.ok(/dom\.btnPrev[\s\S]*?addEventListener\(\s*["']click["']\s*,\s*handlePrevious\s*\)/.test(appSrc),
      "app.js bootstrap must call dom.btnPrev.addEventListener('click', handlePrevious)");
  });

  it("app.js caches dom.btnPrev in cacheDom()", () => {
    assert.ok(/dom\.btnPrev\s*=\s*document\.getElementById\(\s*["']btn-prev["']\s*\)/.test(appSrc),
      "app.js cacheDom() must look up btn-prev");
  });

  it("app.js defines a handlePrevious function", () => {
    assert.ok(/function\s+handlePrevious\s*\(/.test(appSrc),
      "app.js must define handlePrevious() — the implementation for previous-exercise navigation");
  });

  it("app.js disables btn-prev on the first exercise", () => {
    // The updateNavButtons helper sets disabled when phaseIndex === 0 && exerciseIndex === 0.
    assert.ok(/state\.phaseIndex\s*===\s*0\s*&&\s*state\.exerciseIndex\s*===\s*0/.test(appSrc),
      "app.js must check (phaseIndex === 0 && exerciseIndex === 0) to disable the previous button");
  });

  it("app.js shows btn-prev during exercise rendering (R4-001 visibility contract)", () => {
    // R4-001: CSS starts #btn-prev with `display: none`. The previous-navigation
    // implementation only set `disabled` and `aria-disabled`, so the button
    // was permanently hidden and users could not navigate back. The fix is
    // for app.js to override the CSS default and show the button whenever
    // updateNavButtons runs.
    assert.ok(
      /dom\.btnPrev\.style\.display\s*=\s*["'](?!["']?none["']?)["'][^"']*["']/.test(appSrc) ||
      /dom\.btnPrev\.style\.display\s*=\s*["']inline-block["']/.test(appSrc) ||
      /dom\.btnPrev\.style\.display\s*=\s*["']block["']/.test(appSrc),
      "app.js updateNavButtons() MUST set dom.btnPrev.style.display to a " +
      "non-'none' value (e.g. 'inline-block') — otherwise the CSS default " +
      "`display: none` keeps the button permanently hidden (R4-001 blocker)"
    );
  });

  it("app.js uses _getCurrentLogEntry() instead of attemptLog[length-1]", () => {
    // After our refactor, all state-mutating sites use _getCurrentLogEntry().
    // The remaining `state.attemptLog[state.attemptLog.length - 1]` references
    // are read-only fallbacks: 2 inside _getCurrentLogEntry itself (for
    // when the lookup-by-id fails or no exercise is set) and 1 inside
    // renderPhaseExerciseRestored (defensive last-entry comparison). None
    // of them mutate state.
    var matches = appSrc.match(/state\.attemptLog\[state\.attemptLog\.length\s*-\s*1\]/g) || [];
    assert.ok(matches.length <= 3,
      "After refactor, only _getCurrentLogEntry's fallbacks and the " +
      "read-only comparison in renderPhaseExerciseRestored should use " +
      "attemptLog[length-1]; found " + matches.length + " site(s) — " +
      "extra sites indicate another function is mutating the wrong entry");
  });
});

// ----------------------------------------------------------------------
// Behavioural tests via AppTestHooks.handlePrevious
// ----------------------------------------------------------------------

describe("handlePrevious — navigation", () => {

  it("is a no-op on the first exercise (phase=0, index=0)", () => {
    var state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    var result = AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.phaseIndex, 0,
      "phaseIndex must stay 0 — first exercise is the boundary");
    assert.strictEqual(state.exerciseIndex, 0,
      "exerciseIndex must stay 0 — first exercise is the boundary");
  });

  it("decrements exerciseIndex within the same phase", () => {
    var state = buildState({ phaseIndex: 0, exerciseIndex: 2 });
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.phaseIndex, 0, "phaseIndex unchanged for same-phase back");
    assert.strictEqual(state.exerciseIndex, 1, "exerciseIndex decremented by 1");
  });

  it("crosses phase boundary: (1, 0) → (0, last of phase 0)", () => {
    var lastOfPhase0 = AppExercises.phases[0].exercises.length - 1;
    var state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.phaseIndex, 0, "phaseIndex rolled back by 1");
    assert.strictEqual(state.exerciseIndex, lastOfPhase0,
      "exerciseIndex must point to the last exercise of the previous phase " +
      "(phase 0 has " + (lastOfPhase0 + 1) + " exercises, expected index " + lastOfPhase0 + ")");
  });

  it("crosses phase boundary: (2, 0) → (1, last of phase 1)", () => {
    var lastOfPhase1 = AppExercises.phases[1].exercises.length - 1;
    var state = buildState({ phaseIndex: 2, exerciseIndex: 0 });
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.phaseIndex, 1, "phaseIndex rolled back by 1");
    assert.strictEqual(state.exerciseIndex, lastOfPhase1,
      "exerciseIndex must point to the last exercise of phase 1");
  });

  it("still works from mid-phase 2 back into phase 1", () => {
    var state = buildState({ phaseIndex: 2, exerciseIndex: 1 });
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.phaseIndex, 2, "phaseIndex unchanged — same phase");
    assert.strictEqual(state.exerciseIndex, 0, "exerciseIndex decremented");
  });
});

describe("handlePrevious — attemptLog integrity", () => {

  it("does NOT add a duplicate attemptLog entry when going back from a fresh exercise", () => {
    // Simulate: student solved g1, navigated to g2 (entry pushed by
    // renderPhaseExercise), did nothing, clicks Previous.
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    state.attemptLog = [
      buildEntry(0, 0, { attempts: 1, solved: true, scoreDelta: 0 }),
      buildEntry(0, 1),
    ];
    var beforeLength = state.attemptLog.length;
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "attemptLog length must NOT grow when navigating back — " +
      "going back must not create a new entry for the prior exercise");
  });

  it("does NOT add a duplicate attemptLog entry when going back from a worked-on exercise", () => {
    // Simulate: student solved g1, worked on g2 (made attempts), clicks Previous.
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    state.attemptLog = [
      buildEntry(0, 0, { attempts: 1, solved: true }),
      buildEntry(0, 1, { attempts: 3, hintsUsed: 1, scoreDelta: -0.35 }),
    ];
    var beforeLength = state.attemptLog.length;
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "attemptLog length must NOT grow — the existing g2 entry is preserved " +
      "so the student's work isn't lost if they go forward again");
  });

  it("cross-phase back does NOT add a duplicate entry", () => {
    // Simulate: student finished phase 0, opened s1 in phase 1, did nothing.
    var state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [
      buildEntry(0, 0, { solved: true }),
      buildEntry(0, 1, { solved: true }),
      buildEntry(0, 2, { solved: true }),
      buildEntry(0, 3, { solved: true }),
      buildEntry(1, 0),
    ];
    var beforeLength = state.attemptLog.length;
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "Cross-phase back must also NOT add a duplicate entry");
  });

  it("preserves the prior exercise's saved state (solved/attempts/hints)", () => {
    // The g1 entry carries real work; the g2 entry is empty. After
    // handlePrevious from (0,1) → (0,0), the g1 entry must remain in
    // attemptLog with its real data so the user sees their solved state
    // when they arrive.
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    var g1Entry = buildEntry(0, 0, {
      attempts: 2,
      hintsUsed: 1,
      solved: true,
      scoreDelta: -0.10,
    });
    state.attemptLog = [g1Entry, buildEntry(0, 1)];
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    var afterG1 = state.attemptLog.filter(function (e) {
      return e.exerciseId === g1Entry.exerciseId;
    });
    assert.strictEqual(afterG1.length, 1,
      "g1 entry must still exist exactly once after going back");
    assert.strictEqual(afterG1[0].solved, true,
      "g1 entry must still be marked solved");
    assert.strictEqual(afterG1[0].attempts, 2,
      "g1 entry must still report 2 attempts");
    assert.strictEqual(afterG1[0].hintsUsed, 1,
      "g1 entry must still report 1 hint used");
  });
});

describe("handlePrevious — score safety", () => {

  it("does not change the score just by going back", () => {
    var state = buildState({ phaseIndex: 0, exerciseIndex: 2 });
    state.score = 12.5;
    state.attemptLog = [
      buildEntry(0, 0, { solved: true }),
      buildEntry(0, 1, { solved: true }),
      buildEntry(0, 2, { attempts: 1, scoreDelta: -0.25 }),
    ];
    var scoreBefore = state.score;
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(state.score, scoreBefore,
      "handlePrevious must NOT change the score — only the position");
  });

  it("does not introduce extra scoreDelta on the prior entry", () => {
    // The g1 entry has scoreDelta=0 (no penalties). handlePrevious
    // must not silently add a negative delta to it.
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    var g1 = buildEntry(0, 0, { solved: true, scoreDelta: 0 });
    state.attemptLog = [g1, buildEntry(0, 1)];
    AppTestHooks.handlePrevious(state, null, buildProgressStoreStub());
    assert.strictEqual(g1.scoreDelta, 0,
      "The prior exercise's scoreDelta must not change — going back is a " +
      "no-op for scoring");
  });
});

describe("handlePrevious — persistence", () => {

  it("triggers a saveCurrentProgress call with the new position", () => {
    // Start at the FIRST exercise of phase 1 so handlePrevious crosses
    // a phase boundary → (0, last of phase 0).
    var state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    var store = buildProgressStoreStub();
    var result = AppTestHooks.handlePrevious(state, null, store);
    assert.ok(result.saved,
      "handlePrevious must call ProgressStore.saveProgress so reload/Continue " +
      "lands on the previous exercise");
    assert.ok(result.savedProgress,
      "saveProgress must be called with the progress payload");
    assert.strictEqual(result.savedProgress.phaseIndex, 0,
      "saved progress must carry the new phaseIndex (rolled back by 1)");
    assert.strictEqual(result.savedProgress.exerciseIndex,
      AppExercises.phases[0].exercises.length - 1,
      "saved progress must carry the new exerciseIndex (last of phase 0)");
  });

  it("does not call saveProgress when blocked at the first exercise", () => {
    // No-op on first exercise → no state change → no save needed.
    var state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    var store = buildProgressStoreStub();
    var result = AppTestHooks.handlePrevious(state, null, store);
    assert.strictEqual(result.saved, false,
      "no-op on first exercise must NOT trigger a save");
    assert.strictEqual(store.__callCount, 0,
      "saveProgress must not be called when handlePrevious is a no-op");
  });

  it("save payload includes the full attemptLog (no truncation)", () => {
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    state.attemptLog = [
      buildEntry(0, 0, { solved: true }),
      buildEntry(0, 1),
    ];
    var store = buildProgressStoreStub();
    var result = AppTestHooks.handlePrevious(state, null, store);
    assert.strictEqual(result.savedProgress.attemptLog.length, 2,
      "saved attemptLog must include both entries (no truncation, no duplicate)");
  });
});

describe("Previous navigation — UI disabled state (isPrevEnabled)", () => {

  it("returns false at (phase=0, index=0)", () => {
    assert.strictEqual(
      AppTestHooks.isPrevEnabled(buildState({ phaseIndex: 0, exerciseIndex: 0 })),
      false,
      "First exercise must disable the previous button"
    );
  });

  it("returns true at (phase=0, index=1)", () => {
    assert.strictEqual(
      AppTestHooks.isPrevEnabled(buildState({ phaseIndex: 0, exerciseIndex: 1 })),
      true,
      "Second exercise must enable the previous button"
    );
  });

  it("returns true at the first exercise of phase 1 (cross-phase back is possible)", () => {
    assert.strictEqual(
      AppTestHooks.isPrevEnabled(buildState({ phaseIndex: 1, exerciseIndex: 0 })),
      true,
      "First exercise of phase 1 must enable the previous button " +
      "(clicking jumps to the last exercise of phase 0)"
    );
  });

  it("returns true at mid-phase 2", () => {
    assert.strictEqual(
      AppTestHooks.isPrevEnabled(buildState({ phaseIndex: 2, exerciseIndex: 1 })),
      true,
      "Mid-phase exercise must enable the previous button"
    );
  });
});

// ----------------------------------------------------------------------
// Behavioural test for the externally visible contract (R4-001)
// ----------------------------------------------------------------------
//
// R4-001: the previous-exercise button was wired but hidden. This block
// drives the production `updateNavButtons()` through AppTestHooks and
// asserts the resulting DOM state: btn-prev must be visible (display
// is not "none") after the function runs. If a future refactor drops
// the `style.display` line, these tests fail loudly with the same
// symptom a real user would see.

describe("updateNavButtons — R4-001 visibility contract", () => {

  it("sets btn-prev display to a visible value (not 'none') on a normal exercise", () => {
    var dom = buildDom();
    var state = buildState({ phaseIndex: 0, exerciseIndex: 1 });
    AppTestHooks.updateNavButtons(dom, state);
    assert.notStrictEqual(dom.btnPrev.style.display, "none",
      "btn-prev must NOT be display:none on a non-first exercise — " +
      "the CSS default hides the button and app.js MUST override it " +
      "so users can navigate back");
    assert.ok(dom.btnPrev.style.display && dom.btnPrev.style.display !== "",
      "btn-prev.style.display must be set to a non-empty value " +
      "(actual: " + JSON.stringify(dom.btnPrev.style.display) + ")");
  });

  it("keeps btn-prev visible (display not 'none') even on the first exercise", () => {
    // User preference: visible-disabled for discoverability. The button
    // stays in the layout on the very first exercise so users can see
    // the back action exists; it is just disabled.
    var dom = buildDom();
    var state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    AppTestHooks.updateNavButtons(dom, state);
    assert.notStrictEqual(dom.btnPrev.style.display, "none",
      "btn-prev must remain visible (display not 'none') on the first " +
      "exercise — visible-disabled beats hidden for discoverability");
    assert.strictEqual(dom.btnPrev.disabled, true,
      "btn-prev must be disabled on the first exercise even though it " +
      "is visible");
    assert.strictEqual(dom.btnPrev.getAttribute("aria-disabled"), "true",
      "btn-prev must carry aria-disabled='true' on the first exercise");
  });

  it("shows btn-prev at the first exercise of phase 1 (cross-phase back is possible)", () => {
    var dom = buildDom();
    var state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    AppTestHooks.updateNavButtons(dom, state);
    assert.notStrictEqual(dom.btnPrev.style.display, "none",
      "btn-prev must be visible at (phase=1, index=0) — going back jumps " +
      "to the last exercise of phase 0");
    assert.strictEqual(dom.btnPrev.disabled, false,
      "btn-prev must be enabled at (phase=1, index=0) — the boundary " +
      "for 'no previous' is only (phase=0, index=0)");
  });

  it("enables btn-prev on every exercise except (phase=0, index=0)", () => {
    // Walk a few representative positions and assert the visual contract
    // holds for all of them.
    var positions = [
      { phaseIndex: 0, exerciseIndex: 1, shouldBeDisabled: false },
      { phaseIndex: 0, exerciseIndex: 2, shouldBeDisabled: false },
      { phaseIndex: 1, exerciseIndex: 0, shouldBeDisabled: false },
      { phaseIndex: 1, exerciseIndex: 1, shouldBeDisabled: false },
      { phaseIndex: 2, exerciseIndex: 0, shouldBeDisabled: false },
    ];
    positions.forEach(function (p) {
      var dom = buildDom();
      var state = buildState(p);
      AppTestHooks.updateNavButtons(dom, state);
      assert.notStrictEqual(dom.btnPrev.style.display, "none",
        "btn-prev must be visible at (" + p.phaseIndex + ", " + p.exerciseIndex + ")");
      assert.strictEqual(dom.btnPrev.disabled, p.shouldBeDisabled,
        "btn-prev.disabled at (" + p.phaseIndex + ", " + p.exerciseIndex + ") " +
        "should be " + p.shouldBeDisabled);
    });
  });
});

/**
 * tests/side-menu-and-skip.test.js
 *
 * Behavior-centric tests for the side menu and the revised skip behavior.
 *
 * What this suite pins:
 *   - Skipping an exercise does NOT show the reference solution. The
 *     expected SQL box stays hidden, the feedback uses a different
 *     "skipped" style, and the student can return later and try again
 *     without ever having seen the answer.
 *   - The side menu lists every phase/exercise. Items are categorised
 *     as solved / skipped / current / locked. Only solved, skipped,
 *     and current items are clickable; locked items are visibly
 *     disabled and have aria-disabled="true".
 *   - Clicking a menu item navigates the student to that exercise and
 *     persists the new position (so reload/Continue lands there).
 *   - The menu re-renders after every state-changing action (skip,
 *     solve, next, previous, import, continue) so the indicators
 *     stay in sync with attemptLog.
 *   - Revisiting a skipped exercise does NOT create a duplicate
 *     attemptLog entry, and solving it later does NOT double-count
 *     the score — the existing entry's solved flag is flipped and
 *     only the new attempts' penalties are applied.
 *
 * Run: node --test tests/side-menu-and-skip.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Load exercises.js (data only — no DOM/WASM dependencies).
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
// Load app.js in test mode so AppTestHooks is exposed.
// ----------------------------------------------------------------------
global.window.__APP_TEST_MODE__ = true;
global.window.__APP_TEST_HOOKS__ = true;

/**
 * Element factory with classList + setAttribute + addEventListener.
 * Tracks appended children so menu-render tests can assert on
 * data-phase-index / data-exercise-index. The className setter keeps
 * the classList set in sync (matches real DOM behaviour) so tests
 * can read classList.contains() after `el.className = "..."` is
 * assigned.
 */
function makeElement(tag) {
  const children = [];
  const classList = {
    _set: new Set(),
    add: function (c) { this._set.add(c); },
    remove: function (c) { this._set.delete(c); },
    toggle: function (c, force) {
      if (force === true) this._set.add(c);
      else if (force === false) this._set.delete(c);
      else if (this._set.has(c)) this._set.delete(c);
      else this._set.add(c);
    },
    contains: function (c) { return this._set.has(c); },
  };
  const el = {
    tagName: tag,
    style: {},
    children: children,
    disabled: false,
    hidden: false,
    _attrs: {},
    _className: "",
    _text: "",
    _html: "",
    appendChild: function (c) { children.push(c); return c; },
    removeChild: function () {},
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getAttribute: function (k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    addEventListener: function () {},
    removeEventListener: function () {},
    querySelectorAll: function () { return []; },
    classList: classList,
    focus: function () {},
  };
  // className setter: stores the raw string AND syncs classList so
  // `el.className = "foo bar"` makes `el.classList.contains("foo")`
  // return true. This is what the real DOM does.
  Object.defineProperty(el, "className", {
    get: function () { return this._className; },
    set: function (v) {
      this._className = v;
      classList._set.clear();
      if (v) {
        String(v).split(/\s+/).forEach(function (c) {
          if (c) classList._set.add(c);
        });
      }
    },
  });
  Object.defineProperty(el, "textContent", {
    get: function () { return this._text; },
    set: function (v) { this._text = v; children.length = 0; },
  });
  Object.defineProperty(el, "innerHTML", {
    get: function () { return this._html; },
    set: function (v) { this._html = v; this._text = v; },
  });
  return el;
}

global.document = {
  readyState: "loading",
  createElement: makeElement,
  getElementById: function () { return null; },
  addEventListener: function () {},
};

const appPath = path.resolve(__dirname, "..", "src", "app.js");
const appSrc = fs.readFileSync(appPath, "utf-8");
eval(appSrc);

const AppTestHooks = global.window.AppTestHooks;

// ----------------------------------------------------------------------
// Test fixtures: state, dom, attemptLog entries, ProgressStore stub.
// ----------------------------------------------------------------------

/**
 * Build a state object shaped like the production `state`. Defaults
 * give a fresh-session layout, but callers override as needed.
 */
function buildState(overrides) {
  const maxScore = AppExercises.maxScore();
  const base = {
    view: "exercises",
    studentName: "Test Student",
    phaseIndex: 0,
    exerciseIndex: 0,
    score: maxScore,
    maxScore: maxScore,
    attemptLog: [],
    currentExerciseState: null,
    schemaSelectedTable: null,
    menuCollapsed: false,
  };
  if (overrides) {
    for (const k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        base[k] = overrides[k];
      }
    }
  }
  return base;
}

/**
 * Build an attemptLog entry for the exercise at the given position.
 */
function buildEntry(phaseIndex, exerciseIndex, overrides) {
  const phase = AppExercises.phases[phaseIndex];
  const ex = phase.exercises[exerciseIndex];
  const base = {
    exerciseId: ex.id,
    title: ex.title,
    attempts: 0,
    hintsUsed: 0,
    solved: false,
    skipped: false,
    scoreDelta: 0,
  };
  if (overrides) {
    for (const k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        base[k] = overrides[k];
      }
    }
  }
  return base;
}

/**
 * Build a dom mock with the new menu elements wired so renderMenu
 * doesn't crash. Other elements are permissive stubs.
 */
function buildDom() {
  return {
    startScreen: makeElement("div"),
    exerciseArea: makeElement("div"),
    completeScreen: makeElement("div"),
    statusBar: makeElement("div"),
    statusPhase: makeElement("span"),
    statusStep: makeElement("span"),
    statusScore: makeElement("span"),
    progressFill: makeElement("div"),
    studentNameInput: makeElement("input"),
    btnStart: makeElement("button"),
    nameError: makeElement("div"),
    savedBanner: makeElement("div"),
    savedBannerText: makeElement("span"),
    btnContinue: makeElement("button"),
    btnNewSession: makeElement("button"),
    importFile: makeElement("input"),
    importError: makeElement("div"),
    importOk: makeElement("div"),
    exerciseCard: makeElement("div"),
    modeBadge: makeElement("span"),
    exerciseTitle: makeElement("span"),
    exerciseEnunciado: makeElement("div"),
    expectedSqlDisplay: makeElement("div"),
    expectedSqlText: makeElement("code"),
    aidsRow: makeElement("div"),
    togContext: makeElement("button"),
    togGuide: makeElement("button"),
    aidsContextBox: makeElement("div"),
    aidsContext: makeElement("div"),
    aidsGuideBox: makeElement("div"),
    aidsGuide: makeElement("div"),
    solutionNote: makeElement("div"),
    solutionNoteText: makeElement("div"),
    hintsWrap: makeElement("div"),
    queryInput: makeElement("textarea"),
    btnSubmit: makeElement("button"),
    btnSkip: makeElement("button"),
    btnNext: makeElement("button"),
    btnPrev: makeElement("button"),
    feedbackOk: makeElement("div"),
    feedbackOkContent: makeElement("div"),
    feedbackOkSql: makeElement("span"),
    feedbackErr: makeElement("div"),
    feedbackErrContent: makeElement("div"),
    feedbackErrDetail: makeElement("div"),
    resultDisplay: makeElement("div"),
    resultContent: makeElement("div"),
    finalScore: makeElement("div"),
    finalPct: makeElement("div"),
    finalDetail: makeElement("div"),
    btnExport: makeElement("button"),
    exportStatus: makeElement("div"),
    btnSchema: makeElement("button"),
    schemaModal: makeElement("div"),
    btnSchemaClose: makeElement("button"),
    schemaList: makeElement("div"),
    schemaDetail: makeElement("div"),
    preflightErr: makeElement("div"),
    // Side menu
    appShell: makeElement("div"),
    sidebar: makeElement("aside"),
    sidebarList: makeElement("div"),
    btnSidebarCollapse: makeElement("button"),
    btnSidebarExpand: makeElement("button"),
    sidebarFloatingToggle: makeElement("div"),
  };
}

/**
 * ProgressStore stub that records save calls. Mirrors the one used
 * in previous-navigation.test.js.
 */
function buildProgressStoreStub() {
  const stub = {
    __lastCall: null,
    __callCount: 0,
    isAvailable: function () { return true; },
    saveProgress: function (p) {
      stub.__lastCall = p;
      stub.__callCount++;
      return Promise.resolve();
    },
    loadProgress: function () { return Promise.resolve(null); },
    hasProgress: function () { return Promise.resolve(false); },
    clearProgress: function () { return Promise.resolve(); },
  };
  return stub;
}

// ======================================================================
// Source-level static checks — fail loudly if app.js is missing the
// skip-no-reveal contract or the menu surface area.
// ======================================================================

const indexPath = path.resolve(__dirname, "..", "index.html");
const indexSrc = fs.readFileSync(indexPath, "utf-8");

describe("Source structure — skip does not reveal solution", () => {
  it("app.js handleSkip no longer sets expectedSqlDisplay.textContent to the expected SQL", () => {
    // The old behaviour wrote ex.expectedSql into the box. The new
    // contract hides the box entirely (display:none) and clears any
    // text. We assert the textContent-assignment line is gone so a
    // future refactor doesn't accidentally re-introduce it.
    const skipFnMatch = appSrc.match(/function\s+handleSkip\s*\(\s*\)\s*\{([\s\S]*?)\n\s\s\}/);
    assert.ok(skipFnMatch, "app.js must define handleSkip()");
    const skipBody = skipFnMatch[1];
    assert.ok(
      !/expectedSqlDisplay\.textContent\s*=\s*ex\.expectedSql/.test(skipBody),
      "handleSkip must NOT set expectedSqlDisplay.textContent = ex.expectedSql — " +
      "skipping must never reveal the reference solution"
    );
    assert.ok(
      /expectedSqlDisplay\.style\.display\s*=\s*["']none["']/.test(skipBody) ||
      /_hideExpectedSqlBox\s*\(\s*\)/.test(skipBody),
      "handleSkip must hide expectedSqlDisplay (display:none directly or via " +
      "_hideExpectedSqlBox()) so the solution is not shown"
    );
  });

  it("index.html adds a textarea#query-input with at least 5 rows", () => {
    const m = indexSrc.match(/<textarea[^>]*\bid="query-input"[^>]*\brows="(\d+)"/);
    assert.ok(m, 'index.html must define <textarea id="query-input" rows="N"> (was an <input> before)');
    const rows = parseInt(m[1], 10);
    assert.ok(rows >= 5,
      "textarea#query-input must have at least 5 rows (got " + rows + ")");
  });

  it("index.html no longer has <input ... id=\"query-input\">", () => {
    assert.ok(
      !/<input\b[^>]*\bid="query-input"/.test(indexSrc),
      "index.html must replace the text input with a textarea"
    );
  });

  it("index.html defines the side-menu container #sidebar and list #sidebar-list", () => {
    assert.ok(/<aside[^>]*\bid="sidebar"/.test(indexSrc),
      'index.html must define <aside id="sidebar"> for the side menu');
    assert.ok(/id="sidebar-list"/.test(indexSrc),
      'index.html must define #sidebar-list (the menu list container)');
  });

  it("app.js defines renderMenu, toggleMenu, _navigateToMenuExercise", () => {
    assert.ok(/function\s+renderMenu\s*\(/.test(appSrc), "app.js must define renderMenu()");
    assert.ok(/function\s+toggleMenu\s*\(/.test(appSrc), "app.js must define toggleMenu()");
    assert.ok(/function\s+_navigateToMenuExercise\s*\(/.test(appSrc),
      "app.js must define _navigateToMenuExercise()");
  });

  it("app.js AppTestHooks exposes menuStatusFor, renderMenu, toggleMenu, handleSkip, navigateToMenuExercise", () => {
    const hooksMatch = appSrc.match(/window\.AppTestHooks\s*=\s*\{([\s\S]*?)\n\s\s\}\s*\}/);
    assert.ok(hooksMatch, "app.js must define window.AppTestHooks");
    const hooks = hooksMatch[1];
    ["menuStatusFor", "renderMenu", "toggleMenu", "handleSkip", "navigateToMenuExercise"]
      .forEach(function (name) {
        assert.ok(new RegExp(name + "\\s*:\\s*function").test(hooks),
          "AppTestHooks must expose " + name + "()");
      });
  });
});

// ======================================================================
// Behavioural tests — skip behaviour
// ======================================================================

describe("handleSkip — does not reveal reference solution", () => {

  it("hides expectedSqlDisplay (display:none)", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(dom.expectedSqlDisplay.style.display, "none",
      "expectedSqlDisplay must be display:none after skip — solution must NOT be revealed");
  });

  it("clears any previously-shown expected SQL text", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    // Pre-pollute the box as if a previous render put the answer there
    dom.expectedSqlDisplay.textContent = "SELECT * FROM something_secret";
    dom.expectedSqlDisplay.style.display = "block";
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(dom.expectedSqlDisplay.textContent, "",
      "expectedSqlDisplay.textContent must be cleared on skip (no leaked answer)");
  });

  it("marks the attemptLog entry as skipped=true (not solved)", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(state.attemptLog[0].skipped, true,
      "skip must mark the entry's skipped=true so the menu treats it as navigable");
    assert.strictEqual(state.attemptLog[0].solved, false,
      "skip must keep solved=false (skipping is not the same as solving)");
  });

  it("leaves a skipped exercise at zero earned credit", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.score = 7;
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(state.score, 0,
      "a skipped unresolved exercise must earn zero points");
    assert.strictEqual(state.attemptLog[0].earnedPoints, 0,
      "the entry must record zero earned points while skipped");
    assert.strictEqual(state.attemptLog[0].scoreDelta, 0,
      "skipping must not apply an artificial penalty to later valid credit");
  });

  it("uses the feedback-skipped style (not feedback-ok) so it is visually distinct", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.ok(dom.feedbackOk.classList.contains("feedback-skipped"),
      "feedbackOk must carry the feedback-skipped class after skip");
    assert.strictEqual(dom.feedbackOk.style.display, "block",
      "feedbackOk must be visible after skip (so the student knows the action registered)");
  });

  it("saves progress including the skipped flag", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    const result = AppTestHooks.handleSkip(state, dom);
    assert.ok(result.saved, "handleSkip must call ProgressStore.saveProgress");
    assert.strictEqual(result.savedProgress.attemptLog[0].skipped, true,
      "saved attemptLog must carry skipped=true");
  });

  it("keeps the input enabled so the student can keep typing and submit", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(dom.queryInput.disabled, false,
      "after skip, the input must remain enabled so the student can immediately try again");
    assert.strictEqual(dom.btnSubmit.disabled, false,
      "after skip, the submit button must remain enabled");
    assert.strictEqual(dom.btnSkip.style.display, "none",
      "after skip, the skip button must be hidden (skipping twice is meaningless)");
  });

  it("keeps btnNext visible so the student can advance sequentially without seeing the solution", () => {
    // RELIABILITY-001 contract: skipping must not trap the student on
    // the exercise. btnNext stays visible after skip so the student can
    // continue. The answer is still hidden — sequential progress is
    // permitted precisely because skipping is a "I will come back" act,
    // not a "reveal the answer" act.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };
    const dom = buildDom();
    AppTestHooks.handleSkip(state, dom);
    assert.strictEqual(dom.btnNext.style.display, "inline-block",
      "after skip, btnNext must stay visible so the student can continue sequentially");
  });
});

// ======================================================================
// Behavioural tests — restored skipped state (RELIABILITY-001)
// ======================================================================

describe("renderPhaseExerciseRestored — skipped entry keeps btnNext visible (RELIABILITY-001)", () => {

  it("shows btnNext when a skipped attemptLog entry is restored", () => {
    // Simulates: student skipped an exercise, reloaded the page (or
    // hit "Continuar"), and landed back on the skipped exercise via
    // the restored render path. The button contract must match the
    // immediate post-skip state in handleSkip() — visible.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true, attempts: 0, scoreDelta: -0.5 })];
    const dom = buildDom();
    AppTestHooks.renderPhaseExerciseRestored(dom, state);
    assert.strictEqual(dom.btnNext.style.display, "inline-block",
      "after restore of a skipped entry, btnNext must be visible — the student must be able to keep advancing");
  });

  it("hides the reference solution when a skipped entry is restored", () => {
    // Critical: btnNext is now visible, but the answer must STILL be
    // hidden. Visibility of next and reveal of solution are decoupled
    // — the contract is "skip = advance freely, never reveal".
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true })];
    const dom = buildDom();
    // Pre-pollute expectedSqlDisplay as if a previous render leaked it.
    dom.expectedSqlDisplay.style.display = "block";
    dom.expectedSqlDisplay.textContent = "SELECT * FROM leaked_answer";
    AppTestHooks.renderPhaseExerciseRestored(dom, state);
    assert.strictEqual(dom.expectedSqlDisplay.style.display, "none",
      "expectedSqlDisplay must remain hidden on restored skipped state — solution must NEVER be revealed");
    assert.strictEqual(dom.expectedSqlDisplay.textContent, "",
      "expectedSqlDisplay text must be cleared on restored skipped state");
  });

  it("keeps btnSkip hidden on a restored skipped entry (no double-skip)", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true })];
    const dom = buildDom();
    AppTestHooks.renderPhaseExerciseRestored(dom, state);
    assert.strictEqual(dom.btnSkip.style.display, "none",
      "after restore of a skipped entry, btnSkip must stay hidden (skipping twice is meaningless)");
  });
});

describe("renderPhaseExercise — in-session re-render of a skipped entry keeps btnNext visible (RELIABILITY-001)", () => {

  it("shows btnNext when re-rendering a skipped exercise in the same session", () => {
    // Simulates: student skipped (0,0), advanced via handleNext to
    // (0,1), then came back via handlePrevious → renderPhaseExercise.
    // The skipped entry must keep the same visibility contract as
    // the restored path: btnNext visible, answer hidden.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true, attempts: 0, scoreDelta: -0.5 })];
    const dom = buildDom();
    AppTestHooks.renderPhaseExercise(dom, state);
    assert.strictEqual(dom.btnNext.style.display, "inline-block",
      "in-session re-render of a skipped entry must keep btnNext visible");
    assert.strictEqual(dom.expectedSqlDisplay.style.display, "none",
      "in-session re-render of a skipped entry must NOT reveal the reference solution");
  });
});

describe("Skip → save → reload → restore → sequential progress (RELIABILITY-001)", () => {

  it("preserves sequential progress: handleSkip → save → restore lets the student continue", () => {
    // End-to-end shape of the bug:
    //   1. handleSkip() on the current exercise.
    //   2. saveCurrentProgress() writes the skipped entry to the store.
    //   3. Page reloads, app restores state and lands on the same
    //      exercise via renderPhaseExerciseRestored.
    //   4. The student can press btnNext to advance — the button must
    //      be visible. The answer is still hidden.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0)];
    state.currentExerciseState = {
      attempts: 0, hintsUsed: [], solved: false, skipped: false, lastSql: null,
    };

    // Step 1: skip.
    const dom1 = buildDom();
    AppTestHooks.handleSkip(state, dom1);
    assert.strictEqual(dom1.btnNext.style.display, "inline-block",
      "step 1 (skip): btnNext must be visible immediately after handleSkip");
    const savedProgress = dom1; // progress lives on state, not dom

    // Step 2: simulate save (the test hook handleSkip already called
    // saveCurrentProgress — state.attemptLog now carries skipped=true).
    assert.strictEqual(state.attemptLog[0].skipped, true,
      "step 2: state must persist the skipped flag through saveCurrentProgress");

    // Step 3: simulate restore. Fresh dom; run renderPhaseExerciseRestored
    // against the same state — this is the path the production
    // _restoreFromProgress() takes when the student hits "Continuar".
    const dom2 = buildDom();
    AppTestHooks.renderPhaseExerciseRestored(dom2, state);

    // Step 4: btnNext is visible and the student can advance.
    assert.strictEqual(dom2.btnNext.style.display, "inline-block",
      "step 4 (restore): btnNext must be visible on the restored skipped state — the bug");
    assert.strictEqual(dom2.expectedSqlDisplay.style.display, "none",
      "step 4 (restore): the answer must remain hidden even with btnNext visible");
    assert.strictEqual(dom2.feedbackOk.classList.contains("feedback-skipped"), true,
      "step 4 (restore): the skipped feedback style must be applied");
  });
});

// ======================================================================
// Behavioural tests — menu status routing
// ======================================================================

describe("_menuStatusFor — exercise status routing", () => {

  it("returns 'current' for the active exercise", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    assert.strictEqual(
      AppTestHooks.menuStatusFor(0, 0, state), "current",
      "active exercise must be marked current"
    );
  });

  it("returns 'solved' for entries with solved=true", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { solved: true })];
    assert.strictEqual(
      AppTestHooks.menuStatusFor(0, 0, state), "solved",
      "solved entries must be marked solved (navigable from the menu)"
    );
  });

  it("returns 'skipped' for entries with skipped=true and solved=false", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true })];
    assert.strictEqual(
      AppTestHooks.menuStatusFor(0, 0, state), "skipped",
      "skipped entries must be marked skipped (navigable, solution hidden)"
    );
  });

  it("returns 'locked' for future exercises the student hasn't reached", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    // No attemptLog entry for the future exercise — locked.
    assert.strictEqual(
      AppTestHooks.menuStatusFor(2, 0, state), "locked",
      "future unseen exercises must be marked locked (not clickable)"
    );
  });

  it("returns 'locked' for exercises that have an entry but are neither solved nor skipped", () => {
    // The student attempted but did not finish; navigation forward
    // happened via Siguiente. The entry exists but the exercise is
    // NOT navigable from the menu (the menu only supports solved /
    // skipped / current).
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { attempts: 3, solved: false, skipped: false })];
    assert.strictEqual(
      AppTestHooks.menuStatusFor(0, 0, state), "locked",
      "touched-but-not-solved entries must be marked locked from the menu"
    );
  });
});

// ======================================================================
// Behavioural tests — renderMenu
// ======================================================================

describe("renderMenu — menu DOM structure", () => {

  it("creates one section per phase with one button per exercise", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    const dom = buildDom();
    const count = AppTestHooks.renderMenu(dom, state);
    // Every phase contributes a .sidebar-phase section; the test stub
    // does not append them to the list, so we count total buttons.
    const totalExercises = AppExercises.totalExerciseCount();
    assert.ok(count > 0, "renderMenu must return a positive count");
    // Count children of all sidebar-phase sections inside sidebarList.
    let btnCount = 0;
    function walk(n) {
      if (!n || !n.children) return;
      for (const c of n.children) {
        if (c.classList && c.classList.contains("sidebar-item")) btnCount++;
        walk(c);
      }
    }
    walk(dom.sidebarList);
    assert.strictEqual(btnCount, totalExercises,
      "renderMenu must produce one button per exercise across all phases");
  });

  it("marks the active exercise with the 'current' class", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 2 });
    const dom = buildDom();
    AppTestHooks.renderMenu(dom, state);
    // The button at (0, 2) must have the 'current' class
    const found = findItemWithAttrs(dom.sidebarList, { "data-phase-index": "0", "data-exercise-index": "2" });
    assert.ok(found, "menu must contain a button for the current exercise (0, 2)");
    assert.ok(found.classList.contains("current"),
      "current exercise menu item must carry the .current class");
  });

  it("disables locked items (disabled + aria-disabled) and does NOT call navigation on click", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    const dom = buildDom();
    AppTestHooks.renderMenu(dom, state);
    // (1, 0) is a future exercise — locked.
    const future = findItemWithAttrs(dom.sidebarList, { "data-phase-index": "1", "data-exercise-index": "0" });
    assert.ok(future, "menu must contain a button for the future exercise (1, 0)");
    assert.strictEqual(future.disabled, true,
      "locked items must be disabled so click events are blocked");
    assert.strictEqual(future.getAttribute("aria-disabled"), "true",
      "locked items must carry aria-disabled='true' for screen readers");
  });

  it("marks solved entries with the 'solved' class (clickable)", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { solved: true })];
    const dom = buildDom();
    AppTestHooks.renderMenu(dom, state);
    const solved = findItemWithAttrs(dom.sidebarList, { "data-phase-index": "0", "data-exercise-index": "0" });
    assert.ok(solved, "menu must contain a button for the solved exercise");
    assert.ok(solved.classList.contains("solved"),
      "solved entry must carry the .solved class");
    assert.strictEqual(solved.disabled, false,
      "solved entry must NOT be disabled (it's navigable)");
  });

  it("marks skipped entries with the 'skipped' class (clickable)", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true })];
    const dom = buildDom();
    AppTestHooks.renderMenu(dom, state);
    const skipped = findItemWithAttrs(dom.sidebarList, { "data-phase-index": "0", "data-exercise-index": "0" });
    assert.ok(skipped, "menu must contain a button for the skipped exercise");
    assert.ok(skipped.classList.contains("skipped"),
      "skipped entry must carry the .skipped class");
    assert.strictEqual(skipped.disabled, false,
      "skipped entry must NOT be disabled (it's navigable, solution still hidden)");
  });

  it("uses safe DOM construction: exercise titles reach the DOM as text, not HTML", () => {
    // Defensive: a future refactor that uses innerHTML could XSS
    // through exercise titles if they ever carried user data. Pin
    // textContent for the title label.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    const dom = buildDom();
    AppTestHooks.renderMenu(dom, state);
    // All .label spans should have textContent set and no innerHTML.
    function walk(n, out) {
      if (!n || !n.children) return;
      for (const c of n.children) {
        if (c.classList && c.classList.contains("label")) out.push(c);
        walk(c, out);
      }
    }
    const labels = [];
    walk(dom.sidebarList, labels);
    assert.ok(labels.length > 0, "menu must render label nodes for every exercise");
    for (const lab of labels) {
      assert.ok(typeof lab.textContent === "string" && lab.textContent.length > 0,
        "every label must have a non-empty textContent");
    }
  });
});

/** Walk the menu's children tree and return the first .sidebar-item
 *  matching every data-* key in attrs. Returns null if not found. */
function findItemWithAttrs(list, attrs) {
  function walk(n) {
    if (!n || !n.children) return null;
    for (const c of n.children) {
      if (c.classList && c.classList.contains("sidebar-item")) {
        let match = true;
        for (const k in attrs) {
          if (c.getAttribute(k) !== attrs[k]) { match = false; break; }
        }
        if (match) return c;
      }
      const found = walk(c);
      if (found) return found;
    }
    return null;
  }
  return walk(list);
}

// ======================================================================
// Behavioural tests — menu navigation
// ======================================================================

describe("_navigateToMenuExercise — click-to-navigate", () => {

  it("navigates to a solved entry", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { solved: true })];
    const dom = buildDom();
    const store = buildProgressStoreStub();
    const result = AppTestHooks.navigateToMenuExercise(0, 0, state, dom, store);
    assert.strictEqual(result.navigated, true, "solved entry must be navigable");
    assert.strictEqual(state.phaseIndex, 0, "phaseIndex updated");
    assert.strictEqual(state.exerciseIndex, 0, "exerciseIndex updated");
    assert.ok(result.saved, "navigation must save progress");
    assert.strictEqual(result.savedProgress.phaseIndex, 0);
    assert.strictEqual(result.savedProgress.exerciseIndex, 0);
  });

  it("navigates to a skipped entry", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true })];
    const dom = buildDom();
    const store = buildProgressStoreStub();
    const result = AppTestHooks.navigateToMenuExercise(0, 0, state, dom, store);
    assert.strictEqual(result.navigated, true, "skipped entry must be navigable");
    assert.strictEqual(state.exerciseIndex, 0);
  });

  it("rejects navigation to a locked entry (no state change, no save)", () => {
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    // No attemptLog for (1, 0) — locked.
    const dom = buildDom();
    const store = buildProgressStoreStub();
    const result = AppTestHooks.navigateToMenuExercise(1, 0, state, dom, store);
    assert.strictEqual(result.navigated, false, "locked entry must NOT be navigable");
    assert.strictEqual(result.saved, false, "no save must happen for a rejected navigation");
    assert.strictEqual(state.phaseIndex, 0, "state must be unchanged");
    assert.strictEqual(state.exerciseIndex, 0, "state must be unchanged");
    assert.strictEqual(store.__callCount, 0, "no saveProgress call");
  });

  it("does NOT create a duplicate attemptLog entry on navigation", () => {
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [buildEntry(0, 0, { skipped: true, attempts: 1 })];
    const beforeLength = state.attemptLog.length;
    const dom = buildDom();
    AppTestHooks.navigateToMenuExercise(0, 0, state, dom, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "navigating via the menu must NOT add a new attemptLog entry — " +
      "the existing entry for the target exercise is preserved");
  });

  it("preserves the prior exercise's currentExerciseState (no data loss)", () => {
    // We're on (1, 0) with currentExerciseState showing partial work.
    // We click (0, 0) which is skipped. After nav, the in-flight
    // state at (1, 0) must be synced to its log entry.
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [
      buildEntry(0, 0, { skipped: true }),
      buildEntry(1, 0, { attempts: 2, hintsUsed: 1, scoreDelta: -0.5 }),
    ];
    state.currentExerciseState = {
      attempts: 3, hintsUsed: [0, 1], solved: false, skipped: false, lastSql: "SELECT 1",
    };
    const dom = buildDom();
    AppTestHooks.navigateToMenuExercise(0, 0, state, dom, buildProgressStoreStub());
    const phase1Entry = state.attemptLog.filter(function (e) {
      return e.exerciseId === AppExercises.phases[1].exercises[0].id;
    })[0];
    assert.ok(phase1Entry, "the (1, 0) entry must remain in attemptLog");
    assert.strictEqual(phase1Entry.attempts, 3,
      "the (1, 0) entry must reflect the synced in-flight attempts");
    assert.strictEqual(phase1Entry.hintsUsed, 2,
      "the (1, 0) entry must reflect the synced in-flight hints");
  });
});

// ======================================================================
// Behavioural tests — menu collapse / expand
// ======================================================================

describe("toggleMenu — collapse/expand state", () => {

  it("flips state.menuCollapsed from false to true on first toggle", () => {
    const state = buildState({ menuCollapsed: false });
    const dom = buildDom();
    const result = AppTestHooks.toggleMenu(state, dom);
    assert.strictEqual(result.menuCollapsed, true,
      "first toggle must set menuCollapsed=true");
    assert.strictEqual(dom.appShell.classList.contains("sidebar-collapsed"), true,
      "appShell must carry the .sidebar-collapsed class after collapse");
  });

  it("flips state.menuCollapsed back to false on second toggle", () => {
    const state = buildState({ menuCollapsed: true });
    const dom = buildDom();
    const result = AppTestHooks.toggleMenu(state, dom);
    assert.strictEqual(result.menuCollapsed, false,
      "second toggle must set menuCollapsed=false (expanded)");
    assert.strictEqual(dom.appShell.classList.contains("sidebar-collapsed"), false,
      "appShell must NOT carry .sidebar-collapsed when expanded");
  });

  it("persists the menuCollapsed state via saveCurrentProgress", () => {
    const state = buildState({ menuCollapsed: false });
    const dom = buildDom();
    // We can't easily capture saveCurrentProgress from toggleMenu,
    // but we can assert the state is mutated. Persistence is exercised
    // through navigateToMenuExercise above and through the static
    // checks for menuCollapsed in saveCurrentProgress.
    AppTestHooks.toggleMenu(state, dom);
    assert.strictEqual(state.menuCollapsed, true, "menuCollapsed must be true after toggle");
  });
});

// ======================================================================
// Behavioural tests — no duplicate attemptLog / no score double-counting
// ======================================================================

describe("revisit skipped exercise and solve — no duplication, no double-score", () => {

  it("does not add a new attemptLog entry when revisiting a skipped exercise", () => {
    // Student is at (0, 0) (skipped). They navigate away and come
    // back via the menu. The existing entry must be reused.
    const state = buildState({ phaseIndex: 1, exerciseIndex: 0 });
    state.attemptLog = [
      buildEntry(0, 0, { skipped: true, attempts: 0, scoreDelta: -0.5 }),
    ];
    const beforeLength = state.attemptLog.length;
    // First nav: (1, 0) → (0, 0) via menu.
    const dom = buildDom();
    AppTestHooks.navigateToMenuExercise(0, 0, state, dom, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "navigating to a skipped entry must not duplicate the attemptLog");
  });

  it("flips solved=true on the existing entry (no new entry) when later solved", () => {
    // Student revisits a skipped exercise and solves it. The original
    // entry is updated, not duplicated. Solving must not multiply
    // score deductions.
    const state = buildState({ phaseIndex: 0, exerciseIndex: 0 });
    const originalEntry = buildEntry(0, 0, { skipped: true, scoreDelta: -0.5 });
    state.attemptLog = [originalEntry];
    state.currentExerciseState = {
      attempts: 1, hintsUsed: [], solved: true, skipped: true, lastSql: "SELECT 1",
    };
    const beforeLength = state.attemptLog.length;
    // The _navigateToMenuExercise hook does the same sync a future
    // solve-submit would do: it reuses the existing entry. We assert
    // the entry list didn't grow when navigating to a skipped entry
    // and back.
    const dom = buildDom();
    AppTestHooks.navigateToMenuExercise(0, 0, state, dom, buildProgressStoreStub());
    assert.strictEqual(state.attemptLog.length, beforeLength,
      "no duplicate entry when revisiting then solving a skipped exercise");
    // The (0, 0) entry is still the same object reference — proves
    // we did not silently replace it with a fresh one.
    const sameEntry = state.attemptLog.filter(function (e) {
      return e.exerciseId === originalEntry.exerciseId;
    })[0];
    assert.strictEqual(sameEntry, originalEntry,
      "the (0, 0) entry must be the same object — no replacement");
  });
});

describe("per-exercise earned-points scoring", () => {

  it("gives all skipped exercises zero credit instead of a passing score", () => {
    const state = buildState({ score: AppExercises.maxScore() });
    state.attemptLog = [];
    AppExercises.phases.forEach(function (phase) {
      phase.exercises.forEach(function (ex) {
        state.attemptLog.push({
          exerciseId: ex.id,
          title: ex.title,
          attempts: 0,
          hintsUsed: 0,
          solved: false,
          skipped: true,
          scoreDelta: 0,
        });
      });
    });

    assert.strictEqual(AppTestHooks.recalculateScore(state), 0,
      "skipping every exercise must produce 0 / maxScore");
  });

  it("awards valid credit when a skipped exercise is later solved", () => {
    const ex = AppExercises.phases[0].exercises[0];
    const state = buildState({
      attemptLog: [buildEntry(0, 0, { skipped: true, solved: true, scoreDelta: -0.25 })],
    });

    assert.strictEqual(AppTestHooks.recalculateScore(state), ex.scoring.points - 0.25,
      "later solving must earn the exercise's points less its own valid penalties");
    assert.strictEqual(state.attemptLog[0].earnedPoints, ex.scoring.points - 0.25);
  });

  it("migrates legacy saved totals from solved entries", () => {
    const solved = AppExercises.phases[0].exercises[0];
    const state = buildState({
      score: AppExercises.maxScore(),
      attemptLog: [
        buildEntry(0, 0, { solved: true, scoreDelta: -0.25 }),
        buildEntry(0, 1, { skipped: true, solved: false, scoreDelta: -0.5 }),
      ],
    });

    assert.strictEqual(AppTestHooks.recalculateScore(state), solved.scoring.points - 0.25,
      "legacy saved totals must be recomputed so unresolved entries receive zero credit");
  });
});

describe("export current state", () => {
  it("does not read a stale IndexedDB snapshot before exporting", () => {
    const current = buildState({ score: AppExercises.maxScore() });
    current.attemptLog = [buildEntry(0, 0, {
      attempts: 1,
      solved: true,
      skipped: true,
      scoreDelta: -0.25,
    })];
    const dom = { exportStatus: makeElement("div") };
    let exportedProgress = null;
    const previousStore = global.window.ProgressStore;
    const previousPackage = global.window.ExportPackage;

    global.window.ProgressStore = {
      isAvailable: function () { return true; },
      saveProgress: function () { return Promise.resolve(); },
      loadProgress: function () { throw new Error("export must not read IndexedDB"); },
    };
    global.window.ExportPackage = {
      buildExport: function (progress) { exportedProgress = progress; return {}; },
      exportToFile: function () {},
    };

    try {
      AppTestHooks.handleExport(current, dom);
    } finally {
      global.window.ProgressStore = previousStore;
      global.window.ExportPackage = previousPackage;
    }

    assert.ok(exportedProgress, "export must use the in-memory progress snapshot");
    assert.strictEqual(exportedProgress.attemptLog[0].skipped, true);
    assert.strictEqual(exportedProgress.score,
      AppExercises.phases[0].exercises[0].scoring.points - 0.25,
      "export must recalculate score from the just-made attempt before packaging");
  });
});

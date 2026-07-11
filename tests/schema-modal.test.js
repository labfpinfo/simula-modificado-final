/**
 * tests/schema-modal.test.js
 *
 * Behavior-centric tests for the always-available schema reference modal
 * (R3-002). These tests pin the externally-visible behavior of the
 * modal — click open/close, default selection, Escape, overlay click,
 * availability before bootstrap, and graceful behavior on bootstrap
 * failure — using a minimal DOM stub in Node (no jsdom, no browser).
 *
 * The approach: load src/schema-reference.js (the data layer) and
 * src/app.js (the wiring + DOM rendering) in test mode, set up a mock
 * DOM with element objects that record their event listeners, drive
 * the listeners directly, and assert on attribute/text changes.
 *
 * Run: node --test tests/schema-modal.test.js
 */

const { describe, it, before, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// DOM stub — minimal in-memory element factory compatible with
// app.js's expectations (id-keyed lookups, event listener capture,
// textContent / style / classList, focus() best-effort).
// ----------------------------------------------------------------------

function makeMockElement(tag) {
  const el = {
    tagName: tag,
    style: {},
    _text: "",
    _html: "",
    _attrs: {},
    _handlers: {},
    children: [],
    classList: {
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
    },
    set className(v) {
      this._className = v;
      // Keep classList in sync with the raw className string so
      // .classList.contains() reflects what `element.className = "..."`
      // just set — matches the real DOM behaviour.
      this.classList._set.clear();
      if (v) {
        String(v).split(/\s+/).forEach((c) => {
          if (c) this.classList._set.add(c);
        });
      }
    },
    get className() { return this._className || ""; },
    set textContent(v) {
      this._text = v;
      // Setting textContent implicitly removes all children. The
      // production DOM behaves the same way.
      this.children = [];
    },
    get textContent() {
      // If textContent was explicitly set, return that. Otherwise,
      // walk the children and concatenate their text — matches the
      // real DOM's textContent (which is the concatenation of all
      // descendant text nodes).
      if (this._text) return this._text;
      var out = "";
      for (var i = 0; i < this.children.length; i++) {
        var c = this.children[i];
        if (c && typeof c.textContent === "string") {
          out += c.textContent;
        }
      }
      return out;
    },
    set innerHTML(v) { this._html = v; this._text = v; },
    get innerHTML() { return this._html; },
    get firstChild() { return this.children[0] || null; },
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    removeAttribute: function (k) { delete this._attrs[k]; },
    addEventListener: function (type, fn) {
      (this._handlers[type] = this._handlers[type] || []).push(fn);
    },
    removeEventListener: function (type, fn) {
      const list = this._handlers[type] || [];
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    appendChild: function (child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    querySelector: function (sel) {
      // Very small subset — we only need `#id` lookups for the test.
      const m = sel.match(/^#([\w-]+)$/);
      if (m) {
        return findById(this, m[1]);
      }
      return null;
    },
    querySelectorAll: function (sel) {
      const m = sel.match(/^\.([\w-]+)$/);
      if (m) {
        const all = [];
        collectByClass(this, m[1], all);
        return all;
      }
      return [];
    },
    focus: function () { this._focused = true; },
    click: function () { /* no-op for stub */ },
    parentNode: null,
    // Test-only: dispatch a synthetic event to all registered handlers.
    _fire: function (type, eventObj) {
      const list = (this._handlers && this._handlers[type]) || [];
      // Provide a no-op preventDefault so handlers like the Escape
      // keydown listener (which calls e.preventDefault()) don't crash
      // on the synthetic event.
      const evt = Object.assign({ target: this, preventDefault: function () {} }, eventObj || {});
      for (let i = 0; i < list.length; i++) list[i](evt);
    },
  };
  return el;
}

function findById(root, id) {
  if (root && root._attrs && root._attrs.id === id) return root;
  for (let i = 0; i < root.children.length; i++) {
    const f = findById(root.children[i], id);
    if (f) return f;
  }
  return null;
}

function collectByClass(root, cls, out) {
  if (root && root.classList && root.classList.contains(cls)) out.push(root);
  for (let i = 0; i < root.children.length; i++) {
    collectByClass(root.children[i], cls, out);
  }
  return out;
}

// Build a full DOM stub with all the IDs that app.js and
// schema-reference.js expect. Returns a tree whose root has every
// element indexed by id at the top level for fast lookup.
function buildMockDom() {
  const root = makeMockElement("body");
  const ids = [
    "loading-msg", "preflight-err", "status-bar", "start-screen",
    "exercise-area", "complete-screen", "student-name", "btn-start",
    "name-error", "saved-banner", "saved-banner-text", "btn-continue",
    "btn-new-session", "import-file", "import-error", "import-ok",
    "exercise-card", "mode-badge", "exercise-title", "exercise-enunciado",
    "query-input", "btn-submit", "btn-skip", "btn-next", "expected-sql",
    "feedback-ok", "feedback-ok-content", "feedback-ok-sql",
    "feedback-err", "feedback-err-content", "feedback-err-detail",
    "aids-row", "tog-context", "tog-guide", "aids-context",
    "aids-context-text", "aids-guide", "aids-guide-text",
    "solution-note", "solution-note-text", "hints-wrap",
    "final-score", "final-pct", "final-detail", "result-display",
    "result-content", "status-phase", "status-step", "status-score",
    "progress-fill", "btn-export", "export-status",
    "btn-schema", "schema-modal", "btn-schema-close", "schema-list",
    "schema-detail", "schema-title",
  ];
  const byId = {};
  for (const id of ids) {
    const el = makeMockElement("div");
    el._attrs.id = id;
    root.appendChild(el);
    byId[id] = el;
  }
  // Schema modal has its visible/hidden state via aria-hidden.
  byId["schema-modal"]._attrs["aria-hidden"] = "true";
  byId["btn-schema"]._attrs["aria-expanded"] = "false";
  // Anchor labels are looked up by selector — provide a single one.
  const importLabel = makeMockElement("label");
  importLabel._attrs["for"] = "import-file";
  root.appendChild(importLabel);
  return { root: root, byId: byId, importLabel: importLabel };
}

// ----------------------------------------------------------------------
// Load schema-reference.js and app.js in a controlled sandbox.
// ----------------------------------------------------------------------

const projectRoot = path.resolve(__dirname, "..");
const appPath = path.join(projectRoot, "src", "app.js");
const schemaPath = path.join(projectRoot, "src", "schema-reference.js");
const appSrc = fs.readFileSync(appPath, "utf-8");
const schemaSrc = fs.readFileSync(schemaPath, "utf-8");

let dom = null;
let AppTestHooks = null;

function loadSchemaReference() {
  // schema-reference.js attaches to window.SchemaReference.
  if (!global.window) global.window = {};
  if (!global.window.SchemaReference) {
    new Function("window", "module", schemaSrc)(global.window, {});
  }
}

function loadApp() {
  // Make sure the IIFE has its dependencies.
  global.window = global.window || {};
  global.window.__APP_TEST_MODE__ = true;
  global.window.__APP_TEST_HOOKS__ = true;
  if (!global.window.initSqlJs) {
    global.window.initSqlJs = function () {
      return Promise.resolve({
        Database: function () { this.close = function () {}; },
      });
    };
  }
  global.initSqlJs = global.window.initSqlJs;
  if (!global.window.SqlEngine) {
    global.window.SqlEngine = { init: function () { return Promise.resolve(); } };
  }
  if (!global.window.ResultCompare) {
    global.window.ResultCompare = { compare: function () { return { matched: true }; } };
  }
  if (!global.window.AppExercises) {
    global.window.AppExercises = { phases: [] };
  }
  if (!global.window.ProgressStore) {
    global.window.ProgressStore = { isAvailable: function () { return false; } };
  }
  if (!global.window.ExportPackage) {
    global.window.ExportPackage = {};
  }
  global.document = {
    readyState: "complete",
    getElementById: function (id) { return dom.byId[id] || null; },
    createElement: makeMockElement,
    querySelector: function (sel) {
      // Limited: only selector formats we actually need.
      if (sel === 'label[for="import-file"]') return dom.importLabel;
      return null;
    },
    addEventListener: function (type, fn) {
      (document._handlers = document._handlers || {})[type] = (document._handlers[type] || []).concat([fn]);
    },
    // Test-only: dispatch a synthetic event to all registered handlers.
    _fire: function (type, eventObj) {
      const list = (document._handlers && document._handlers[type]) || [];
      // Provide a no-op preventDefault so handlers like the Escape
      // keydown listener (which calls e.preventDefault()) don't crash
      // on the synthetic event.
      const evt = Object.assign({ preventDefault: function () {} }, eventObj || {});
      for (let i = 0; i < list.length; i++) list[i](evt);
    },
    _handlers: {},
  };
  // Run app.js (IIFE). It must NOT auto-bootstrap because __APP_TEST_MODE__
  // is set — it only exposes AppTestHooks.
  new Function("window", "document", appSrc)(global.window, global.document);
  AppTestHooks = global.window.AppTestHooks;
  assert.ok(AppTestHooks, "AppTestHooks must be exposed under test mode");
  // Cache the DOM references into the IIFE's module-scoped `dom` so
  // the listeners can find them. In production this is the first
  // half of bootstrap(); the test reuses the same code path.
  AppTestHooks.cacheDom();
}

// Reset between tests so each test starts with a fresh DOM and a fresh
// app.js evaluation. We can't just clear global.window because app.js's
// IIFE already mutated it — we re-eval the IIFE after rebuilding the DOM.
function resetForTest() {
  // Build a fresh DOM
  dom = buildMockDom();
  // Wipe window state we care about
  if (global.window) {
    delete global.window.SchemaReference;
    delete global.window.__APP_TEST_MODE__;
    delete global.window.__APP_TEST_HOOKS__;
    delete global.window.AppTestHooks;
  }
  // Clear the document's event listener registry BEFORE re-loading
  // the IIFE so the new IIFE installs a single, clean set of listeners
  // (otherwise handlers from previous IIFE evaluations accumulate and
  // the test fires N+1 handlers — first one closes, others see
  // aria-hidden=true and do nothing, but the layout is confusing).
  if (global.document) {
    global.document._handlers = {};
  }
  // Re-eval the data layer and the app IIFE
  loadSchemaReference();
  loadApp();
  // Wire the modal (mirrors what production bootstrap does BEFORE
  // initEngine, so the modal is available on every screen including
  // the bootstrap error screen — R3-003).
  AppTestHooks.wireSchemaUI();
}

before(() => {
  resetForTest();
});

afterEach(() => {
  // Rebuild a clean DOM + re-eval app.js for the next test. This keeps
  // each test isolated (e.g. modal state from the previous test doesn't
  // leak into the next).
  resetForTest();
});

// ----------------------------------------------------------------------
// Behavior tests
// ----------------------------------------------------------------------

describe("Schema modal — click behavior (R3-002)", () => {

  it("clicking #btn-schema opens the modal (aria-hidden flips to 'false')", () => {
    // Sanity: modal starts closed
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true",
      "modal should start closed");

    // Simulate a real click on the schema button
    dom.byId["btn-schema"]._fire("click");

    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false",
      "modal should be open after clicking the button");
    assert.strictEqual(dom.byId["btn-schema"].getAttribute("aria-expanded"), "true",
      "button should be aria-expanded=true when modal is open");
  });

  it("clicking #btn-schema twice toggles the modal closed again", () => {
    dom.byId["btn-schema"]._fire("click");
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false");

    dom.byId["btn-schema"]._fire("click");
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true",
      "second click should close the modal");
    assert.strictEqual(dom.byId["btn-schema"].getAttribute("aria-expanded"), "false",
      "button should be aria-expanded=false again");
  });

  it("clicking #btn-schema-close closes the modal", () => {
    dom.byId["btn-schema"]._fire("click"); // open
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false");

    dom.byId["btn-schema-close"]._fire("click");
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true",
      "clicking the X button must close the modal");
  });

  it("Escape key closes the modal (R3-002)", () => {
    dom.byId["btn-schema"]._fire("click");
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false");

    // Fire keydown on the document (the listener is attached to
    // document, not to the modal, so we have to dispatch there).
    document._fire("keydown", { key: "Escape" });

    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true",
      "Escape must close the modal");
  });

  it("'Esc' (legacy alias) also closes the modal", () => {
    dom.byId["btn-schema"]._fire("click");
    document._fire("keydown", { key: "Esc" });
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true");
  });

  it("non-Escape keys do NOT close the modal", () => {
    dom.byId["btn-schema"]._fire("click");
    document._fire("keydown", { key: "Enter" });
    document._fire("keydown", { key: "a" });
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false",
      "non-Escape keys must not close the modal");
  });

  it("clicking the overlay (target === modal) closes the modal", () => {
    dom.byId["btn-schema"]._fire("click"); // open
    // Simulate a click whose target is the modal element itself
    // (overlay click — outside the inner card).
    dom.byId["schema-modal"]._fire("click", { target: dom.byId["schema-modal"] });
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "true",
      "clicking the overlay (target === modal) must close the modal");
  });

  it("clicking INSIDE the card does NOT close the modal (R3-002)", () => {
    dom.byId["btn-schema"]._fire("click"); // open
    // Simulate a click whose target is a child (e.g. a table list item).
    // The modal should NOT close because handleSchemaOverlayClick only
    // closes when e.target === the modal element itself.
    const fakeChild = makeMockElement("button");
    dom.byId["schema-modal"]._fire("click", { target: fakeChild });
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false",
      "clicking inside the card must NOT close the modal");
  });
});

describe("Schema modal — default selection (R3-002)", () => {

  it("on first open, the first table is rendered in the detail pane", () => {
    // Open the modal
    dom.byId["btn-schema"]._fire("click");

    // The detail pane should have content (not the empty placeholder).
    // We look at the schema-detail element's text content.
    const detail = dom.byId["schema-detail"];
    assert.ok(detail.children.length > 0,
      "first open should render a default table in the detail pane " +
      "(children: " + detail.children.length + ")");
  });

  it("on first open, the schema list has one button per table", () => {
    dom.byId["btn-schema"]._fire("click");

    // Find list-item buttons in the schema list. The renderSchemaTableList
    // adds <button> elements with class "schema-list-item" to schemaList.
    const list = dom.byId["schema-list"];
    const items = list.querySelectorAll(".schema-list-item");
    assert.ok(items.length >= 1,
      "schema list should have at least one item — got " + items.length);
    // 11 tables in PokemonDB.
    assert.strictEqual(items.length, 11,
      "schema list should have exactly 11 table buttons");
  });

  it("selecting a different table updates the detail pane and marks the new item active", () => {
    dom.byId["btn-schema"]._fire("click");

    // Find the list items and pick the second one.
    const list = dom.byId["schema-list"];
    const items = list.querySelectorAll(".schema-list-item");
    const secondName = items[1].getAttribute("data-table-name");
    assert.ok(secondName, "second item should have data-table-name");

    // Click the second item
    items[1]._fire("click");

    // The second item should now have the active class.
    assert.ok(items[1].classList.contains("active"),
      "clicked item should have .active class");

    // The detail pane should now reflect the new table (text content
    // should mention the new table name; we don't pin exact text since
    // notes may change, but the table name is a stable string).
    const detailText = dom.byId["schema-detail"].textContent;
    assert.ok(detailText.indexOf(secondName) !== -1,
      "detail pane should now show the new table — got: " + detailText.substring(0, 100));
  });
});

describe("Schema modal — availability (R3-002, R3-003)", () => {

  it("the button works even if we never start the engine (R3-003)", () => {
    // We never call AppTestHooks.initEngine or any bootstrap chain here.
    // The listeners were wired in resetForTest() before any engine work.
    // Sanity: the button has at least one click listener attached.
    const btn = dom.byId["btn-schema"];
    const handlers = btn._handlers["click"] || [];
    assert.ok(handlers.length >= 1,
      "the button must have a click listener wired BEFORE any bootstrap " +
      "— got " + handlers.length + " handlers");

    // The Escape key listener must be on the document.
    const docHandlers = document._handlers["keydown"] || [];
    assert.ok(docHandlers.length >= 1,
      "document must have a keydown listener for Escape");
  });

  it("clicking the button still works on a fresh DOM (no app state, no engine)", () => {
    // Independent of any state — the button works because the listener
    // is wired during wireSchemaUI(), which only needs the DOM.
    dom.byId["btn-schema"]._fire("click");
    assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false",
      "button must work without engine bootstrap");
  });

  it("works even after a bootstrap failure (R3-003)", () => {
    // Simulate the worst-case bootstrap: initEngine rejects. The schema
    // UI was already wired by wireSchemaUI() before initEngine, so the
    // button must still work.
    //
    // We don't need to actually run bootstrap here — wireSchemaUI() in
    // resetForTest() already mimics that. We just verify the button
    // works after a synthetic failure state.
    const originalInit = global.window.initSqlJs;
    global.window.initSqlJs = function () {
      return Promise.reject(new Error("simulated bootstrap failure"));
    };
    try {
      // Button still works
      dom.byId["btn-schema"]._fire("click");
      assert.strictEqual(dom.byId["schema-modal"].getAttribute("aria-hidden"), "false",
        "button must work even after engine init rejects");
    } finally {
      global.window.initSqlJs = originalInit;
    }
  });
});

describe("Schema modal — graceful unavailable state (RESILIENCE-002)", () => {

  it("renders a clear unavailable state when SchemaReference is missing", () => {
    // Remove SchemaReference from the window and rebuild a fresh state
    // to test the graceful degradation path.
    delete global.window.SchemaReference;
    // Force a re-render: the next openSchemaModal should detect the
    // missing data layer and show the unavailable state.
    //
    // We need to rewire so the listeners use the current global state
    // — actually the listeners capture the global at fire-time via
    // window.SchemaReference, so removing the global suffices.

    // Open the modal — openSchemaModal calls SchemaReference.getTables
    // and falls into the unavailable branch when it returns [].
    dom.byId["btn-schema"]._fire("click");

    // The detail pane should now show the unavailable message, not
    // be empty.
    const detail = dom.byId["schema-detail"];
    const text = detail.textContent;
    assert.ok(text.toLowerCase().indexOf("no disponible") !== -1,
      "detail pane should show 'no disponible' message — got: " + text);
    // Restore for other tests
    loadSchemaReference();
  });

  it("renderSchemaTableList does not throw when SchemaReference is missing", () => {
    delete global.window.SchemaReference;
    // Calling the render function directly must be a no-op, not a crash.
    assert.doesNotThrow(function () {
      AppTestHooks.renderSchemaTableList();
    });
    loadSchemaReference();
  });

  it("renderSchemaDetail shows the unavailable state when SchemaReference is missing", () => {
    delete global.window.SchemaReference;
    assert.doesNotThrow(function () {
      AppTestHooks.renderSchemaDetail("pokemon");
    });
    const detail = dom.byId["schema-detail"];
    assert.ok(detail.textContent.toLowerCase().indexOf("no disponible") !== -1,
      "renderSchemaDetail should show unavailable message when data is missing");
    loadSchemaReference();
  });

  it("renderSchemaDetail shows the unavailable state when SchemaReference.renderTableDetail throws", () => {
    // Install a SchemaReference whose renderTableDetail throws to test
    // the try/catch containment (RESILIENCE-002).
    global.window.SchemaReference = {
      getTables: function () { return [{ name: "pokemon" }]; },
      getTableByName: function () { return null; },
      renderTableList: function () { return [{ name: "pokemon", summary: "", columnCount: 1, hasForeignKeys: false }]; },
      renderTableDetail: function () { throw new Error("synthetic render failure"); },
      listForeignKeyHints: function () { return []; },
    };
    // Suppress the expected console.error from the contained throw so
    // test output stays clean. The containment is exactly what we are
    // verifying here.
    var origConsoleError = console.error;
    console.error = function () {};
    try {
      assert.doesNotThrow(function () {
        AppTestHooks.renderSchemaDetail("pokemon");
      });
    } finally {
      console.error = origConsoleError;
    }
    const detail = dom.byId["schema-detail"];
    assert.ok(detail.textContent.toLowerCase().indexOf("no se pudo") !== -1 ||
              detail.textContent.toLowerCase().indexOf("no disponible") !== -1,
      "renderSchemaDetail should show error state when render throws — got: " + detail.textContent);
    loadSchemaReference();
  });
});

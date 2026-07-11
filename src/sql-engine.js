/**
 * sql-engine.js
 *
 * Browser-local SQL execution engine using SQL.js.
 *
 * Load this AFTER sql-wasm-browser.js (which exposes global `initSqlJs`).
 * Exposes window.SqlEngine for ordered non-module <script> tag loading.
 * Compatible with file:// double-click opening.
 *
 * Architecture:
 *   - Init loads the WASM-based SQL.js runtime and stores raw seed bytes.
 *   - Each execute() call clones the seed into a fresh in-memory database,
 *     runs the student SQL against it, and returns the result set or error.
 *   - Only SELECT statements are allowed (INSERT/UPDATE/DELETE/DROP/etc.
 *     are blocked to protect the seed).
 */
(function () {
  "use strict";

  // SELECT or WITH (CTE) — both are read-only queries. WITH is allowed
  // because the database is cloned per execution: even an accidental
  // write inside a CTE-shaped statement cannot damage the seed.
  var SELECT_RE = /^\s*(SELECT|WITH)\b/i;

  /**
   * Returns true when `sql` is exactly one SELECT statement.
   *
   * Allows an optional trailing `;` followed by whitespace.  Semicolons
   * inside single-quoted string literals are ignored so that
   * `SELECT 'hello; world'` is not flagged as compound.
   *
   * Leading SQL comments (-- line comments and slash-star block comments)
   * are stripped before validation.
   *
   * Compound SQL like `SELECT 1; DROP TABLE pokemon` is blocked.
   */
  function _isSingleSelect(sql) {
    var trimmed = sql.trim();

    // Strip leading SQL comments (line comments and block comments).
    // Loop because comments can be stacked.
    while (trimmed.length > 0) {
      if (trimmed.startsWith("--")) {
        // Line comment — strip to end of line
        var nl = trimmed.indexOf("\n");
        if (nl === -1) trimmed = "";
        else trimmed = trimmed.slice(nl + 1).trim();
      } else if (trimmed.startsWith("/*")) {
        // Block comment — strip to closing */
        var end = trimmed.indexOf("*/", 2);
        if (end === -1) return false; // unterminated block comment
        trimmed = trimmed.slice(end + 2).trim();
      } else {
        break;
      }
    }

    if (!SELECT_RE.test(trimmed)) return false;

    // Strip optional trailing semicolon and surrounding whitespace
    if (trimmed.endsWith(";")) {
      trimmed = trimmed.slice(0, -1).trim();
    }

    // Walk the remaining string — any unquoted semicolon is a second
    // statement separator → block it. SQL escapes a single quote inside
    // a string by doubling it (''), so `SELECT 'it''s; ok'` must be
    // treated as ONE string literal, not two.
    var inString = false;
    for (var i = 0; i < trimmed.length; i++) {
      var ch = trimmed[i];
      if (ch === "'") {
        if (inString && trimmed[i + 1] === "'") {
          i++; // escaped quote inside a string literal — skip both
          continue;
        }
        inString = !inString;
      } else if (ch === ";" && !inString) {
        return false;
      }
    }
    return true;
  }

  var SqlEngine = {
    /** @type {boolean} */
    _ready: false,

    /** @type {object|null} — resolved SQL.js module (with Database constructor) */
    _SQL: null,

    /** @type {Uint8Array|null} — raw seed database bytes for cloning */
    _seedBytes: null,

    /**
     * Initialise the engine.
     *
     * The caller is responsible for loading the seed bytes (via fetch, XHR,
     * or an embedded buffer) because loading strategies differ across
     * file:// browsers.  This keeps the engine pure and testable.
     *
     * @param {Object} options
     * @param {ArrayBuffer|Uint8Array} options.seedBuffer — raw SQLite database bytes
     * @param {Function}        [options.locateFile] — passed through to initSqlJs
     *                              to resolve WASM file paths (default:
     *                              same directory as the sql.js script).
     * @returns {Promise<void>}
     */
    init: function (options) {
      var self = this;

      if (!options || typeof options !== "object") {
        return Promise.reject(new Error("options object is required. Provide { seedBuffer: ArrayBuffer|Uint8Array }."));
      }

      var seedBuffer = options.seedBuffer;
      var locateFile = options.locateFile || null;

      if (!seedBuffer || !(seedBuffer instanceof ArrayBuffer || seedBuffer instanceof Uint8Array)) {
        return Promise.reject(new Error("seedBuffer is required and must be an ArrayBuffer or Uint8Array"));
      }

      var initOpts = {};
      if (typeof locateFile === "function") {
        initOpts.locateFile = locateFile;
      }

      // initSqlJs is a global provided by sql-wasm-browser.js
      if (typeof initSqlJs !== "function") {
        return Promise.reject(
          new Error("initSqlJs not found. Load sql-wasm-browser.js before sql-engine.js.")
        );
      }

      return initSqlJs(initOpts).then(function (SQL) {
        self._SQL = SQL;
        self._seedBytes = new Uint8Array(seedBuffer);
        self._ready = true;
      });
    },

    /**
     * Execute a SQL query against a fresh clone of the seed database.
     *
     * Only SELECT statements are permitted.  Each call creates a new
     * in-memory database from the stored seed bytes to prevent any
     * cross-execution side effects.
     *
     * @param {string} sql — the SQL statement to execute
     * @returns {{columns: string[], rows: any[][]} | {error: string}}
     */
    execute: function (sql) {
      if (!this._ready) {
        return { error: "Engine not initialised. Call init() first." };
      }

      if (!_isSingleSelect(sql)) {
        return { error: "Only a single SELECT statement is allowed." };
      }

      var db = null;
      try {
        // Clone seed into a fresh database
        db = new this._SQL.Database(this._seedBytes);

        var results = db.exec(sql);

        if (!results || results.length === 0) {
          // Statement produced no result rows (valid for DDL, but we block
          // non-SELECT above; this handles SELECT that returns nothing).
          return { columns: [], rows: [] };
        }

        // sql.js may return multiple result objects for compound statements,
        // but since we only allow a single SELECT, we take the first one.
        return {
          columns: results[0].columns,
          rows: results[0].values,
        };
      } catch (e) {
        return { error: e.message };
      } finally {
        if (db) {
          db.close();
        }
      }
    },

    /**
     * Check whether the engine has been successfully initialised.
     * @returns {boolean}
     */
    isReady: function () {
      return this._ready;
    },
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  window.SqlEngine = SqlEngine;
})();

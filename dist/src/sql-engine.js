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
 *   - Only one read-only SELECT query is allowed. Mutations, transaction or
 *     control statements, and data-modifying CTEs are blocked before SQLite
 *     receives them.
 */
(function () {
  "use strict";

  var FORBIDDEN_KEYWORDS = {
    ALTER: true,
    ANALYZE: true,
    ATTACH: true,
    BEGIN: true,
    COMMIT: true,
    CREATE: true,
    DELETE: true,
    DETACH: true,
    DROP: true,
    END: true,
    INSERT: true,
    PRAGMA: true,
    REINDEX: true,
    RELEASE: true,
    REPLACE: true,
    ROLLBACK: true,
    SAVEPOINT: true,
    TRANSACTION: true,
    UPDATE: true,
    VACUUM: true,
  };

  /**
   * Tokenize just enough SQLite syntax to enforce the execution boundary.
   * Quoted values, identifiers, and comments are ignored so their contents
   * cannot be mistaken for SQL keywords or statement separators. This is a
   * policy guard, not a general-purpose SQL parser.
   *
   * @returns {Array<{value: string, depth: number}>|null}
   */
  function _tokenizeForPolicy(sql) {
    var tokens = [];
    var depth = 0;
    var i = 0;

    while (i < sql.length) {
      var ch = sql[i];

      if (/\s/.test(ch)) {
        i++;
      } else if (ch === "-" && sql[i + 1] === "-") {
        i += 2;
        while (i < sql.length && sql[i] !== "\n") i++;
      } else if (ch === "/" && sql[i + 1] === "*") {
        var commentEnd = sql.indexOf("*/", i + 2);
        if (commentEnd === -1) return null;
        i = commentEnd + 2;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        var quote = ch;
        i++;
        while (i < sql.length) {
          if (sql[i] === quote) {
            if (sql[i + 1] === quote) {
              i += 2;
              continue;
            }
            i++;
            break;
          }
          i++;
        }
        if (i > sql.length || sql[i - 1] !== quote) return null;
      } else if (ch === "[") {
        var identifierEnd = sql.indexOf("]", i + 1);
        if (identifierEnd === -1) return null;
        i = identifierEnd + 1;
      } else if (ch === "(") {
        tokens.push({ value: "(", depth: depth });
        depth++;
        i++;
      } else if (ch === ")") {
        if (depth === 0) return null;
        depth--;
        tokens.push({ value: ")", depth: depth });
        i++;
      } else if (ch === ";") {
        tokens.push({ value: ";", depth: depth });
        i++;
      } else if (/[A-Za-z_]/.test(ch)) {
        var start = i;
        i++;
        while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
        tokens.push({ value: sql.slice(start, i).toUpperCase(), depth: depth });
      } else {
        i++;
      }
    }

    return depth === 0 ? tokens : null;
  }

  /**
   * Returns true when `sql` is exactly one read-only SELECT query.
   *
   * Allows an optional trailing `;` followed by whitespace.  Semicolons
   * inside single-quoted string literals are ignored so that
   * `SELECT 'hello; world'` is not flagged as compound.
   *
   * `WITH` is accepted only when its outer statement is SELECT. Forbidden
   * keywords are rejected even inside a CTE, preventing a mutation from
   * being hidden behind a WITH prefix.
   */
  function _isSingleSelect(sql) {
    if (typeof sql !== "string") return false;

    var tokens = _tokenizeForPolicy(sql);
    if (!tokens || tokens.length === 0) return false;

    if (tokens[tokens.length - 1].value === ";") tokens.pop();
    if (tokens.length === 0) return false;

    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].value === ";" || FORBIDDEN_KEYWORDS[tokens[i].value]) {
        return false;
      }
    }

    if (tokens[0].value === "SELECT") return true;
    if (tokens[0].value !== "WITH") return false;

    // A valid CTE query has an outer SELECT after the CTE definitions. The
    // SQLite engine remains responsible for validating its full grammar.
    for (var j = 1; j < tokens.length; j++) {
      if (tokens[j].depth === 0 && tokens[j].value === "SELECT") return true;
    }
    return false;
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
        return { error: "Only one read-only SELECT query is allowed." };
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

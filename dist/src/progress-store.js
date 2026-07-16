/**
 * progress-store.js
 *
 * Browser-local IndexedDB persistence for student progress.
 *
 * Load this AFTER sql-wasm-browser.js, before app.js.
 * Exposes window.ProgressStore for ordered non-module <script> tag loading.
 * Compatible with file:// double-click opening.
 *
 * Schema:
 *   DB name:   simulador-consulta-progress
 *   DB version: 1
 *   Object store: sessions (keyPath: "id")
 *   Key: "current" (single-session per browser)
 *
   * Stored progress shape:
    *   { id, studentName, phaseIndex, exerciseIndex, score, maxScore,
    *     attemptLog, rewards, view, savedAt }
   *   attemptLog entries preserve solved/skipped state and penalties; score
   *   remains an app-calculated cache and is recalculated on restore.
 *
 * If IndexedDB fails, a localStorage recovery copy keeps the current session
 * available for the student. The app surfaces guidance to export that copy.
 */

(function () {
  "use strict";

  var DB_NAME = "simulador-consulta-progress";
  var DB_VERSION = 1;
  var STORE_NAME = "sessions";
  var CURRENT_KEY = "current";
  var FALLBACK_KEY = "simulador-consulta-progress-fallback";

  /** @type {IDBDatabase|null} cached handle */
  var _db = null;

  /** @type {boolean|null} null means "not yet checked" */
  var _available = null;
  var _status = { backend: "indexeddb", message: "" };

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  /**
   * Check whether IndexedDB is available in this browser context.
   * Cached after first call — IndexedDB availability doesn't change mid-session.
   * @returns {boolean}
   */
  function idbAvailable() {
    if (_available !== null) return _available;
    try {
      _available = typeof indexedDB !== "undefined" && indexedDB !== null;
    } catch (_e) {
      _available = false;
    }
    return _available;
  }

  /**
   * Open (or reuse) the IndexedDB database.
   * Returns a promise that resolves with the IDBDatabase handle.
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!idbAvailable()) {
        reject(new Error("IndexedDB no está disponible en este navegador."));
        return;
      }
      if (_db) {
        resolve(_db);
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = /** @type {IDBDatabase} */ (e.target.result);
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = function (e) {
        _db = /** @type {IDBDatabase} */ (e.target.result);
        resolve(_db);
      };
      req.onerror = function (e) {
        reject(new Error("No se pudo abrir IndexedDB: " +
          ((e.target && e.target.error && e.target.error.message) || "error desconocido")));
      };
      req.onblocked = function () {
        reject(new Error("IndexedDB bloqueada — cierra otras pestañas del simulador."));
      };
    });
  }

  /**
   * Execute a read-write transaction on the sessions store.
   * @param {string} mode — "readonly" or "readwrite"
   * @param {function(IDBObjectStore): IDBRequest} fn
   * @returns {Promise<any>}
   */
  function withStore(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, mode);
        var store = tx.objectStore(STORE_NAME);
        var req = fn(store);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () {
          reject(new Error("Error de IndexedDB: " +
            ((req.error && req.error.message) || "operación fallida")));
        };
      });
    });
  }

  function fallbackAvailable() {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return false;
      var probe = FALLBACK_KEY + "-probe";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function setFallbackStatus(message) {
    _status = { backend: fallbackAvailable() ? "localStorage" : "memory", message: message || "" };
  }

  function fallbackSave(record, message) {
    setFallbackStatus(message);
    if (fallbackAvailable()) {
      try {
        localStorage.setItem(FALLBACK_KEY, JSON.stringify(record));
      } catch (_e) {
        _status = { backend: "memory", message: message || "" };
      }
    }
    return _status;
  }

  function fallbackLoad(message) {
    if (!fallbackAvailable()) {
      if (message) setFallbackStatus(message);
      return null;
    }
    try {
      var raw = localStorage.getItem(FALLBACK_KEY);
      if (!raw) return null;
      setFallbackStatus(message);
      return _validateAndReturn(JSON.parse(raw));
    } catch (_e) {
      return null;
    }
  }

  function buildRecord(progress) {
    return {
      id: CURRENT_KEY,
      studentName: progress.studentName || "",
      selectedAvatar: progress.selectedAvatar || "",
      phaseIndex: progress.phaseIndex || 0,
      exerciseIndex: progress.exerciseIndex || 0,
      score: _safeNum(progress.score, 0),
      maxScore: _safeNum(progress.maxScore, 0),
      attemptLog: _cloneAttemptLog(progress.attemptLog || []),
      rewards: _cloneRewards(progress.rewards || []),
      view: progress.view || "exercises",
      savedAt: new Date().toISOString(),
      menuCollapsed: progress.menuCollapsed === true,
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  var ProgressStore = {
    /**
     * Check whether the storage backend is available.
     * @returns {boolean}
     */
    isAvailable: function () {
      return idbAvailable() || fallbackAvailable();
    },

    getStatus: function () {
      return { backend: _status.backend, message: _status.message };
    },

    /**
     * Save the current progress snapshot to IndexedDB.
     *
     * @param {Object} progress — app-level state to persist
     * @param {string}  progress.studentName
     * @param {number}  progress.phaseIndex
     * @param {number}  progress.exerciseIndex
     * @param {number}  progress.score
     * @param {number}  progress.maxScore
     * @param {Array}   progress.attemptLog
     * @param {string}  [progress.view]   — "start" | "exercises" | "complete"
     * @returns {Promise<void>}
     */
    saveProgress: function (progress) {
      var record = buildRecord(progress);
      if (!idbAvailable()) {
        return Promise.resolve(fallbackSave(record, "IndexedDB no está disponible."));
      }

      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, "readwrite");
          var store = tx.objectStore(STORE_NAME);
          var req = store.put(record);
          req.onsuccess = function () {
            _status = { backend: "indexeddb", message: "" };
            resolve(_status);
          };
          req.onerror = function () {
            reject(new Error("No se pudo guardar el progreso: " +
              ((req.error && req.error.message) || "error desconocido")));
          };
        });
      }).catch(function (err) {
        return fallbackSave(record, err && err.message ? err.message : "No se pudo guardar en IndexedDB.");
      });
    },

    /**
     * Load the last saved progress record.
     * @returns {Promise<Object|null>} Parsed progress or null if nothing saved.
     */
    loadProgress: function () {
      if (!idbAvailable()) return Promise.resolve(fallbackLoad("IndexedDB no está disponible."));

      return withStore("readonly", function (store) {
        return store.get(CURRENT_KEY);
      }).then(function (record) {
        if (!record) return fallbackLoad("");
        _status = { backend: "indexeddb", message: "" };
        return _validateAndReturn(record);
      }).catch(function (err) {
        return fallbackLoad(err && err.message ? err.message : "No se pudo leer IndexedDB.");
      });
    },

    /**
     * Check whether saved progress exists.
     * @returns {Promise<boolean>}
     */
    hasProgress: function () {
      if (!idbAvailable()) return Promise.resolve(!!fallbackLoad("IndexedDB no está disponible."));

      return withStore("readonly", function (store) {
        return store.count(CURRENT_KEY);
      }).then(function (count) {
        return count > 0 || !!fallbackLoad("");
      }).catch(function (err) {
        return !!fallbackLoad(err && err.message ? err.message : "No se pudo leer IndexedDB.");
      });
    },

    /**
     * Clear all saved progress.
     * @returns {Promise<void>}
     */
    clearProgress: function () {
      if (!idbAvailable()) {
        if (fallbackAvailable()) localStorage.removeItem(FALLBACK_KEY);
        return Promise.resolve();
      }

      return withStore("readwrite", function (store) {
        return store.delete(CURRENT_KEY);
      }).then(function () {
        if (fallbackAvailable()) localStorage.removeItem(FALLBACK_KEY);
      }).catch(function (err) {
        setFallbackStatus(err && err.message ? err.message : "No se pudo borrar IndexedDB.");
      });
    },
  };

  // ==========================================================================
  // Internal
  // ==========================================================================

  /**
   * Deep-clone the attempt log for storage.
   * Strips undefined values and ensures a clean serialisable object.
   * @param {Array} log
   * @returns {Array}
   */
  function _cloneAttemptLog(log) {
    var out = [];
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      out.push({
        exerciseId: entry.exerciseId || "",
        title: entry.title || "",
        attempts: typeof entry.attempts === "number" ? entry.attempts : 0,
        hintsUsed: typeof entry.hintsUsed === "number" ? entry.hintsUsed : 0,
        solved: !!entry.solved,
        // Skipped state — true when the student explicitly skipped the
        // exercise. The exercise is still navigable from the side menu
        // (so the student can return and try it later) but the reference
        // solution is NOT shown for the skipped entry. Older records may
        // not carry this field; default is false.
        skipped: entry.skipped === true,
        scoreDelta: typeof entry.scoreDelta === "number" ? entry.scoreDelta : 0,
        submittedSql: typeof entry.submittedSql === "string" ? entry.submittedSql : "",
      });
    }
    return out;
  }

  function _cloneRewards(rewards) {
    if (!Array.isArray(rewards)) return [];
    var out = [];
    for (var i = 0; i < rewards.length; i++) {
      if (typeof rewards[i] === "string") out.push(rewards[i]);
    }
    return out;
  }

  /**
   * Validate a loaded record has the expected shape.
   * Returns the record if valid, null otherwise.
   * @param {Object} record
   * @returns {Object|null}
   */
  function _validateAndReturn(record) {
    if (!record || typeof record !== "object") return null;
    if (typeof record.studentName !== "string") return null;
    if (typeof record.phaseIndex !== "number") return null;
    if (typeof record.exerciseIndex !== "number") return null;
    if (typeof record.score !== "number" || !isFinite(record.score)) return null;
    if (typeof record.maxScore !== "number" || !isFinite(record.maxScore) || record.maxScore <= 0) return null;
    if (!Array.isArray(record.attemptLog)) return null;
    if (!_validateAttemptLogEntries(record.attemptLog)) return null;
    return record;
  }

  /**
   * Validate each entry in the attempt log has the expected schema.
   * @param {Array} entries
   * @returns {boolean}
   */
  function _validateAttemptLogEntries(entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || typeof e !== "object") return false;
      if (typeof e.exerciseId !== "string") return false;
      if (typeof e.attempts !== "number" || !isFinite(e.attempts) || e.attempts < 0 || Math.floor(e.attempts) !== e.attempts) return false;
      if (typeof e.hintsUsed !== "number" || !isFinite(e.hintsUsed) || e.hintsUsed < 0 || Math.floor(e.hintsUsed) !== e.hintsUsed) return false;
      if (typeof e.scoreDelta !== "number" || !isFinite(e.scoreDelta)) return false;
    }
    return true;
  }

  /**
   * Coerce a value to a safe finite number, returning fallback on NaN/Infinity.
   * @param {*} val
   * @param {number} fallback
   * @returns {number}
   */
  function _safeNum(val, fallback) {
    if (typeof val === "number" && isFinite(val)) return val;
    return fallback;
  }

  if (window.__PROGRESS_STORE_TEST_HOOKS__) {
    window.ProgressStoreTestHooks = {
      cloneAttemptLog: _cloneAttemptLog,
      cloneRewards: _cloneRewards,
      validateAndReturn: _validateAndReturn,
    };
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  window.ProgressStore = ProgressStore;
})();

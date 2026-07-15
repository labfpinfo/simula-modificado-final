/**
 * export-package.js
 *
 * Export/import workflow for the Database Exercise Simulator.
 *
 * Load this AFTER progress-store.js, before app.js.
 * Exposes window.ExportPackage for ordered non-module <script> tag loading.
 * Compatible with file:// double-click opening.
 *
 * Export format:
 *   A self-contained HTML file. When opened directly in a browser, it displays
 *   a teacher-readable review (student name, score, attempt summary).
 *   Embedded in a hidden <script type="application/json"> tag is the full
 *   continuation state for re-import into the simulator.
 *
 * Import:
 *   Reads the exported HTML file via FileReader, extracts the continuation
 *   JSON from the embedded script tag, validates it, and returns the
 *   progress object ready for restoration.
 *
 * Structure:
 *   ExportPackage = { version, exportedAt, review, continuation: Progress }
 *   Progress = { studentName, phaseIndex, exerciseIndex, score, maxScore,
 *                view, menuCollapsed, attemptLog, savedAt }
 *   view is one of: "start" | "exercises" | "complete" — preserved so
 *   import restores the correct screen (e.g. completed exports land on
 *   the complete view, not the exercise view).
 *   menuCollapsed (optional, boolean) — preserves the student's side-
 *   menu collapse preference across a cross-browser continuation.
 *   attemptLog entries carry strict boolean `solved` and `skipped` values;
 *   imports reject malformed or duplicate entries before app state changes.
 */

(function () {
  "use strict";

  var EXPORT_VERSION = "1.0";

  // ==========================================================================
  // Public API
  // ==========================================================================

  var ExportPackage = {
    /** @type {string} current export schema version */
    VERSION: EXPORT_VERSION,

    /**
     * Build the export package from the current app state.
     *
     * @param {Object} progress — same shape as ProgressStore saves
     * @param {string}  progress.studentName
     * @param {number}  progress.phaseIndex
     * @param {number}  progress.exerciseIndex
     * @param {number}  progress.score
     * @param {number}  progress.maxScore
     * @param {string} [progress.view] — "start" | "exercises" | "complete"
     * @param {boolean} [progress.menuCollapsed] — side-menu state
     * @param {Array}   progress.attemptLog — each entry MAY include
     *   `skipped: boolean` to preserve the no-reveal skip contract
     * @returns {{version: string, exportedAt: string, review: Object, continuation: Object}}
     */
    buildExport: function (progress) {
      progress = progress || {};

      var review = _buildReview(progress);
      var continuation = _buildContinuation(progress);

      return {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        review: review,
        continuation: continuation,
      };
    },

    /**
     * Generate a self-contained teacher-readable HTML file as a string.
     *
     * @param {Object} exportPkg — result from buildExport()
     * @returns {string} — complete HTML document
     */
    generateExportHTML: function (exportPkg) {
      var pkg = exportPkg || {};
      var review = pkg.review || {};
      var continuation = pkg.continuation || {};
      var continuationJSON = JSON.stringify(continuation, null, 2);

      return _renderExportHTML(review, continuationJSON, pkg.exportedAt);
    },

    /**
     * Trigger a browser download of the export HTML.
     *
     * Uses a Blob + object URL + temporary anchor click.
     * Works under file:// protocol (no fetch needed).
     *
     * @param {Object} exportPkg — result from buildExport()
     * @param {string} [filename] — default: "simulacro-sql-NOMBRE.html"
     */
    exportToFile: function (exportPkg, filename) {
      var html = this.generateExportHTML(exportPkg);
      var safeName = _safeFilename(
        filename ||
        ((exportPkg.review && exportPkg.review.studentName)
          ? "simulacro-sql-" + exportPkg.review.studentName + ".html"
          : "simulacro-sql-export.html")
      );
      var blob = new Blob([html], { type: "text/html;charset=utf-8" });
      var url = URL.createObjectURL(blob);

      var a = document.createElement("a");
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the object URL after a short delay
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    },

    /**
     * Import a continuation package from a File object (from <input type="file">).
     *
     * Reads the file, extracts the continuation JSON, validates it,
     * and returns the progress object.
     *
     * @param {File} file — the selected HTML export file
     * @returns {Promise<Object>} — the continuation progress object
     * @throws {Error} if the file is invalid, unreadable, or malformed
     */
    importFromFile: function (file) {
      if (!file) {
        return Promise.reject(new Error("No se seleccionó ningún archivo."));
      }

      return _readFileAsText(file).then(function (text) {
        var extracted = _extractContinuation(text);
        if (!extracted) {
          throw new Error(
            "El archivo no contiene datos de continuación válidos. " +
            "Asegúrate de que es un archivo de exportación del Simulador SQL."
          );
        }
        return _validateProgress(extracted);
      });
    },

    /**
     * Validate that raw data (e.g., from import) matches the expected
     * continuation shape.
     *
     * @param {*} data
     * @returns {Object} — the validated progress object
     * @throws {Error} if validation fails
     */
    validateProgress: function (data) {
      return _validateProgress(data);
    },
  };

  // ==========================================================================
  // Internal — review builder
  // ==========================================================================

  /**
   * Build the teacher-readable review section.
   * @param {Object} progress
   * @returns {Object}
   */
  function _buildReview(progress) {
    var studentName = progress.studentName || "(sin nombre)";
    var score = typeof progress.score === "number" ? progress.score : 0;
    var maxScore = typeof progress.maxScore === "number" ? progress.maxScore : 1;
    var pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    var log = progress.attemptLog || [];
    var totalExercises = log.length;
    var solvedCount = 0;
    var totalAttempts = 0;
    var totalHints = 0;

    for (var i = 0; i < log.length; i++) {
      if (log[i].solved) solvedCount++;
      totalAttempts += log[i].attempts || 0;
      totalHints += log[i].hintsUsed || 0;
    }

    var phaseIndex = typeof progress.phaseIndex === "number" ? progress.phaseIndex : 0;
    var exerciseIndex = typeof progress.exerciseIndex === "number" ? progress.exerciseIndex : 0;

    // Count completed exercises up to current position
    var completedCount = 0;
    for (var j = 0; j < log.length; j++) {
      // An exercise is "completed" if the student has advanced past it,
      // OR if it's the current exercise and is solved/skipped.
      // For review purposes, we count entries in the log that have data.
      if (log[j].attempts > 0 || log[j].solved) completedCount++;
    }

    return {
      studentName: studentName,
      score: score,
      maxScore: maxScore,
      percentage: pct,
      totalExercises: totalExercises,
      solvedExercises: solvedCount,
      completedExercises: completedCount,
      totalAttempts: totalAttempts,
      totalHintsUsed: totalHints,
      phaseIndex: phaseIndex,
      exerciseIndex: exerciseIndex,
      attemptSummaries: log.map(function (entry) {
        return {
          exerciseId: entry.exerciseId || "",
          title: entry.title || "",
          attempts: entry.attempts || 0,
          hintsUsed: entry.hintsUsed || 0,
          solved: !!entry.solved,
          scoreDelta: typeof entry.scoreDelta === "number" ? entry.scoreDelta : 0,
        };
      }),
    };
  }

  /**
   * Build the continuation state from app progress.
   * @param {Object} progress
   * @returns {Object}
   */
  function _buildContinuation(progress) {
    return {
      version: EXPORT_VERSION,
      studentName: progress.studentName || "",
      selectedAvatar: progress.selectedAvatar || "",
      phaseIndex: typeof progress.phaseIndex === "number" ? progress.phaseIndex : 0,
      exerciseIndex: typeof progress.exerciseIndex === "number" ? progress.exerciseIndex : 0,
      score: typeof progress.score === "number" ? progress.score : 0,
      maxScore: typeof progress.maxScore === "number" ? progress.maxScore : 0,
      // Preserve the app view so import restores the correct screen.
      // Allowed values: "start" | "exercises" | "complete".
      // Missing/invalid values are normalised to "exercises" on import.
      view: _normaliseView(progress.view),
      // Side-menu state — preserves the student's collapse preference
      // across an export/import round-trip. Default is expanded (false)
      // for legacy exports that did not carry the field. Stored in
      // IndexedDB (ProgressStore) since the WU5 menu-collapse feature,
      // so a cross-browser continuation should also carry it.
      menuCollapsed: progress.menuCollapsed === true,
      attemptLog: (progress.attemptLog || []).map(function (entry) {
        return {
          exerciseId: entry.exerciseId || "",
          title: entry.title || "",
          attempts: entry.attempts || 0,
          hintsUsed: entry.hintsUsed || 0,
          solved: !!entry.solved,
          // Per-entry skipped flag — the side menu relies on this to
          // mark the exercise as navigable, and the restored render
          // path (renderPhaseExerciseRestored) round-trips the skipped
          // state to keep the "btnNext visible after skip" contract.
          // Default is false for legacy exports that did not carry it.
          skipped: entry.skipped === true,
          scoreDelta: typeof entry.scoreDelta === "number" ? entry.scoreDelta : 0,
          submittedSql: typeof entry.submittedSql === "string" ? entry.submittedSql : "",
        };
      }),
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalise the view value to a known allowed string.
   * Returns one of: "start" | "exercises" | "complete".
   * Anything else (including missing/invalid) becomes "exercises"
   * so we never persist or restore an unknown screen state.
   * @param {*} raw
   * @returns {string}
   */
  function _normaliseView(raw) {
    if (raw === "start" || raw === "exercises" || raw === "complete") {
      return raw;
    }
    return "exercises";
  }

  // ==========================================================================
  // Internal — HTML generation
  // ==========================================================================

  /**
   * Render a self-contained teacher-review HTML document.
   * @param {Object} review
   * @param {string} continuationJSON
   * @returns {string}
   */
  function _renderExportHTML(review, continuationJSON, exportedAtISO) {
    var studentName = _escapeHTML(review.studentName || "(sin nombre)");
    var totalExercises = review.totalExercises || 0;
    var solvedExercises = review.solvedExercises || 0;
    var totalAttempts = review.totalAttempts || 0;
    var totalHintsUsed = review.totalHintsUsed || 0;
    var exportedAt = _formatDate(exportedAtISO);

    // Escape </ in the continuation JSON so it cannot prematurely close
    // the wrapping <script> tag.  Standard practice for JSON-in-HTML.
    var safeContinuationJSON = continuationJSON.replace(/<\//g, "<\\/");

    // Build attempt summary rows
    var attemptRows = "";
    var summaries = review.attemptSummaries || [];
    for (var i = 0; i < summaries.length; i++) {
      var s = summaries[i];
      var statusIcon = s.solved ? "✓" : "✗";
      var statusColor = s.solved ? "#00C060" : "#E5002B";
      attemptRows +=
        '<tr>' +
        '<td style="color:' + statusColor + ';font-weight:700">' + statusIcon + '</td>' +
        '<td>' + _escapeHTML(s.title || s.exerciseId) + '</td>' +
        '<td style="text-align:center">' + (s.attempts || 0) + '</td>' +
        '<td style="text-align:center">' + (s.hintsUsed || 0) + '</td>' +
        '<td style="text-align:right">' + (typeof s.scoreDelta === "number" ? s.scoreDelta.toFixed(2) : "0") + '</td>' +
        '</tr>';
    }

    return '<!DOCTYPE html>\n' +
      '<html lang="es">\n' +
      '<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>Simulacro SQL — ' + studentName + '</title>\n' +
      '<style>\n' +
      '  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n' +
      '  body{font-family:system-ui,sans-serif;background:#F4EFE6;color:#1E1A14;padding:2rem 1rem}\n' +
      '  .report{max-width:600px;margin:0 auto;background:#FDFAF5;border:1.5px solid #D6CCBA;border-radius:12px;padding:2rem;box-shadow:0 2px 8px rgba(0,0,0,0.06)}\n' +
      '  h1{font-size:1.3rem;margin-bottom:0.2rem}\n' +
      '  .meta{font-size:0.82rem;color:#7A6E5A;margin-bottom:1.5rem}\n' +
      '  .review-guidance{background:#FFFBF2;border:1px solid #D4A000;border-radius:8px;padding:0.8rem 1rem;margin-bottom:1.2rem;font-size:0.82rem;line-height:1.5;color:#5D4300}\n' +
      '  .stats{display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1.2rem}\n' +
      '  .stat{background:#FAFAF5;border:1px solid #D6CCBA;border-radius:6px;padding:0.6rem;text-align:center}\n' +
      '  .stat-val{font-size:1.3rem;font-weight:700;color:#4A4030;font-family:monospace}\n' +
      '  .stat-label{font-size:0.7rem;color:#7A6E5A;text-transform:uppercase;letter-spacing:0.05em}\n' +
      '  table{width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:1.2rem}\n' +
      '  th{background:#F0EBE0;color:#4A4030;font-weight:600;padding:0.4rem 0.5rem;text-align:left;border-bottom:2px solid #D6CCBA;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.05em}\n' +
      '  td{padding:0.35rem 0.5rem;border-bottom:1px solid #E8E0D5}\n' +
      '  .footer{font-size:0.72rem;color:#7A6E5A;text-align:center;border-top:1px solid #D6CCBA;padding-top:0.8rem}\n' +
      '  .footer code{font-size:0.72rem;color:#4A4030}\n' +
      '</style>\n' +
      '</head>\n' +
      '<body>\n' +
      '<div class="report">\n' +
      '  <h1>Simulacro SQL — PokemonDB</h1>\n' +
      '  <p class="meta">Estudiante: <strong>' + studentName + '</strong><br>Exportado: ' + exportedAt + '</p>\n' +
      '  <div class="review-guidance">\n' +
      '    Los datos de actividad de este archivo son declarados por el estudiante y no constituyen una calificación. Validá las consultas y recalculá la nota con <code>npm run review-exports -- &lt;carpeta-de-exportaciones&gt;</code>.\n' +
      '  </div>\n' +
      '  <div class="stats">\n' +
      '    <div class="stat"><div class="stat-val">' + solvedExercises + ' / ' + totalExercises + '</div><div class="stat-label">Resueltos</div></div>\n' +
      '    <div class="stat"><div class="stat-val">' + totalAttempts + '</div><div class="stat-label">Intentos totales</div></div>\n' +
      '    <div class="stat"><div class="stat-val">' + totalHintsUsed + '</div><div class="stat-label">Pistas usadas</div></div>\n' +
      '    <div class="stat"><div class="stat-val">' + (totalExercises - solvedExercises) + '</div><div class="stat-label">Sin resolver</div></div>\n' +
      '  </div>\n' +
      '  <table>\n' +
      '    <thead><tr><th></th><th>Ejercicio</th><th>Intentos</th><th>Pistas</th><th>Penaliz.</th></tr></thead>\n' +
      '    <tbody>' + attemptRows + '</tbody>\n' +
      '  </table>\n' +
      '  <div class="footer">\n' +
      '    Simulador SQL — PokemonDB<br>\n' +
      '    <code>v' + EXPORT_VERSION + '</code> — Este archivo incluye datos de continuación.\n' +
      '  </div>\n' +
      '</div>\n' +
      '\n' +
      '<!-- DATOS DE CONTINUACIÓN — No modificar -->\n' +
      '<script type="application/json" id="continuation-data">\n' +
      safeContinuationJSON +
      '\n</script>\n' +
      '</body>\n' +
      '</html>\n';
  }

  // ==========================================================================
  // Internal — file reading and extraction
  // ==========================================================================

  /**
   * Read a File object as text using FileReader.
   * @param {File} file
   * @returns {Promise<string>}
   */
  function _readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(/** @type {string} */ (reader.result));
      };
      reader.onerror = function () {
        reject(new Error("No se pudo leer el archivo. Verificá que es un archivo HTML válido."));
      };
      reader.readAsText(file);
    });
  }

  /**
   * Extract the continuation JSON from an export HTML string.
   *
   * Looks for <script type="application/json" id="continuation-data"> and
   * parses its content.  Handles the JSON being potentially split across
   * lines or indented.
   *
   * @param {string} html
   * @returns {Object|null}
   */
  function _extractContinuation(html) {
    if (!html || typeof html !== "string") return null;

    // Match the continuation script block — the JSON is everything between
    // the opening and closing script tags.
    var re = /<script\s+type="application\/json"\s+id="continuation-data"\s*>([\s\S]*?)<\/script>/i;
    var match = html.match(re);
    if (!match || !match[1]) return null;

    try {
      var data = JSON.parse(match[1].trim());
      return data;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Validate that parsed data matches the continuation shape.
   * @param {*} data
   * @returns {Object} — the validated continuation object
   * @throws {Error}
   */
  function _validateProgress(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Los datos de importación no son válidos (formato incorrecto).");
    }
    if (typeof data.version !== "string" || data.version.length === 0) {
      throw new Error("Los datos no incluyen versión — archivo corrupto o no generado por el simulador.");
    }
    if (typeof data.studentName !== "string") {
      throw new Error("Los datos no incluyen nombre de estudiante — archivo incompleto.");
    }
    if (!_isNonNegativeInteger(data.phaseIndex)) {
      throw new Error("Los datos no incluyen fase válida.");
    }
    if (!_isNonNegativeInteger(data.exerciseIndex)) {
      throw new Error("Los datos no incluyen ejercicio válido.");
    }
    if (typeof data.score !== "number" || !isFinite(data.score) || data.score < 0) {
      throw new Error("Los datos no incluyen puntuación válida.");
    }
    if (typeof data.maxScore !== "number" || !isFinite(data.maxScore) || data.maxScore <= 0) {
      throw new Error("Los datos no incluyen puntuación máxima válida.");
    }
    if (!Array.isArray(data.attemptLog)) {
      throw new Error("Los datos no incluyen registro de intentos.");
    }
    _validateAttemptLogEntries(data.attemptLog, _knownExerciseIds());
    // View is optional in the continuation payload; when present it must
    // be one of the allowed app screen names.  Missing or invalid values
    // are normalised to "exercises" so legacy exports still import cleanly.
    if (data.view !== undefined && !_isAllowedView(data.view)) {
      throw new Error("Valor de vista no válido en la continuación.");
    }
    // menuCollapsed is optional (legacy exports pre-WU5 do not carry it);
    // when present it MUST be a boolean. We never reject a continuation
    // just because the field is missing — _restoreFromProgress defaults
    // to expanded. A wrong-typed value IS rejected so a corrupted file
    // surfaces immediately rather than silently mis-rendering.
    if (data.menuCollapsed !== undefined && typeof data.menuCollapsed !== "boolean") {
      throw new Error("Valor de menuCollapsed no válido en la continuación.");
    }
    return data;
  }

  /**
   * Check whether a raw value is a permitted app view name.
   * @param {*} raw
   * @returns {boolean}
   */
  function _isAllowedView(raw) {
    return raw === "start" || raw === "exercises" || raw === "complete";
  }

  function _isNonNegativeInteger(value) {
    return typeof value === "number" && isFinite(value) && value >= 0 && Math.floor(value) === value;
  }

  /** Return the exercise IDs from the currently loaded canonical bank. */
  function _knownExerciseIds() {
    if (!window.AppExercises || !Array.isArray(window.AppExercises.phases)) {
      throw new Error("No se pudo validar la importación: el banco canónico de ejercicios no está cargado.");
    }
    var ids = {};
    for (var pi = 0; pi < window.AppExercises.phases.length; pi++) {
      var exercises = window.AppExercises.phases[pi].exercises || [];
      for (var ei = 0; ei < exercises.length; ei++) ids[exercises[ei].id] = true;
    }
    return ids;
  }

  /**
   * Validate each attemptLog entry has the expected schema and safe values.
   * @param {Array} entries
   * @throws {Error}
   */
  function _validateAttemptLogEntries(entries, knownExerciseIds) {
    var seen = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || typeof e !== "object") {
        throw new Error("Entrada de intentos inválida en posición " + i + ".");
      }
      if (typeof e.exerciseId !== "string" || !knownExerciseIds[e.exerciseId]) {
        throw new Error("Entrada de intentos sin exerciseId en posición " + i + ".");
      }
      if (seen[e.exerciseId]) {
        throw new Error("El ejercicio " + e.exerciseId + " aparece más de una vez en la importación.");
      }
      seen[e.exerciseId] = true;
      if (typeof e.title !== "string") {
        throw new Error("Título de ejercicio inválido en posición " + i + ".");
      }
      if (typeof e.attempts !== "number" || !isFinite(e.attempts) || e.attempts < 0 || Math.floor(e.attempts) !== e.attempts) {
        throw new Error("Número de intentos inválido en posición " + i + ".");
      }
      if (typeof e.hintsUsed !== "number" || !isFinite(e.hintsUsed) || e.hintsUsed < 0 || Math.floor(e.hintsUsed) !== e.hintsUsed) {
        throw new Error("Número de pistas inválido en posición " + i + ".");
      }
      if (typeof e.scoreDelta !== "number" || !isFinite(e.scoreDelta)) {
        throw new Error("Penalización inválida en posición " + i + ".");
      }
      if (typeof e.solved !== "boolean") {
        throw new Error("Valor de solved no válido en posición " + i + ".");
      }
      if (typeof e.skipped !== "boolean") {
        throw new Error("Valor de skipped no válido en posición " + i + ".");
      }
      if (e.submittedSql !== undefined && typeof e.submittedSql !== "string") {
        throw new Error("SQL enviado no válido en posición " + i + ".");
      }
    }
  }

  // ==========================================================================
  // Internal — utilities
  // ==========================================================================

  /**
   * Format an ISO-8601 date string as a locale-aware display string.
   * Falls back to the current time if input is missing or invalid.
   * @param {string} [isoString]
   * @returns {string}
   */
  function _formatDate(isoString) {
    try {
      if (isoString) {
        var d = new Date(isoString);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString("es-ES");
        }
      }
    } catch (_e) { /* fall through */ }
    return new Date().toLocaleString("es-ES");
  }

  /**
   * Escape HTML special characters for safe rendering.
   * @param {string} str
   * @returns {string}
   */
  function _escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Sanitise a filename to be safe across operating systems.
   * @param {string} name
   * @returns {string}
   */
  function _safeFilename(name) {
    return String(name)
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ _.\-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "simulacro-sql-export.html";
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  window.ExportPackage = ExportPackage;
})();

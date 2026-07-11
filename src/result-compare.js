/**
 * result-compare.js
 *
 * Normalises and compares two SQL result sets (expected vs student).
 *
 * Load this AFTER sql-engine.js (no hard dependency — only needs plain
 * objects with {columns, rows} shape).
 * Exposes window.ResultCompare for ordered non-module <script> tag loading.
 * Compatible with file:// double-click opening.
 *
 * Comparison rules:
 *   - Column names are matched case-insensitively.
 *   - Numeric values are normalised: only canonical strings whose
 *     String↔Number round-trip is lossless are coerced to numbers
 *     (e.g., "42" → 42, "3.14" → 3.14).  Non-canonical representations
 *     ("042", "10.20") stay as strings and must match identically.
 *   - Whitespace is collapsed inside text values.
 *   - When ordered=false, row order is ignored (set-based comparison).
 *   - When normalizeCase=true, text values are lowercased.
 */
(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Value normalisation
  // -----------------------------------------------------------------------

  /**
   * Return a normalised representation of a single cell value.
   *
   * - null/undefined → null (SQL NULL)
   * - Number → Number (preserve)
   * - String whose String↔Number round-trip is lossless → Number
   *   (only canonical forms: "42", "3.14".  "042", "10.20" stay strings)
   * - Other String → trimmed, whitespace-collapsed; optionally lowercased
   */
  function normaliseValue(val, lower) {
    if (val === null || val === undefined) {
      return null;
    }

    if (typeof val === "number") {
      // SQLite REAL vs INTEGER — keep as-is
      return val;
    }

    // Try numeric coercion: only when the trimmed string is exactly
    // parseable and yields a finite number AND its round-trip through
    // String(Number(...)) matches the original.  This means "42" → 42,
    // "3.14" → 3.14, but "042" stays a string (String(42) → "42" ≠ "042"),
    // "10.20" stays a string (String(10.2) → "10.2" ≠ "10.20"), and
    // "1e3" / "0x10" stay strings (not produced by SQLite for our dataset).
    // Only canonical representations survive the round-trip check.
    if (typeof val === "string") {
      var trimmed = val.trim();
      if (trimmed !== "" && !isNaN(trimmed) && String(Number(trimmed)) === trimmed) {
        return Number(trimmed);
      }
    }

    // Fallback: string normalisation
    var s = String(val).trim().replace(/\s+/g, " ");
    if (lower) {
      s = s.toLowerCase();
    }
    return s;
  }

  /**
   * Normalise a column-name list to lowercased, trimmed strings.
   */
  function normaliseColumns(cols) {
    if (!cols) return [];
    var out = [];
    for (var i = 0; i < cols.length; i++) {
      out.push(String(cols[i]).toLowerCase().trim());
    }
    return out;
  }

  /**
   * Deep-compare two normalised values (handles NaN via String fallback).
   */
  function valuesEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a === "number" && typeof b === "number") {
      return isNaN(a) && isNaN(b) ? true : a === b;
    }
    return String(a) === String(b);
  }

  // -----------------------------------------------------------------------
  // Row-level helpers
  // -----------------------------------------------------------------------

  /**
   * Normalise one row (array of cell values).
   */
  function normaliseRow(row, lower) {
    var out = [];
    for (var i = 0; i < row.length; i++) {
      out.push(normaliseValue(row[i], lower));
    }
    return out;
  }

  /**
   * Serialise a normalised row to a stable JSON string key for set-based comparison.
   */
  function rowKey(row) {
    // Use a stable JSON format — arrays with consistent spacing
    return JSON.stringify(row);
  }

  // -----------------------------------------------------------------------
  // Comparison strategies
  // -----------------------------------------------------------------------

  /**
   * Ordered comparison: row[i] must equal row[i] positionally.
   */
  function orderedCompare(expectedRows, actualRows) {
    var details = {
      extraRows: 0,
      missingRows: 0,
      mismatchedRows: [],
      rowCountMatch: expectedRows.length === actualRows.length,
    };

    if (!details.rowCountMatch) {
      details.extraRows = Math.max(0, actualRows.length - expectedRows.length);
      details.missingRows = Math.max(0, expectedRows.length - actualRows.length);
    }

    var minLen = Math.min(expectedRows.length, actualRows.length);
    for (var i = 0; i < minLen; i++) {
      if (!rowsEqual(expectedRows[i], actualRows[i])) {
        details.mismatchedRows.push({
          index: i,
          expected: expectedRows[i],
          actual: actualRows[i],
        });
      }
    }

    return details;
  }

  /**
   * Unordered (set-based) comparison.
   *
   * Builds a frequency map of rows on each side, then compares counts.
   */
  function unorderedCompare(expectedRows, actualRows) {
    var expMap = buildRowMap(expectedRows);
    var actMap = buildRowMap(actualRows);

    var details = {
      extraRows: 0,
      missingRows: 0,
      mismatchedRows: [],
      rowCountMatch: expectedRows.length === actualRows.length,
    };

    // Check expected rows in actual
    var allKeys = {};
    var key;
    for (key in expMap) { allKeys[key] = true; }
    for (key in actMap) { allKeys[key] = true; }

    var keys = Object.keys(allKeys);
    for (var i = 0; i < keys.length; i++) {
      key = keys[i];
      var expCount = expMap[key] || 0;
      var actCount = actMap[key] || 0;

      if (expCount > actCount) {
        details.missingRows += expCount - actCount;
      } else if (actCount > expCount) {
        details.extraRows += actCount - expCount;
      }

      if (expCount !== actCount) {
        details.mismatchedRows.push({
          key: key,
          expectedCount: expCount,
          actualCount: actCount,
        });
      }
    }

    return details;
  }

  /**
   * Build a frequency map { rowKey → count } for a set of normalised rows.
   */
  function buildRowMap(rows) {
    var map = {};
    for (var i = 0; i < rows.length; i++) {
      var key = rowKey(rows[i]);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }

  /**
   * Check whether two normalised rows are equal (element-wise).
   */
  function rowsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  var ResultCompare = {
    /**
     * Compare two result sets.
     *
     * @param {Object} expected — {columns: string[], rows: any[][]}
     * @param {Object} actual   — {columns: string[], rows: any[][]}
     * @param {Object} [options]
     * @param {boolean} [options.ordered=true]       — respect row order
     * @param {boolean} [options.normalizeCase=false] — lowercase text values
     * @returns {{matched: boolean, details: Object}}
     */
    compare: function (expected, actual, options) {
      options = options || {};
      var ordered = options.ordered !== undefined ? options.ordered : true;
      var normalizeCase = options.normalizeCase === true;

      // Guard against null/missing inputs
      if (!expected || !actual) {
        return {
          matched: false,
          details: { error: "Both expected and actual result sets are required." },
        };
      }

      // Normalise columns
      var expCols = normaliseColumns(expected.columns);
      var actCols = normaliseColumns(actual.columns);
      var columnMatch = arraysEqual(expCols, actCols);

      // Normalise rows
      var expRows = (expected.rows || []).map(function (r) { return normaliseRow(r, normalizeCase); });
      var actRows = (actual.rows || []).map(function (r) { return normaliseRow(r, normalizeCase); });

      // Compare
      var rowDetails;
      if (ordered) {
        rowDetails = orderedCompare(expRows, actRows);
      } else {
        rowDetails = unorderedCompare(expRows, actRows);
      }

      rowDetails.columnMatch = columnMatch;

      var matched =
        columnMatch &&
        rowDetails.rowCountMatch &&
        rowDetails.mismatchedRows.length === 0;

      // Pedagogical signal: when the DATA is identical but the column
      // names/aliases differ, flag it so the UI can say "your data is
      // right — check your column names/aliases" instead of a generic
      // "wrong result". Very common with aggregates (COUNT(*) vs AS total).
      rowDetails.columnsOnlyMismatch =
        !columnMatch &&
        expCols.length === actCols.length &&
        rowDetails.rowCountMatch &&
        rowDetails.mismatchedRows.length === 0;

      return {
        matched: matched,
        details: rowDetails,
      };
    },
  };

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  window.ResultCompare = ResultCompare;
})();

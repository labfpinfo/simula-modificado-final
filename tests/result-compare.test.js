/**
 * Node.js automated tests for result-compare.js.
 *
 * The module uses browser globals (window.ResultCompare), so we simulate
 * the minimal browser environment needed.  The comparator logic itself is
 * pure — no DOM, no async, no WASM.
 *
 * Run: node --test tests/result-compare.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Simulate a minimal browser global scope so the IIFE inside
// result-compare.js can attach window.ResultCompare.  Setting
// global.window = {} makes `window.ResultCompare = ...` in the eval'd
// source resolve to `global.window.ResultCompare`.
global.window = {};

// Load the module
const comparatorPath = path.resolve(__dirname, "..", "src", "result-compare.js");
const comparatorSrc = fs.readFileSync(comparatorPath, "utf-8");

// Eval the IIFE source.  The IIFE assigns `window.ResultCompare = ...`
// which reaches `global.window.ResultCompare` because we set up the alias
// above.  No string replacement is needed.
eval(comparatorSrc);

const compare = global.window.ResultCompare.compare;

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("ResultCompare.compare", () => {

  // --- Exact match ---
  it("matches identical ordered result sets", () => {
    const expected = {
      columns: ["id", "name"],
      rows: [[1, "Alice"], [2, "Bob"]],
    };
    const actual = {
      columns: ["id", "name"],
      rows: [[1, "Alice"], [2, "Bob"]],
    };
    const result = compare(expected, actual, { ordered: true });
    assert.strictEqual(result.matched, true);
  });

  // --- Row count mismatch ---
  it("detects row count mismatch", () => {
    const expected = { columns: ["id"], rows: [[1]] };
    const actual = { columns: ["id"], rows: [[1], [2]] };
    const result = compare(expected, actual, { ordered: true });
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.details.rowCountMatch, false);
  });

  // --- Value mismatch ---
  it("detects value mismatch (same length, different data)", () => {
    const expected = { columns: ["id"], rows: [[1]] };
    const actual = { columns: ["id"], rows: [[2]] };
    const result = compare(expected, actual, { ordered: true });
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.details.mismatchedRows.length, 1);
  });

  // --- Unordered match ---
  it("matches same rows in different order with ordered=false", () => {
    const expected = { columns: ["id"], rows: [[1], [2], [3]] };
    const actual = { columns: ["id"], rows: [[3], [1], [2]] };
    const result = compare(expected, actual, { ordered: false });
    assert.strictEqual(result.matched, true);
  });

  // --- Unordered mismatch ---
  it("detects mismatch in unordered mode when rows differ", () => {
    const expected = { columns: ["id"], rows: [[1], [2]] };
    const actual = { columns: ["id"], rows: [[1], [3]] };
    const result = compare(expected, actual, { ordered: false });
    assert.strictEqual(result.matched, false);
  });

  // --- Ordered mismatch ---
  it("detects mismatch in ordered mode when rows differ in order", () => {
    const expected = { columns: ["id"], rows: [[1], [2]] };
    const actual = { columns: ["id"], rows: [[2], [1]] };
    const result = compare(expected, actual, { ordered: true });
    assert.strictEqual(result.matched, false);
  });

  // --- Column case insensitivity ---
  it("matches columns case-insensitively", () => {
    const expected = { columns: ["ID", "NAME"], rows: [[1, "Alice"]] };
    const actual = { columns: ["id", "name"], rows: [[1, "Alice"]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  // --- Numeric normalisation ---
  it("normalises numeric strings to numbers", () => {
    const expected = { columns: ["cnt"], rows: [[10]] };
    const actual = { columns: ["cnt"], rows: [["10"]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  it("normalises numeric values with whitespace", () => {
    const expected = { columns: ["x"], rows: [[42]] };
    const actual = { columns: ["x"], rows: [["  42 "]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  it("does NOT normalise strings that differ in numeric representation (leading zeros)", () => {
    // "042" round-trips: Number("042") → 42, String(42) → "42" ≠ "042"
    const expected = { columns: ["x"], rows: [["042"]] };
    const actual = { columns: ["x"], rows: [[42]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, false);
  });

  it("matches identical non-canonical decimal strings as strings (round-trip fails)", () => {
    // "10.50" round-trip: Number("10.50") → 10.5, String(10.5) → "10.5" ≠ "10.50".
    // Since the round-trip changes the representation, the value stays as
    // the raw string "10.50".  Two identical non-canonical strings still match.
    const expected = { columns: ["x"], rows: [["10.50"]] };
    const actual = { columns: ["x"], rows: [["10.50"]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  // --- Whitespace collapsing ---
  it("collapses whitespace in text values", () => {
    const expected = { columns: ["name"], rows: [["hello world"]] };
    const actual = { columns: ["name"], rows: [["hello   world"]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  // --- Null handling ---
  it("matches null values", () => {
    const expected = { columns: ["x"], rows: [[null]] };
    const actual = { columns: ["x"], rows: [[null]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  it("distinguishes null from string 'null'", () => {
    const expected = { columns: ["x"], rows: [[null]] };
    const actual = { columns: ["x"], rows: [["null"]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, false);
  });

  // --- Empty result sets ---
  it("matches two empty result sets", () => {
    const expected = { columns: ["id"], rows: [] };
    const actual = { columns: ["id"], rows: [] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
  });

  // --- Unordered with duplicates ---
  it("handles unordered comparison with duplicate rows", () => {
    const expected = { columns: ["x"], rows: [[1], [1], [2]] };
    const actual = { columns: ["x"], rows: [[2], [1], [1]] };
    const result = compare(expected, actual, { ordered: false });
    assert.strictEqual(result.matched, true);
  });

  it("detects duplicate count mismatch in unordered mode", () => {
    const expected = { columns: ["x"], rows: [[1], [2]] };
    const actual = { columns: ["x"], rows: [[1], [1]] };
    const result = compare(expected, actual, { ordered: false });
    assert.strictEqual(result.matched, false);
  });

  // --- Column mismatch ---
  it("detects column count mismatch", () => {
    const expected = { columns: ["id", "name"], rows: [[1, "Alice"]] };
    const actual = { columns: ["id"], rows: [[1]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.details.columnMatch, false);
  });

  it("detects column name mismatch", () => {
    const expected = { columns: ["id", "name"], rows: [[1, "Alice"]] };
    const actual = { columns: ["id", "age"], rows: [[1, 30]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.details.columnMatch, false);
  });

  // --- Missing/null inputs ---
  it("rejects null expected", () => {
    const result = compare(null, { columns: [], rows: [] });
    assert.strictEqual(result.matched, false);
    assert.ok(result.details.error);
  });

  it("rejects null actual", () => {
    const result = compare({ columns: [], rows: [] }, null);
    assert.strictEqual(result.matched, false);
    assert.ok(result.details.error);
  });

  // --- normalizeCase option ---
  it("matches mixed-case text when normalizeCase=true", () => {
    const expected = { columns: ["name"], rows: [["ALICE"]] };
    const actual = { columns: ["name"], rows: [["alice"]] };
    const result = compare(expected, actual, { normalizeCase: true });
    assert.strictEqual(result.matched, true);
  });

  it("treats case as significant when normalizeCase=false (default)", () => {
    const expected = { columns: ["name"], rows: [["ALICE"]] };
    const actual = { columns: ["name"], rows: [["alice"]] };
    const result = compare(expected, actual, { normalizeCase: false });
    assert.strictEqual(result.matched, false);
  });

  // --- columnsOnlyMismatch pedagogical signal ---
  it("flags columnsOnlyMismatch when data matches but column names differ", () => {
    const expected = { columns: ["total"], rows: [[5]] };
    const actual = { columns: ["COUNT(*)"], rows: [[5]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, false);
    assert.strictEqual(result.details.columnsOnlyMismatch, true);
  });

  it("does NOT flag columnsOnlyMismatch when the data also differs", () => {
    const expected = { columns: ["total"], rows: [[5]] };
    const actual = { columns: ["COUNT(*)"], rows: [[7]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.details.columnsOnlyMismatch, false);
  });

  it("does NOT flag columnsOnlyMismatch when everything matches", () => {
    const expected = { columns: ["total"], rows: [[5]] };
    const actual = { columns: ["total"], rows: [[5]] };
    const result = compare(expected, actual);
    assert.strictEqual(result.matched, true);
    assert.strictEqual(result.details.columnsOnlyMismatch, false);
  });
});

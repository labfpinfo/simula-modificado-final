/**
 * Node.js automated tests for sql-engine.js.
 *
 * The module uses browser globals (window.SqlEngine, initSqlJs), so we
 * simulate a minimal browser environment.  The engine logic (SELECT
 * validation, result shape, isolation) is testable once we feed it sql.js.
 *
 * Run: node --test tests/sql-engine.test.js
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Simulate a minimal browser global scope so sql-engine.js can attach
// window.SqlEngine.  We also expose initSqlJs via require("sql.js").
// ----------------------------------------------------------------------
global.window = {};
global.initSqlJs = require("sql.js");

// Load the engine source
const enginePath = path.resolve(__dirname, "..", "src", "sql-engine.js");
const engineSrc = fs.readFileSync(enginePath, "utf-8");
eval(engineSrc);

const SqlEngine = global.window.SqlEngine;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Build a small in-memory seed database and return its bytes (Uint8Array).
 */
function buildTestSeed(SQL) {
  var db = new SQL.Database();
  db.run("CREATE TABLE pokemon (id INTEGER PRIMARY KEY, name TEXT, type TEXT, level INTEGER);");
  db.run("INSERT INTO pokemon VALUES (1, 'Pikachu', 'Electric', 25);");
  db.run("INSERT INTO pokemon VALUES (2, 'Charmander', 'Fire', 10);");
  db.run("INSERT INTO pokemon VALUES (3, 'Squirtle', 'Water', 10);");
  db.run("INSERT INTO pokemon VALUES (4, 'Bulbasaur', 'Grass', 12);");
  db.run("INSERT INTO pokemon VALUES (5, 'Jigglypuff', 'Normal', 8);");
  var bytes = db.export();
  db.close();
  return bytes;
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("SqlEngine", () => {
  let SQL;
  let seedBytes;

  before(async () => {
    SQL = await global.initSqlJs();
    seedBytes = buildTestSeed(SQL);
  });

  // --- init validation ---

  describe("init() — error handling", () => {
    it("rejects when called with null options", async () => {
      await assert.rejects(
        () => SqlEngine.init(null),
        /options object is required/
      );
    });

    it("rejects when called with undefined options", async () => {
      await assert.rejects(
        () => SqlEngine.init(undefined),
        /options object is required/
      );
    });

    it("rejects when called with a non-object (string)", async () => {
      await assert.rejects(
        () => SqlEngine.init("not-an-object"),
        /options object is required/
      );
    });

    it("rejects when seedBuffer is missing", async () => {
      await assert.rejects(
        () => SqlEngine.init({}),
        /seedBuffer is required/
      );
    });

    it("rejects when seedBuffer is null", async () => {
      await assert.rejects(
        () => SqlEngine.init({ seedBuffer: null }),
        /seedBuffer is required/
      );
    });

    it("rejects when seedBuffer is a plain string", async () => {
      await assert.rejects(
        () => SqlEngine.init({ seedBuffer: "hello" }),
        /seedBuffer is required/
      );
    });

    it("resolves when given a valid Uint8Array seed", async () => {
      // Reset internal state for this test
      SqlEngine._ready = false;
      SqlEngine._SQL = null;
      SqlEngine._seedBytes = null;
      await SqlEngine.init({ seedBuffer: seedBytes });
      assert.strictEqual(SqlEngine.isReady(), true);
    });

    it("resolves when given a valid ArrayBuffer seed", async () => {
      // Reset and test with ArrayBuffer
      SqlEngine._ready = false;
      SqlEngine._SQL = null;
      SqlEngine._seedBytes = null;
      await SqlEngine.init({ seedBuffer: seedBytes.buffer });
      assert.strictEqual(SqlEngine.isReady(), true);
    });
  });

  // --- uninitialised engine ---

  describe("execute() — uninitialised engine", () => {
    it("returns an error when engine is not initialised", () => {
      // Temporarily set to unready
      var prev = SqlEngine._ready;
      SqlEngine._ready = false;
      var result = SqlEngine.execute("SELECT 1");
      SqlEngine._ready = prev;
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("not initialised"));
    });
  });

  // --- Engine must be re-initialised after reset ---
  // After the above tests, ensure engine is ready.
  before(async () => {
    if (!SqlEngine.isReady()) {
      await SqlEngine.init({ seedBuffer: seedBytes });
    }
  });

  // --- valid SELECT ---

  describe("execute() — valid SELECT", () => {
    it("returns columns and rows for a successful SELECT", () => {
      var result = SqlEngine.execute("SELECT * FROM pokemon WHERE level > 10");
      assert.strictEqual(result.error, undefined);
      assert.deepStrictEqual(result.columns, ["id", "name", "type", "level"]);
      assert.strictEqual(result.rows.length, 2);  // Pikachu (25) + Bulbasaur (12)
    });

    it("returns columns and rows for SELECT COUNT", () => {
      var result = SqlEngine.execute("SELECT COUNT(*) AS cnt FROM pokemon");
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.rows[0][0], 5);
    });

    it("returns empty columns/rows for SELECT with no matches", () => {
      var result = SqlEngine.execute("SELECT * FROM pokemon WHERE level > 999");
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.columns.length, 0);
      assert.strictEqual(result.rows.length, 0);
    });

    it("accepts a trailing semicolon and whitespace", () => {
      var result = SqlEngine.execute("SELECT 1 AS one;  ");
      assert.strictEqual(result.error, undefined);
      assert.deepStrictEqual(result.columns, ["one"]);
      assert.deepStrictEqual(result.rows, [[1]]);
    });

    it("preserves read-only SELECT formatting across lines and indentation", () => {
      var result = SqlEngine.execute(
        "\n  SELECT\n    name,\n    level\n  FROM pokemon\n  WHERE level >= 12\n  ORDER BY level DESC;\n"
      );
      assert.strictEqual(result.error, undefined);
      assert.deepStrictEqual(result.columns, ["name", "level"]);
      assert.deepStrictEqual(result.rows, [["Pikachu", 25], ["Bulbasaur", 12]]);
    });
  });

  // --- SQL error ---

  describe("execute() — SQL errors", () => {
    it("returns an error for invalid SQL syntax", () => {
      var result = SqlEngine.execute("SELEC * FROM pokemon");
      assert.ok(result.error);
      assert.strictEqual(result.error.length > 0, true);
    });

    it("returns an error for invalid table name", () => {
      var result = SqlEngine.execute("SELECT * FROM nonexistent_table");
      assert.ok(result.error);
    });
  });

  // --- Read-only query policy ---

  describe("execute() — read-only query policy", () => {
    it("blocks INSERT", () => {
      var result = SqlEngine.execute("INSERT INTO pokemon VALUES (99, 'Mew', 'Psychic', 50)");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    it("blocks UPDATE", () => {
      var result = SqlEngine.execute("UPDATE pokemon SET level = 99");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    it("blocks DELETE", () => {
      var result = SqlEngine.execute("DELETE FROM pokemon");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    it("blocks DROP TABLE", () => {
      var result = SqlEngine.execute("DROP TABLE pokemon");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    it("blocks CREATE TABLE", () => {
      var result = SqlEngine.execute("CREATE TABLE evil (x INTEGER)");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    // --- Compound SQL bypass attempts ---

    it("blocks compound SQL — SELECT + DROP TABLE with semicolons", () => {
      var result = SqlEngine.execute("SELECT 1; DROP TABLE pokemon");
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes("select"));
    });

    it("blocks compound SQL — SELECT + INSERT", () => {
      var result = SqlEngine.execute("SELECT 1; INSERT INTO pokemon VALUES (99, 'Mew', 'Psychic', 50)");
      assert.ok(result.error);
    });

    it("blocks compound SQL — SELECT + DELETE", () => {
      var result = SqlEngine.execute("SELECT 1; DELETE FROM pokemon");
      assert.ok(result.error);
    });

    it("blocks compound SQL — SELECT + UPDATE", () => {
      var result = SqlEngine.execute("SELECT 1; UPDATE pokemon SET level = 99");
      assert.ok(result.error);
    });

    it("blocks compound SQL — leading comment with trailing DML", () => {
      var result = SqlEngine.execute("-- harmless comment\nSELECT 1; DROP TABLE pokemon");
      assert.ok(result.error);
    });

    it("blocks compound SQL — multiple statements on separate lines", () => {
      var result = SqlEngine.execute("SELECT 1;\nDROP TABLE pokemon");
      assert.ok(result.error);
    });

    it("allows semicolons inside single-quoted string literals in SELECT", () => {
      var result = SqlEngine.execute("SELECT 'hello; world' AS greeting");
      assert.strictEqual(result.error, undefined);
      assert.deepStrictEqual(result.columns, ["greeting"]);
      assert.deepStrictEqual(result.rows, [["hello; world"]]);
    });

    it("allows a SELECT that starts with a block comment", () => {
      var result = SqlEngine.execute("/* find electric types */ SELECT * FROM pokemon WHERE type = 'Electric'");
      assert.strictEqual(result.error, undefined);
      assert.strictEqual(result.rows.length, 1);
      assert.strictEqual(result.rows[0][1], "Pikachu");
    });

    it("blocks data-changing CTEs regardless of casing or comments", () => {
      var queries = [
        "WITH target AS (SELECT id FROM pokemon) DELETE FROM pokemon WHERE id IN (SELECT id FROM target) RETURNING id",
        "/* outer */ wItH target AS (SELECT id FROM pokemon) /* mutation */ uPdAtE pokemon SET level = 99 RETURNING id",
        "WITH target AS (SELECT 99 AS id) iNsErT INTO pokemon (id, name, type, level) SELECT id, 'Mew', 'Psychic', 50 FROM target RETURNING id",
        "WITH removed AS (DELETE FROM pokemon WHERE id = 1 RETURNING id) SELECT * FROM removed",
      ];

      queries.forEach(function (sql) {
        var result = SqlEngine.execute(sql);
        assert.strictEqual(result.error, "Only one read-only SELECT query is allowed.");
      });
    });

    it("blocks control statements and compound queries hidden by comments", () => {
      [
        "BEGIN TRANSACTION",
        "PRAGMA user_version",
        "SELECT 1; /* separator */ DELETE FROM pokemon",
        "SELECT 1; -- separator\n UPDATE pokemon SET level = 99",
      ].forEach(function (sql) {
        var result = SqlEngine.execute(sql);
        assert.strictEqual(result.error, "Only one read-only SELECT query is allowed.");
      });
    });
  });

  // --- Result shape ---

  describe("execute() — result shape", () => {
    it("result object has columns and rows (not error) on success", () => {
      var result = SqlEngine.execute("SELECT * FROM pokemon WHERE id = 1");
      assert.strictEqual(result.error, undefined);
      assert.ok(Array.isArray(result.columns));
      assert.ok(Array.isArray(result.rows));
      assert.strictEqual(result.columns.length, 4);
      assert.strictEqual(result.rows.length, 1);
    });

    it("result object has error string on failure", () => {
      var result = SqlEngine.execute("INSERT INTO pokemon VALUES (1)");
      assert.strictEqual(typeof result.error, "string");
    });
  });

  // --- Per-query isolation ---

  describe("execute() — per-query isolation", () => {
    it("engine re-clones seed: row inserted into a separate DB clone is invisible", () => {
      // Open a separate clone directly via SQL.js, insert a row, close it.
      var rogue = new SQL.Database(seedBytes);
      rogue.run("INSERT INTO pokemon VALUES (99, 'Mew', 'Psychic', 50)");
      rogue.close();

      // The engine should still see only the original 5 rows.
      var result = SqlEngine.execute("SELECT COUNT(*) AS cnt FROM pokemon");
      assert.strictEqual(result.rows[0][0], 5);
    });

    it("consecutive execute calls see the same original seed", () => {
      var r1 = SqlEngine.execute("SELECT COUNT(*) AS cnt FROM pokemon");
      var r2 = SqlEngine.execute("SELECT COUNT(*) AS cnt FROM pokemon");
      assert.strictEqual(r1.rows[0][0], r2.rows[0][0]);
      assert.strictEqual(r1.rows[0][0], 5);
    });
  });

  // --- CTE (WITH) support & escaped-quote handling ---

  describe("execute() — WITH (CTE) and escaped quotes", () => {
    it("allows a WITH ... SELECT (CTE) query", () => {
      var result = SqlEngine.execute(
        "WITH fuertes AS (SELECT * FROM pokemon WHERE level > 30) " +
        "SELECT COUNT(*) AS cnt FROM fuertes");
      assert.ok(!result.error, "CTE query must not be rejected: " + (result.error || ""));
      assert.strictEqual(result.columns[0], "cnt");
    });

    it("allows a formatted multiline read-only CTE", () => {
      var result = SqlEngine.execute(
        "WITH fuertes AS (\n" +
        "  SELECT name, level\n" +
        "  FROM pokemon\n" +
        "  WHERE level >= 12\n" +
        ")\n" +
        "SELECT name\n" +
        "FROM fuertes\n" +
        "ORDER BY level DESC;"
      );
      assert.strictEqual(result.error, undefined);
      assert.deepStrictEqual(result.rows, [["Pikachu"], ["Bulbasaur"]]);
    });

    it("allows a recursive read-only CTE while rejecting mutations in CTEs", () => {
      var result = SqlEngine.execute(
        "WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < 3) SELECT n FROM nums"
      );
      assert.ok(!result.error, "recursive read-only CTE must remain valid: " + (result.error || ""));
      assert.deepStrictEqual(result.rows, [[1], [2], [3]]);
    });

    it("does not treat a doubled quote ('') as string end (no false compound)", () => {
      var result = SqlEngine.execute("SELECT 'it''s; ok' AS txt");
      assert.ok(!result.error,
        "escaped quote with inner semicolon must be a single statement: " + (result.error || ""));
      assert.strictEqual(result.rows[0][0], "it's; ok");
    });

    it("still blocks a real compound statement after an escaped-quote literal", () => {
      var result = SqlEngine.execute("SELECT 'it''s ok'; DROP TABLE pokemon");
      assert.ok(result.error, "compound statement must still be blocked");
    });
  });
});

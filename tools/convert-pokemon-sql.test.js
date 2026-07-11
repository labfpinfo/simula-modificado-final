/**
 * Deterministic unit tests for convert-pokemon-sql.js.
 *
 * Covers:
 *   - parseArgs (missing --output, unknown flag, --help, valid output)
 *   - splitArgs (quoted comma, nested parens)
 *   - CONCAT rewrite (simple, nested, quoted comma)
 *   - verifyDatabase (success on converted seed)
 *
 * Uses Node built-in test runner (node:test + node:assert).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const {
  parseArgs,
  splitArgs,
  rewriteConcatPass,
  rewriteMySQLFunctions,
  convertMySQLtoSQLite,
  verifyDatabase,
} = require("./convert-pokemon-sql");

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns no outputPath, no errors, no help with empty args", () => {
    const { outputPath, errors, helpRequested } = parseArgs([]);
    assert.strictEqual(outputPath, null);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(helpRequested, false);
  });

  it("detects --help flag", () => {
    const { helpRequested } = parseArgs(["--help"]);
    assert.strictEqual(helpRequested, true);
  });

  it("detects -h flag", () => {
    const { helpRequested } = parseArgs(["-h"]);
    assert.strictEqual(helpRequested, true);
  });

  it("parses valid --output path", () => {
    const { outputPath, errors } = parseArgs(["--output", "data/test.sqlite"]);
    assert.strictEqual(errors.length, 0);
    assert.ok(outputPath.endsWith("data/test.sqlite"));
  });

  it("reports error when --output is missing its value (end of args)", () => {
    const { outputPath, errors } = parseArgs(["--output"]);
    assert.strictEqual(outputPath, null);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("requires a path argument"));
  });

  it("reports error when --output value is another flag", () => {
    const { outputPath, errors } = parseArgs(["--output", "--help"]);
    assert.strictEqual(outputPath, null);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("requires a path argument"));
  });

  it("reports error for unknown flag", () => {
    const { errors } = parseArgs(["--unknown"]);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("Unknown flag"));
    assert.ok(errors[0].includes("--unknown"));
  });
});

// ---------------------------------------------------------------------------
// splitArgs
// ---------------------------------------------------------------------------

describe("splitArgs", () => {
  it("splits comma-separated arguments", () => {
    const args = splitArgs("a, b, c");
    assert.deepStrictEqual(args, ["a", "b", "c"]);
  });

  it("preserves commas inside single quotes", () => {
    const args = splitArgs("'hello, world', name");
    assert.deepStrictEqual(args, ["'hello, world'", "name"]);
  });

  it("preserves commas inside nested parentheses", () => {
    const args = splitArgs("a, FOO(b, c), d");
    assert.deepStrictEqual(args, ["a", "FOO(b, c)", "d"]);
  });

  it("handles a single argument", () => {
    const args = splitArgs("hello");
    assert.deepStrictEqual(args, ["hello"]);
  });

  it("handles deeply nested parens with commas", () => {
    const args = splitArgs("a, OUTER(INNER(x, y), z)");
    assert.deepStrictEqual(args, ["a", "OUTER(INNER(x, y), z)"]);
  });
});

// ---------------------------------------------------------------------------
// CONCAT rewrite (rewriteConcatPass + rewriteMySQLFunctions)
// ---------------------------------------------------------------------------

describe("CONCAT rewrite", () => {
  it("rewrites simple CONCAT(a, b) to a || b", () => {
    const result = rewriteConcatPass("CONCAT(a, b)");
    assert.strictEqual(result, "a || b");
  });

  it("rewrites three-argument CONCAT(a, b, c)", () => {
    const result = rewriteConcatPass("CONCAT(a, b, c)");
    assert.strictEqual(result, "a || b || c");
  });

  it("preserves quoted commas inside CONCAT arguments", () => {
    // CONCAT('hello, world', name) — the comma inside quotes is NOT an arg separator
    const result = rewriteConcatPass("CONCAT('hello, world', name)");
    assert.strictEqual(result, "'hello, world' || name");
  });

  it("rewrites outer CONCAT on first pass and inner on second", () => {
    // Without the nested-CONCAT-skip guard, the outer CONCAT is processed
    // first.  The fixpoint loop in rewriteMySQLFunctions then handles the
    // inner CONCAT on the next pass.
    const input = "CONCAT(CONCAT(a, b), c)";
    const pass1 = rewriteConcatPass(input);
    // Outer processed, inner preserved inside the joined argument.
    assert.strictEqual(pass1, "CONCAT(a, b) || c");
    // Second pass flattens the inner CONCAT.
    const pass2 = rewriteConcatPass(pass1);
    assert.strictEqual(pass2, "a || b || c");
  });

  it("fully flattens nested CONCAT via rewriteMySQLFunctions", () => {
    const input = "CONCAT(CONCAT(a, b), c)";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(result, "a || b || c");
  });

  it("rewrites CONCAT in a SELECT statement", () => {
    const input = "SELECT CONCAT(nombre, ' ', apellidos) FROM entrenadores";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(
      result,
      "SELECT nombre || ' ' || apellidos FROM entrenadores"
    );
  });

  it("rewrites YEAR function alongside CONCAT", () => {
    const input = "SELECT CONCAT(YEAR(fecha), '-01-01') FROM t";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(
      result,
      "SELECT strftime('%Y', fecha) || '-01-01' FROM t"
    );
  });

  it("does NOT rewrite CONCAT inside a string literal", () => {
    const input = "INSERT INTO t VALUES ('CONCAT(a, b)');";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(result, input);
  });

  it("does NOT rewrite YEAR inside a string literal", () => {
    const input = "SELECT 'YEAR(2025)' AS label FROM t;";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(result, input);
  });

  it("rewrites CONCAT outside a string but preserves CONCAT inside a string", () => {
    const input = "SELECT CONCAT(nombre, ' ', 'CONCAT(x, y)') FROM t";
    const result = rewriteMySQLFunctions(input);
    assert.strictEqual(
      result,
      "SELECT nombre || ' ' || 'CONCAT(x, y)' FROM t"
    );
  });
});

// ---------------------------------------------------------------------------
// convertMySQLtoSQLite integration
// ---------------------------------------------------------------------------

describe("convertMySQLtoSQLite", () => {
  it("produces SQL with PRAGMA foreign_keys header", () => {
    const input = "CREATE TABLE t (id INT PRIMARY KEY);\nINSERT INTO t VALUES (1);";
    const output = convertMySQLtoSQLite(input);
    assert.ok(output.startsWith("PRAGMA foreign_keys = ON;"));
  });

  it("strips DROP DATABASE, CREATE DATABASE, and USE preamble", () => {
    const input =
      "drop database if exists Foo;\nCREATE DATABASE Foo;\nUSE Foo;\nCREATE TABLE t (id INT);";
    const output = convertMySQLtoSQLite(input);
    assert.ok(!output.includes("DROP DATABASE"));
    assert.ok(!output.includes("CREATE DATABASE"));
    assert.ok(!output.includes("USE Foo"));
    assert.ok(output.includes("CREATE TABLE t"));
  });

  it("maps MySQL types to SQLite affinities", () => {
    const input = "CREATE TABLE t (id INT, name VARCHAR(50), flag TINYINT(1), birth DATE);";
    const output = convertMySQLtoSQLite(input);
    assert.ok(output.includes("INTEGER")); // INT → INTEGER
    assert.ok(!output.includes("VARCHAR")); // VARCHAR(n) → TEXT
    assert.ok(output.includes("TEXT")); // DATE → TEXT, VARCHAR → TEXT
    assert.ok(!output.includes("TINYINT")); // TINYINT(n) → INTEGER
  });

  it("ends with a trailing newline", () => {
    const input = "CREATE TABLE t (id INT);";
    const output = convertMySQLtoSQLite(input);
    assert.ok(output.endsWith("\n"));
  });
});

// ---------------------------------------------------------------------------
// verifyDatabase — success on fully converted seed
// ---------------------------------------------------------------------------

describe("verifyDatabase", () => {
  it("passes verification on the generated seed SQL", async () => {
    const ROOT = path.resolve(__dirname, "..");
    const INPUT = path.join(ROOT, "data", "pokemon.sql");

    const rawSQL = fs.readFileSync(INPUT, "utf-8");
    const convertedSQL = convertMySQLtoSQLite(rawSQL);

    // Build in-memory SQLite database from the converted SQL
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();

    const db = new SQL.Database();
    try {
      db.exec(convertedSQL);

      const { ok, report } = verifyDatabase(db);

      // If verification fails, include the report in the assertion message
      if (!ok) {
        assert.fail(`DB verification failed:\n${report.join("\n")}`);
      }

      assert.strictEqual(ok, true);
    } finally {
      db.close();
    }
  });

  // -----------------------------------------------------------------------
  // Deterministic failure branches — catch removal of meaningful checks
  // -----------------------------------------------------------------------

  it("reports missing table as failure", async () => {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      // Only create ligas — all other expected tables are missing.
      db.run(
        "CREATE TABLE ligas (idliga INTEGER PRIMARY KEY, nombre TEXT, ganador TEXT, lideres TEXT);"
      );
      const { ok, report } = verifyDatabase(db);
      assert.strictEqual(ok, false);
      const missing = report.filter((r) => r.startsWith("MISSING TABLE:"));
      assert.ok(missing.length > 0, "Should report at least one missing table");
      assert.ok(
        missing.some((r) => r.includes("entrenadores")),
        "Should report entrenadores as missing"
      );
    } finally {
      db.close();
    }
  });

  it("reports unexpected table as failure", async () => {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      db.run("CREATE TABLE unexpected_table (id INTEGER PRIMARY KEY);");
      const { ok, report } = verifyDatabase(db);
      assert.strictEqual(ok, false);
      assert.ok(
        report.some((r) => r.startsWith("UNEXPECTED TABLE:")),
        "Should report unexpected table"
      );
    } finally {
      db.close();
    }
  });

  it("reports row-count mismatch as failure", async () => {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      db.run(
        "CREATE TABLE ligas (idliga INTEGER PRIMARY KEY, nombre TEXT, ganador TEXT, lideres TEXT);"
      );
      // Only 1 row — expected 15.
      db.run("INSERT INTO ligas VALUES (1, 'test', 'test', 'test');");
      const { ok, report } = verifyDatabase(db);
      assert.strictEqual(ok, false);
      assert.ok(
        report.some((r) => r.startsWith("ROW MISMATCH: ligas")),
        `Should report row mismatch for ligas. Report: ${report.join(" | ")}`
      );
    } finally {
      db.close();
    }
  });

  it("reports missing column as failure", async () => {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      // ligas table intentionally missing the 'nombre' column.
      db.run(
        "CREATE TABLE ligas (idliga INTEGER PRIMARY KEY, ganador TEXT, lideres TEXT);"
      );
      // Insert 15 rows to satisfy the row-count check and isolate to column check.
      for (let i = 1; i <= 15; i++) {
        db.run(`INSERT INTO ligas VALUES (${i}, 'g${i}', 'l${i}');`);
      }
      const { ok, report } = verifyDatabase(db);
      assert.strictEqual(ok, false);
      assert.ok(
        report.some((r) => r === "MISSING COLUMN: ligas.nombre"),
        `Should report missing column ligas.nombre. Report: ${report.join(" | ")}`
      );
    } finally {
      db.close();
    }
  });

  it("reports foreign-key violation as failure", async () => {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    try {
      // Create ligas with 15 rows (passes row-count check).
      db.run(
        "CREATE TABLE ligas (idliga INTEGER PRIMARY KEY, nombre TEXT, ganador TEXT, lideres TEXT);"
      );
      for (let i = 1; i <= 15; i++) {
        db.run(
          `INSERT INTO ligas VALUES (${i}, 'liga${i}', 'gan${i}', 'lid${i}');`
        );
      }

      // Create entrenadores with FK reference to ligas.
      db.run(
        "CREATE TABLE entrenadores (identrenador INTEGER PRIMARY KEY, nombre TEXT, apellidos TEXT, edad INTEGER, idliga INTEGER REFERENCES ligas(idliga), nivel TEXT, region TEXT);"
      );
      // Insert an orphan row referencing non-existent liga 999.
      // No PRAGMA foreign_keys = ON here — the row is inserted but
      // PRAGMA foreign_key_check will detect it.
      db.run(
        "INSERT INTO entrenadores VALUES (1, 'Test', 'User', 25, 999, 'Alto', 'Kanto');"
      );

      const { ok, report } = verifyDatabase(db);
      assert.strictEqual(ok, false);
      const fkFail = report.find((r) =>
        r.toLowerCase().includes("foreign key")
      );
      assert.ok(
        fkFail,
        `Should report foreign key violation. Report: ${report.join(" | ")}`
      );
    } finally {
      db.close();
    }
  });
});

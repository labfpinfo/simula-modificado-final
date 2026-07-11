#!/usr/bin/env node

/**
 * convert-pokemon-sql.js
 *
 * Reads data/pokemon.sql (MySQL-oriented), strips MySQL-only DDL, maps
 * types to SQLite affinity, rewrites MySQL-specific functions, and
 * outputs SQLite-compatible seed SQL.
 *
 * Usage:
 *   node tools/convert-pokemon-sql.js              # print SQL to stdout
 *   node tools/convert-pokemon-sql.js --output data/pokemon.sqlite
 *                                                  # also write .sqlite binary
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Resolve paths relative to the project root (parent of tools/)
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data", "pokemon.sql");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip MySQL-only preamble lines (DROP DATABASE, CREATE DATABASE, USE)
 * and collapse multiple blank lines produced by removals.
 */
function stripMySQLPreamble(sql) {
  return sql
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false; // drop blank lines — we re-add spacing below
      const upper = trimmed.toUpperCase();
      if (
        upper.startsWith("DROP DATABASE") ||
        upper.startsWith("CREATE DATABASE") ||
        upper.startsWith("USE ")
      ) {
        return false;
      }
      return true;
    })
    .join("\n");
}

/**
 * Map MySQL column types to SQLite affinity.
 *
 * Order is important: match longer patterns (TINYINT(n)) before shorter
 * ones (INT) to avoid partial replacements.
 */
function mapTypesToSQLite(sql) {
  const replacements = [
    // TINYINT(n) → INTEGER (MySQL pseudo-boolean / tinyint)
    [/\bTINYINT\s*\(\s*\d+\s*\)/gi, "INTEGER"],
    // VARCHAR(n) → TEXT
    [/\bVARCHAR\s*\(\s*\d+\s*\)/gi, "TEXT"],
    // CHAR(n) → TEXT
    [/\bCHAR\s*\(\s*\d+\s*\)/gi, "TEXT"],
    // DATE → TEXT (SQLite stores dates as ISO-8601 text)
    [/\bDATE\b/g, "TEXT"],
    // INT → INTEGER (word-boundary-guarded so it does not match inside
    //    TINYINT or VARCHAR; also avoids matching inside INTEGER itself)
    [/\bINT\b/gi, "INTEGER"],
  ];

  let result = sql;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Argument splitting with single-quote and paren awareness.
// ---------------------------------------------------------------------------

/**
 * Split a comma-separated argument list, respecting:
 *   - single-quoted string literals (commas inside quotes are separators, not
 *     argument boundaries)
 *   - nested parentheses (commas inside sub-expressions are not top-level)
 */
function splitArgs(str) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (const ch of str) {
    if (inString) {
      current += ch;
      if (ch === "'") inString = false;
    } else if (ch === "'") {
      inString = true;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) args.push(trimmed);
  return args;
}

// ---------------------------------------------------------------------------
// CONCAT rewrite — bottom-up, safe for nesting and string literals.
// ---------------------------------------------------------------------------

/**
 * Single pass: find CONCAT(...) calls with no nested CONCATs and rewrite them
 * in-place.  Returns the rewritten SQL.
 *
 * Built to be called in a fixpoint loop so nested CONCAT call trees are
 * flattened from the leaves up.
 *
 * CONCAT calls that appear inside single-quoted string literals are left
 * untouched — they are data, not function invocations.
 */
function rewriteConcatPass(sql) {
  const re = /\bCONCAT\s*\(/gi;
  const parts = [];
  let outputStart = 0;
  let scanPos = 0;
  let stringOpen = false;
  let match;

  while ((match = re.exec(sql)) !== null) {
    const fullMatchStart = match.index;

    // Skip matches that fall inside a region already consumed by a
    // previous outer-CONCAT replacement (the regex operates on the
    // original string while outputStart tracks the rewritten frontier).
    if (fullMatchStart < outputStart) {
      continue;
    }

    // Update string-open state for the span since the last scan position.
    for (let i = scanPos; i < fullMatchStart; i++) {
      if (sql[i] === "'") stringOpen = !stringOpen;
    }
    scanPos = fullMatchStart;

    // Skip CONCAT calls that appear inside single-quoted string literals.
    if (stringOpen) {
      continue;
    }

    const argsStart = match.index + match[0].length;

    // Find the matching closing paren, skipping single-quoted strings.
    let depth = 0;
    let inString = false;
    let closeParen = -1;
    for (let i = argsStart; i < sql.length; i++) {
      const ch = sql[i];
      if (inString) {
        if (ch === "'") inString = false;
      } else if (ch === "'") {
        inString = true;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        if (depth === 0) {
          closeParen = i;
          break;
        }
        depth--;
      }
    }

    if (closeParen === -1) {
      // Unmatched paren — malformed SQL.  Bail safely.
      continue;
    }

    const argsStr = sql.substring(argsStart, closeParen);

    const args = splitArgs(argsStr);

    // Emit everything before this CONCAT call, then the rewritten expression.
    parts.push(sql.substring(outputStart, fullMatchStart));
    parts.push(args.join(" || "));
    outputStart = closeParen + 1;
    scanPos = closeParen + 1;
    stringOpen = false; // balanced expression consumed — reset after closing paren
  }

  parts.push(sql.substring(outputStart));
  return parts.join("");
}

/**
 * Replace YEAR( calls with strftime('%Y', — but only when the call
 * appears outside single-quoted string literals.  YEAR inside a string
 * literal is data, not a function invocation.
 */
function rewriteYearFunc(sql) {
  const re = /\bYEAR\s*\(/gi;
  const parts = [];
  let outputStart = 0;
  let scanPos = 0;
  let stringOpen = false;
  let match;

  while ((match = re.exec(sql)) !== null) {
    const fullMatchStart = match.index;

    for (let i = scanPos; i < fullMatchStart; i++) {
      if (sql[i] === "'") stringOpen = !stringOpen;
    }
    scanPos = fullMatchStart;

    if (stringOpen) {
      continue;
    }

    parts.push(sql.substring(outputStart, fullMatchStart));
    parts.push("strftime('%Y', ");
    outputStart = fullMatchStart + match[0].length;
    scanPos = outputStart;
  }

  parts.push(sql.substring(outputStart));
  return parts.join("");
}

/**
 * Rewrite MySQL-specific CONCAT and YEAR functions for SQLite.
 *
 * CONCAT(a, b, ...)  →  a || b || ...
 * YEAR(date_column)  →  strftime('%Y', date_column)
 *
 * CONCAT rewriting handles nesting and single-quoted string arguments
 * correctly via a bottom-up fixpoint loop.  Both rewrites respect
 * single-quoted string literals — function names inside strings are
 * treated as data, not code.
 */
function rewriteMySQLFunctions(sql) {
  // CONCAT — fixpoint until stable (handles arbitrarily deep nesting).
  let prev;
  do {
    prev = sql;
    sql = rewriteConcatPass(sql);
  } while (sql !== prev);

  // YEAR(expr) → strftime('%Y', expr)
  sql = rewriteYearFunc(sql);

  return sql;
}

/**
 * Convert the full MySQL seed into SQLite-compatible SQL.
 */
function convertMySQLtoSQLite(sql) {
  let converted = stripMySQLPreamble(sql);
  converted = mapTypesToSQLite(converted);
  converted = rewriteMySQLFunctions(converted);

  // Prepend PRAGMA for foreign key enforcement
  converted = "PRAGMA foreign_keys = ON;\n\n" + converted;

  // Ensure trailing newline
  if (!converted.endsWith("\n")) {
    converted += "\n";
  }

  return converted;
}

// ---------------------------------------------------------------------------
// Verification helpers (used when --output is supplied)
// ---------------------------------------------------------------------------

/**
 * Known tables and expected row counts from data/pokemon.sql.
 */
const EXPECTED = {
  ligas: 15,
  entrenadores: 15,
  pokemon: 15,
  tipo: 15,
  ciudades: 15,
  gimnasios: 15,
  combaten: 15,
  tiendas: 15,
  asistencia: 15,
  pokemonasistencia: 15,
  entrenadoresciudades: 15,
};

/**
 * Minimal schema assertion: each expected table must have at least the
 * columns listed here (the converter may produce extra columns but these
 * are the ones the downstream app relies on).
 */
const EXPECTED_COLUMNS = {
  ligas:            ["idliga", "nombre", "ganador", "lideres"],
  entrenadores:     ["identrenador", "nombre", "apellidos", "edad", "idliga", "nivel", "region"],
  pokemon:          ["idpokemon", "nombre", "nombre_entrenador", "descripcion", "identrenador", "nivel", "sexo", "salud"],
  tipo:             ["idtipo", "nombre", "fuerte_contra", "debil_contra", "idpokemon", "descripcion"],
  ciudades:         ["idciudad", "nombre", "descripcion"],
  gimnasios:        ["idgimnasio", "tipo", "lider", "nombre", "idciudad"],
  combaten:         ["idgimnasio", "identrenador", "resultado"],
  tiendas:          ["idtienda", "nombre_tienda", "tipo_tienda", "objetos_de_curaciones", "objetos_de_ayuda", "idciudad"],
  asistencia:       ["idcentropokemon", "nombre_centro", "area_de_intercambio", "fecha_asistencia"],
  pokemonasistencia:["idpokemon", "idcentropokemon"],
  entrenadoresciudades: ["idciudad", "identrenador"],
};

/**
 * Verify the SQLite database:
 *   1. PRAGMA integrity_check
 *   2. PRAGMA foreign_key_check
 *   3. Table/row-count assertions
 *   4. Column presence assertions
 *
 * Returns { ok, report }.
 */
function verifyDatabase(db) {
  const report = [];
  let allOk = true;

  // --- 1. PRAGMA integrity_check ---
  try {
    const ic = db.exec("PRAGMA integrity_check;");
    if (ic.length && ic[0].values.length) {
      const val = ic[0].values[0][0];
      if (val !== "ok") {
        report.push(`INTEGRITY CHECK FAILED: ${val}`);
        allOk = false;
      } else {
        report.push("OK: PRAGMA integrity_check");
      }
    }
  } catch (e) {
    report.push(`INTEGRITY CHECK ERROR: ${e.message}`);
    allOk = false;
  }

  // --- 2. PRAGMA foreign_key_check ---
  try {
    const fk = db.exec("PRAGMA foreign_key_check;");
    if (fk.length && fk[0].values.length) {
      report.push(`FOREIGN KEY CHECK FAILED: ${fk[0].values.length} violation(s)`);
      allOk = false;
    } else {
      report.push("OK: PRAGMA foreign_key_check");
    }
  } catch (e) {
    report.push(`FOREIGN KEY CHECK ERROR: ${e.message}`);
    allOk = false;
  }

  // --- 3. Table existence ---
  const tablesResult = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const actualTables = tablesResult.length
    ? tablesResult[0].values.map((r) => r[0])
    : [];
  const expectedTables = Object.keys(EXPECTED);

  for (const t of expectedTables) {
    if (!actualTables.includes(t)) {
      report.push(`MISSING TABLE: ${t}`);
      allOk = false;
    }
  }

  for (const t of actualTables) {
    if (!expectedTables.includes(t)) {
      report.push(`UNEXPECTED TABLE: ${t}`);
      allOk = false;
    }
  }

  // --- 4. Row counts ---
  for (const t of expectedTables) {
    if (!actualTables.includes(t)) continue;
    const result = db.exec(`SELECT COUNT(*) AS cnt FROM "${t}";`);
    const actualCount = result.length ? result[0].values[0][0] : 0;
    const expected = EXPECTED[t];
    if (actualCount !== expected) {
      report.push(
        `ROW MISMATCH: ${t} expected ${expected}, got ${actualCount}`
      );
      allOk = false;
    } else {
      report.push(`OK: ${t} — ${actualCount} rows`);
    }
  }

  // --- 5. Column presence ---
  for (const t of expectedTables) {
    if (!actualTables.includes(t)) continue;
    const colsResult = db.exec(`PRAGMA table_info("${t}");`);
    const actualCols = colsResult.length
      ? colsResult[0].values.map((r) => r[1])
      : [];
    for (const c of (EXPECTED_COLUMNS[t] || [])) {
      if (!actualCols.includes(c)) {
        report.push(`MISSING COLUMN: ${t}.${c}`);
        allOk = false;
      }
    }
  }

  return { ok: allOk, report };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse process.argv into { outputPath, errors }.
 *
 * Flags supported:
 *   --output <path>   write binary .sqlite to <path> after conversion
 *   --help            print usage and exit
 *
 * Returns outputPath (string | null) and a list of error strings.
 */
function parseArgs(argv) {
  const errors = [];
  let outputPath = null;
  let helpRequested = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      helpRequested = true;
    } else if (arg === "--output") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("-")) {
        errors.push("--output requires a path argument (e.g. --output data/pokemon.sqlite)");
        continue;
      }
      outputPath = path.resolve(argv[i + 1]);
      i++; // consume the value
    } else if (arg.startsWith("-")) {
      errors.push(`Unknown flag: ${arg}`);
    }
  }

  return { outputPath, errors, helpRequested };
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

/**
 * Write buffer atomically: write to a temp file in the same directory,
 * then rename.  This avoids truncated/corrupt files if the process is
 * interrupted mid-write.
 */
function atomicWriteSync(targetPath, buffer) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = path.join(dir, "." + path.basename(targetPath) + ".tmp." + process.pid);
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, targetPath);
  } catch (e) {
    // Clean up temp file if it was created but rename failed.
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { outputPath, errors, helpRequested } = parseArgs(process.argv.slice(2));

  if (helpRequested) {
    console.log(
      "Usage: node tools/convert-pokemon-sql.js [--output <path>] [--help]\n" +
      "\n" +
      "  --output <path>   Write SQLite binary to <path> after printing SQL to stdout.\n" +
      "  --help, -h        Show this message."
    );
    process.exit(0);
  }

  if (errors.length > 0) {
    for (const e of errors) console.error("Error:", e);
    process.exit(1);
  }

  // Read input
  const rawSQL = fs.readFileSync(INPUT, "utf-8");
  const convertedSQL = convertMySQLtoSQLite(rawSQL);

  // Always print converted SQL to stdout for inspection
  console.log(convertedSQL);

  // If --output is specified, build the binary .sqlite file
  if (outputPath) {
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();

    const db = new SQL.Database();
    try {
      // db.exec() handles multi-statement SQL correctly; db.run() can
      // silently drop rows with large multi-INSERT batches in sql.js v1.x.
      db.exec(convertedSQL);

      // Verify
      console.error("\n--- Verification ---");
      const { ok, report } = verifyDatabase(db);
      for (const line of report) {
        console.error(line);
      }

      if (!ok) {
        console.error("\nVERIFICATION FAILED — .sqlite file NOT written.");
        process.exit(1);
      }

      // Export binary and write atomically
      const data = db.export();
      const buffer = Buffer.from(data);
      atomicWriteSync(outputPath, buffer);
      console.error(`\nWritten: ${outputPath} (${buffer.byteLength} bytes)`);
    } finally {
      db.close();
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}

module.exports = {
  splitArgs,
  rewriteConcatPass,
  rewriteMySQLFunctions,
  convertMySQLtoSQLite,
  parseArgs,
  verifyDatabase,
};

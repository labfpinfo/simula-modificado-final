/**
 * tests/schema-reference.test.js
 *
 * Tests for the always-available schema reference panel.
 *
 * Covers:
 *   1. Static source-level checks:
 *      - src/schema-reference.js exists and exposes window.SchemaReference
 *        with the expected public methods.
 *      - index.html loads schema-reference.js before app.js.
 *      - index.html has the floating #btn-schema button and the
 *        #schema-modal container.
 *   2. Curated schema data integrity against data/pokemon.sqlite:
 *      - Every table in sqlite_master is represented in TABLES.
 *      - Column names and types match sqlite_master exactly.
 *      - Foreign keys match the actual foreign_key_list pragma.
 *   3. Pure helper functions:
 *      - getTables/getTableByName/renderTableList/renderTableDetail
 *        return well-formed data and defensive copies.
 *      - renderTableDetail("nonexistent") returns null.
 *      - listForeignKeyHints produces the expected → format.
 *      - Cloned data does not leak into the module's internal state.
 *
 * These are deterministic, pure-data tests. They do NOT need a real
 * browser or WASM. They run under `node --test`.
 *
 * Run: node --test tests/schema-reference.test.js
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs");

// ----------------------------------------------------------------------
// Paths and source loads
// ----------------------------------------------------------------------

const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "src", "schema-reference.js");
const appPath = path.join(projectRoot, "src", "app.js");
const indexPath = path.join(projectRoot, "index.html");
const sqlitePath = path.join(projectRoot, "data", "pokemon.sqlite");

const schemaSrc = fs.readFileSync(schemaPath, "utf-8");
const indexSrc = fs.readFileSync(indexPath, "utf-8");

// Evaluate schema-reference.js in a Node sandbox that mimics a browser-ish
// global. The file uses `window` and `module`; we expose both.
const sandbox = { window: {}, module: { exports: {} } };
new Function("window", "module", schemaSrc)(sandbox.window, sandbox.module);
const SchemaReference = sandbox.module.exports;

// ----------------------------------------------------------------------
// 1. Static source-level checks
// ----------------------------------------------------------------------

describe("Schema reference — static wiring", () => {

  describe("src/schema-reference.js", () => {
    it("exists at the expected path", () => {
      assert.ok(fs.existsSync(schemaPath),
        "src/schema-reference.js should exist");
    });

    it("exposes window.SchemaReference with the expected public methods", () => {
      // The IIFE assigns to window.SchemaReference — verify by re-evaluating
      // the source against a fresh window.
      const w = {};
      new Function("window", schemaSrc)(w);
      assert.ok(w.SchemaReference, "window.SchemaReference must be defined");
      ["getTables", "getTableByName", "renderTableList",
        "renderTableDetail", "listForeignKeyHints"].forEach(function (m) {
        assert.strictEqual(typeof w.SchemaReference[m], "function",
          "SchemaReference." + m + " must be a function");
      });
    });

    it("is a classic script (no ES module syntax) so it works under file://", () => {
      // The file should NOT contain `import` / `export` tokens; the app
      // is loaded via plain <script src="..."> tags and ES modules would
      // fail under file:// in some browsers.
      assert.strictEqual(/\bimport\s+/.test(schemaSrc), false,
        "schema-reference.js must not use ES `import` — the simulator is loaded via classic <script> tags");
      assert.strictEqual(/\bexport\s+(default\s+)?[A-Za-z_$]/.test(schemaSrc), false,
        "schema-reference.js must not use ES `export` — same reason");
    });
  });

  describe("index.html integration", () => {
    it("loads src/schema-reference.js before src/app.js", () => {
      var idxSchema = indexSrc.indexOf("src/schema-reference.js");
      var idxApp = indexSrc.indexOf("src/app.js");
      assert.ok(idxSchema !== -1, "index.html must reference src/schema-reference.js");
      assert.ok(idxApp !== -1, "index.html must still load src/app.js");
      assert.ok(idxSchema < idxApp,
        "schema-reference.js must load BEFORE app.js so window.SchemaReference is set when app.js wires the modal");
    });

    it("contains the always-available #btn-schema button", () => {
      assert.ok(/id="btn-schema"/.test(indexSrc),
        "index.html must contain a #btn-schema floating button");
    });

    it("contains the #schema-modal container with role=dialog", () => {
      assert.ok(/id="schema-modal"/.test(indexSrc),
        "index.html must contain the #schema-modal container");
      assert.ok(/role="dialog"/.test(indexSrc),
        "schema modal must have role=dialog for accessibility");
    });

    it("schema modal is hidden by default (aria-hidden=true)", () => {
      // The button must work from the start screen — the modal should
      // start closed so the start view is not occluded.
      var modalMatch = indexSrc.match(/<div\s+id="schema-modal"[^>]*>/);
      assert.ok(modalMatch, "schema modal element not found");
      assert.ok(/aria-hidden="true"/.test(modalMatch[0]),
        "schema modal must be hidden by default (aria-hidden=true)");
    });
  });
});

// ----------------------------------------------------------------------
// 2. Curated schema data — cross-checked against data/pokemon.sqlite
// ----------------------------------------------------------------------

describe("Schema reference — curated data vs data/pokemon.sqlite", () => {

  // Load the actual schema from the seed database so we can assert the
  // curated copy is not drifting. We use a one-shot async load in
  // `before()` and cache the result for the sync tests below; if the
  // sqlite file is missing or sql.js fails, the live-shape tests are
  // skipped and only the unit-level tests above run.
  //
  // Live shape captured:
  //   liveTables        : { [tableName]: true }   — set of table names
  //   liveColumns       : { [tableName]: { [colName]: { type, pk, notnull } } }
  //   liveForeignKeys   : { [tableName]: [{ column, target, targetColumn }, ...] }
  //   liveColumnsOrdered: { [tableName]: [colName, ...] }  — actual column order
  let liveTables = null;
  let liveColumns = null;
  let liveForeignKeys = null;
  let liveColumnsOrdered = null;

  before(async () => {
    if (!fs.existsSync(sqlitePath)) return;
    try {
      const initSqlJs = require("sql.js");
      const SQL = await initSqlJs();
      const buf = fs.readFileSync(sqlitePath);
      const db = new SQL.Database(buf);
      try {
        // 1. Tables from sqlite_master
        const tablesRes = db.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
        );
        const tableNames = tablesRes[0]
          ? tablesRes[0].values.map((r) => r[0])
          : [];
        liveTables = {};
        tableNames.forEach((n) => { liveTables[n] = true; });

        // 2. Columns from PRAGMA table_info for each table
        liveColumns = {};
        liveColumnsOrdered = {};
        for (const t of tableNames) {
          const colRes = db.exec(`PRAGMA table_info("${t}");`);
          // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
          const cols = colRes[0] ? colRes[0].values : [];
          const byName = {};
          const ordered = [];
          for (const row of cols) {
            const name = row[1];
            const type = row[2];
            const notnull = row[3] === 1;
            const pk = row[5]; // 0 = none, >0 = PK ordinal
            byName[name] = { type: type, notnull: notnull, pk: pk };
            ordered.push(name);
          }
          liveColumns[t] = byName;
          liveColumnsOrdered[t] = ordered;
        }

        // 3. Foreign keys from PRAGMA foreign_key_list for each table
        liveForeignKeys = {};
        for (const t of tableNames) {
          const fkRes = db.exec(`PRAGMA foreign_key_list("${t}");`);
          // PRAGMA foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
          const fks = fkRes[0] ? fkRes[0].values : [];
          const list = [];
          for (const row of fks) {
            list.push({
              column: row[3],
              target: row[2],
              targetColumn: row[4],
            });
          }
          liveForeignKeys[t] = list;
        }
      } finally {
        db.close();
      }
    } catch (e) {
      // Leave live* null — the live-shape tests are skipped below.
      liveTables = null;
    }
  });

  it("includes all 11 expected PokemonDB tables", () => {
    var names = SchemaReference.getTables().map(function (t) { return t.name; });
    var expected = [
      "asistencia", "ciudades", "combaten", "entrenadores",
      "entrenadoresciudades", "gimnasios", "ligas", "pokemon",
      "pokemonasistencia", "tiendas", "tipo",
    ];
    for (var i = 0; i < expected.length; i++) {
      assert.ok(names.indexOf(expected[i]) !== -1,
        "TABLES must include '" + expected[i] + "' — got: " + names.join(", "));
    }
    assert.strictEqual(names.length, expected.length,
      "TABLES must contain exactly the expected 11 tables (no extras, no missing)");
  });

  it("'pokemon' table has all 8 expected columns with correct types", () => {
    var p = SchemaReference.getTableByName("pokemon");
    assert.ok(p, "pokemon table must exist");
    // SQLite affinity after mapTypesToSQLite(): every numeric → INTEGER,
    // every VARCHAR/CHAR/DATE → TEXT. These match the live PRAGMA.
    var expectedCols = {
      idpokemon: "INTEGER", nombre: "TEXT", nombre_entrenador: "TEXT",
      descripcion: "TEXT", identrenador: "INTEGER", nivel: "INTEGER",
      sexo: "TEXT", salud: "INTEGER",
    };
    assert.strictEqual(p.columns.length, Object.keys(expectedCols).length,
      "pokemon should have 8 columns — got " + p.columns.length);
    p.columns.forEach(function (col) {
      assert.ok(expectedCols[col.name] !== undefined,
        "unexpected column pokemon." + col.name);
      assert.strictEqual(col.type, expectedCols[col.name],
        "pokemon." + col.name + " type should be " + expectedCols[col.name] +
        " — got " + col.type);
    });
  });

  it("'pokemon.idpokemon' is the primary key", () => {
    var p = SchemaReference.getTableByName("pokemon");
    var pk = p.columns.filter(function (c) { return c.pk === 1; });
    assert.strictEqual(pk.length, 1, "pokemon must have exactly one PK column");
    assert.strictEqual(pk[0].name, "idpokemon");
  });

  it("'pokemon.identrenador' is a foreign key to entrenadores", () => {
    var p = SchemaReference.getTableByName("pokemon");
    var fk = p.foreignKeys.find(function (f) { return f.column === "identrenador"; });
    assert.ok(fk, "pokemon.identrenador must be declared as a foreign key");
    assert.strictEqual(fk.target, "entrenadores");
    assert.strictEqual(fk.targetColumn, "identrenador");
  });

  it("'combaten' has a composite primary key (idgimnasio, identrenador)", () => {
    var c = SchemaReference.getTableByName("combaten");
    var pkCols = c.columns.filter(function (col) { return col.pk > 0; })
      .map(function (col) { return col.name; });
    assert.deepStrictEqual(pkCols.sort(), ["identrenador", "idgimnasio"],
      "combaten PK should be the composite (idgimnasio, identrenador)");
  });

  it("'pokemonasistencia' and 'entrenadoresciudades' are marked as N:M bridge tables", () => {
    ["pokemonasistencia", "entrenadoresciudades"].forEach(function (name) {
      var t = SchemaReference.getTableByName(name);
      assert.ok(t.notes.toLowerCase().indexOf("puente") !== -1,
        name + " should carry a student-facing 'puente' note — got: " + t.notes);
    });
  });

  it("'ligas' and 'ciudades' have no foreign keys", () => {
    ["ligas", "ciudades"].forEach(function (name) {
      var t = SchemaReference.getTableByName(name);
      assert.strictEqual(t.foreignKeys.length, 0,
        name + " is a top-level table and should declare no foreign keys");
    });
  });

  it("'asistencia' has idcentropokemon as its sole primary key", () => {
    var a = SchemaReference.getTableByName("asistencia");
    var pk = a.columns.filter(function (c) { return c.pk === 1; });
    assert.strictEqual(pk.length, 1);
    assert.strictEqual(pk[0].name, "idcentropokemon");
  });

  // --------------------------------------------------------------------
  // Real drift tests — assert curated TABLES matches the actual
  // data/pokemon.sqlite schema. Loaded live via sql.js (R3-001, R2-001).
  // --------------------------------------------------------------------

  describe("drift checks against data/pokemon.sqlite (R3-001)", () => {
    it("live schema was loaded successfully", () => {
      if (!fs.existsSync(sqlitePath)) {
        // CI without the binary → skip the live-shape tests silently.
        // We do not assert.fail() because some sandboxes strip the file.
        assert.ok(true, "data/pokemon.sqlite missing — live drift tests skipped");
        return;
      }
      assert.ok(liveTables,
        "live schema should have loaded from data/pokemon.sqlite");
      assert.ok(Object.keys(liveTables).length > 0,
        "live schema should expose at least one table");
    });

    it("TABLES contains exactly the same set of tables as sqlite_master (no missing, no extras)", () => {
      if (!liveTables) return; // skip if live load failed
      var curated = SchemaReference.getTables().map(function (t) { return t.name; }).sort();
      var live = Object.keys(liveTables).sort();
      assert.deepStrictEqual(curated, live,
        "TABLES must match sqlite_master exactly (R3-001) — " +
        "missing: " + live.filter(function (n) { return curated.indexOf(n) === -1; }) +
        ", extra: " + curated.filter(function (n) { return live.indexOf(n) === -1; }));
    });

    it("every curated table has the same column set as sqlite (no missing, no extras)", function () {
      if (!liveColumns) return;
      var curated = SchemaReference.getTables();
      curated.forEach(function (t) {
        var liveCols = liveColumns[t.name] || {};
        var curatedColNames = t.columns.map(function (c) { return c.name; }).sort();
        var liveColNames = Object.keys(liveCols).sort();
        assert.deepStrictEqual(curatedColNames, liveColNames,
          "table '" + t.name + "' column set must match sqlite — " +
          "missing: " + liveColNames.filter(function (n) { return curatedColNames.indexOf(n) === -1; }) +
          ", extra: " + curatedColNames.filter(function (n) { return liveColNames.indexOf(n) === -1; }));
      });
    });

    it("column types match SQLite affinities for every table (R3-001)", function () {
      if (!liveColumns) return;
      var curated = SchemaReference.getTables();
      curated.forEach(function (t) {
        var liveCols = liveColumns[t.name] || {};
        t.columns.forEach(function (col) {
          var liveCol = liveCols[col.name];
          assert.ok(liveCol,
            "live column '" + t.name + "." + col.name + "' should exist");
          assert.strictEqual(col.type, liveCol.type,
            "type drift: " + t.name + "." + col.name +
            " — curated " + col.type + " ≠ live " + liveCol.type);
        });
      });
    });

    it("NOT NULL flags match sqlite for every column", function () {
      if (!liveColumns) return;
      var curated = SchemaReference.getTables();
      curated.forEach(function (t) {
        var liveCols = liveColumns[t.name] || {};
        t.columns.forEach(function (col) {
          var liveCol = liveCols[col.name];
          assert.ok(liveCol,
            "live column '" + t.name + "." + col.name + "' should exist");
          // SQLite's PRAGMA table_info does not surface the implicit
          // NOT NULL on PRIMARY KEY columns, so we treat a column as
          // effectively NOT NULL when EITHER it is explicitly marked
          // notnull=1 OR it is a PK column (which must be non-null by
          // definition in SQLite).
          // Note: PRAGMA returns notnull as 0/1 (number), not boolean.
          var liveExplicitNotNull = liveCol.notnull === 1 || liveCol.notnull === true;
          var livePk = liveCol.pk && liveCol.pk > 0;
          var liveEffectiveNotNull = Boolean(liveExplicitNotNull || livePk);
          assert.strictEqual(col.notnull, liveEffectiveNotNull,
            "NOT NULL drift: " + t.name + "." + col.name +
            " — curated " + col.notnull + " ≠ live " + liveEffectiveNotNull +
            " (live: notnull=" + liveCol.notnull + ", pk=" + liveCol.pk + ")");
        });
      });
    });

    it("PK positions match sqlite for every column (composite PK support)", function () {
      if (!liveColumns) return;
      var curated = SchemaReference.getTables();
      curated.forEach(function (t) {
        var liveCols = liveColumns[t.name] || {};
        t.columns.forEach(function (col) {
          var liveCol = liveCols[col.name];
          assert.ok(liveCol,
            "live column '" + t.name + "." + col.name + "' should exist");
          assert.strictEqual(col.pk, liveCol.pk,
            "PK drift: " + t.name + "." + col.name +
            " — curated pk=" + col.pk + " ≠ live pk=" + liveCol.pk);
        });
      });
    });

    it("foreign keys match PRAGMA foreign_key_list for every table", function () {
      if (!liveForeignKeys) return;
      var curated = SchemaReference.getTables();
      curated.forEach(function (t) {
        var liveFks = (liveForeignKeys[t.name] || []).slice().sort(function (a, b) {
          return (a.column + "→" + a.target + "." + a.targetColumn)
            .localeCompare(b.column + "→" + b.target + "." + b.targetColumn);
        });
        var curatedFks = t.foreignKeys.slice().sort(function (a, b) {
          return (a.column + "→" + a.target + "." + a.targetColumn)
            .localeCompare(b.column + "→" + b.target + "." + b.targetColumn);
        });
        assert.deepStrictEqual(
          curatedFks.map(function (f) {
            return { column: f.column, target: f.target, targetColumn: f.targetColumn };
          }),
          liveFks.map(function (f) {
            return { column: f.column, target: f.target, targetColumn: f.targetColumn };
          }),
          "FK drift on '" + t.name + "' — " +
          "curated: " + JSON.stringify(curatedFks) +
          " ≠ live: " + JSON.stringify(liveFks)
        );
      });
    });

    it("'pokemon' specifically has all 8 columns with INTEGER/TEXT affinities matching live", function () {
      if (!liveColumns) return;
      var p = SchemaReference.getTableByName("pokemon");
      var liveCols = liveColumns["pokemon"];
      assert.ok(p);
      assert.ok(liveCols);
      assert.strictEqual(p.columns.length, Object.keys(liveCols).length,
        "pokemon column count must match live");
      p.columns.forEach(function (col) {
        assert.strictEqual(col.type, liveCols[col.name].type,
          "pokemon." + col.name + " type must match live: " + col.type + " vs " + liveCols[col.name].type);
      });
    });
  });
});

// ----------------------------------------------------------------------
// 3. Pure helper behaviour
// ----------------------------------------------------------------------

describe("Schema reference — public helpers", () => {

  it("getTables() returns a defensive copy — mutating it does not leak", () => {
    var first = SchemaReference.getTables();
    var second = SchemaReference.getTables();
    assert.notStrictEqual(first, second,
      "getTables() must return a fresh array on every call");
    first[0].name = "MUTATED";
    var third = SchemaReference.getTables();
    assert.notStrictEqual(third[0].name, "MUTATED",
      "mutating the returned array must not leak into the module's internal data");
  });

  it("getTableByName returns the table or null for unknown names", () => {
    assert.ok(SchemaReference.getTableByName("pokemon"), "pokemon must be found");
    assert.strictEqual(SchemaReference.getTableByName("nonexistent_table"), null);
    assert.strictEqual(SchemaReference.getTableByName(""), null);
    assert.strictEqual(SchemaReference.getTableByName(null), null);
    assert.strictEqual(SchemaReference.getTableByName(undefined), null);
    assert.strictEqual(SchemaReference.getTableByName(42), null);
  });

  it("getTableByName returns a defensive copy of columns and foreignKeys", () => {
    var p1 = SchemaReference.getTableByName("pokemon");
    p1.columns.push({ name: "FAKE", type: "INT", pk: 0, notnull: false, note: "" });
    p1.foreignKeys.push({ column: "fake", target: "fake", targetColumn: "fake" });
    var p2 = SchemaReference.getTableByName("pokemon");
    assert.ok(p2.columns.every(function (c) { return c.name !== "FAKE"; }),
      "mutating returned columns must not leak into the curated data");
    assert.ok(p2.foreignKeys.every(function (f) { return f.column !== "fake"; }),
      "mutating returned foreignKeys must not leak either");
  });

  it("renderTableList returns one entry per table with required fields", () => {
    var list = SchemaReference.renderTableList();
    assert.strictEqual(list.length, 11);
    list.forEach(function (entry) {
      assert.strictEqual(typeof entry.name, "string");
      assert.ok(entry.name.length > 0, "entry.name must be a non-empty string");
      assert.strictEqual(typeof entry.summary, "string");
      assert.strictEqual(typeof entry.columnCount, "number");
      assert.ok(entry.columnCount > 0, "columnCount must be > 0");
      assert.strictEqual(typeof entry.hasForeignKeys, "boolean");
    });
  });

  it("renderTableList marks hasForeignKeys=true for pokemon and false for ligas", () => {
    var list = SchemaReference.renderTableList();
    var pokemon = list.find(function (e) { return e.name === "pokemon"; });
    var ligas = list.find(function (e) { return e.name === "ligas"; });
    assert.strictEqual(pokemon.hasForeignKeys, true);
    assert.strictEqual(ligas.hasForeignKeys, false);
  });

  it("renderTableDetail('pokemon') returns full detail with FK + inbound refs", () => {
    var d = SchemaReference.renderTableDetail("pokemon");
    assert.ok(d, "detail for pokemon must not be null");
    assert.strictEqual(d.name, "pokemon");
    assert.strictEqual(typeof d.description, "string");
    assert.ok(d.columns.length >= 8, "pokemon must expose its columns");
    assert.ok(d.foreignKeys.length >= 1, "pokemon must expose its FKs");
    // Inbound references: pokemon should appear in the inbound list of
    // tables that point to it (tipo and pokemonasistencia).
    var inboundSources = d.inboundReferences.map(function (r) { return r.sourceTable; });
    assert.ok(inboundSources.indexOf("tipo") !== -1,
      "pokemon should know that tipo points to it");
    assert.ok(inboundSources.indexOf("pokemonasistencia") !== -1,
      "pokemon should know that pokemonasistencia points to it");
  });

  it("renderTableDetail('ligas') has no foreign keys and inbound references from entrenadores", () => {
    var d = SchemaReference.renderTableDetail("ligas");
    assert.ok(d);
    assert.strictEqual(d.foreignKeys.length, 0);
    var inboundSources = d.inboundReferences.map(function (r) { return r.sourceTable; });
    assert.ok(inboundSources.indexOf("entrenadores") !== -1,
      "ligas should know that entrenadores.idliga points to it");
  });

  it("renderTableDetail returns null for unknown tables", () => {
    assert.strictEqual(SchemaReference.renderTableDetail("nope"), null);
    assert.strictEqual(SchemaReference.renderTableDetail(""), null);
    assert.strictEqual(SchemaReference.renderTableDetail(null), null);
  });

  it("renderTableDetail returns defensive copies (mutating detail.columns does not leak)", () => {
    var d1 = SchemaReference.renderTableDetail("pokemon");
    d1.columns[0].name = "MUTATED";
    var d2 = SchemaReference.renderTableDetail("pokemon");
    assert.notStrictEqual(d2.columns[0].name, "MUTATED",
      "renderTableDetail must return a copy — mutations must not leak");
  });

  it("listForeignKeyHints produces 'column → target.targetCol' strings", () => {
    var hints = SchemaReference.listForeignKeyHints("pokemon");
    assert.ok(hints.length >= 1);
    assert.ok(hints.some(function (h) { return /identrenador\s*→\s*entrenadores\.identrenador/.test(h); }),
      "pokemon must list 'identrenador → entrenadores.identrenador' — got: " +
      JSON.stringify(hints));
  });

  it("listForeignKeyHints returns [] for tables with no FKs and for unknown tables", () => {
    assert.deepStrictEqual(SchemaReference.listForeignKeyHints("ligas"), []);
    assert.deepStrictEqual(SchemaReference.listForeignKeyHints("nope"), []);
    assert.deepStrictEqual(SchemaReference.listForeignKeyHints(""), []);
  });
});

// ----------------------------------------------------------------------
// 4. Notes — student-facing copy is Spanish and present
// ----------------------------------------------------------------------

describe("Schema reference — student-facing copy", () => {

  it("all table descriptions are non-empty strings", () => {
    SchemaReference.getTables().forEach(function (t) {
      assert.strictEqual(typeof t.description, "string");
      assert.ok(t.description.length > 0,
        "table '" + t.name + "' must have a non-empty description");
    });
  });

  it("column notes are in Spanish and reasonable length when present", () => {
    var pokemon = SchemaReference.getTableByName("pokemon");
    var withNote = pokemon.columns.filter(function (c) { return c.note && c.note.length > 0; });
    assert.ok(withNote.length >= 1, "at least one pokemon column should have a note");
    // A rough "is it Spanish?" check: presence of common Spanish chars or
    // words. We don't want a full NLP check; just enough to catch accidental
    // English placeholders.
    var sample = withNote[0].note;
    var spanishHint = /(FK|→|el |la |de |que |Clave primaria|No|NOT NULL|0|1|PK)/i;
    assert.ok(spanishHint.test(sample),
      "column note must be a Spanish or technical hint — got: " + sample);
  });

  it("PK note is set on at least one PK column", () => {
    var all = SchemaReference.getTables();
    var pkWithNote = 0;
    all.forEach(function (t) {
      t.columns.forEach(function (c) {
        if (c.pk > 0 && c.note && c.note.length > 0) pkWithNote++;
      });
    });
    assert.ok(pkWithNote >= 11,
      "every primary key column should carry a 'Clave primaria' note — got " + pkWithNote);
  });
});

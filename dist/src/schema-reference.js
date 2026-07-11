/**
 * schema-reference.js
 *
 * Curated schema reference for the PokemonDB seed database, exposed on
 * window.SchemaReference so the simulator can show a static, always-
 * available schema reference panel (tables, columns, foreign keys,
 * relationship notes) without needing to run a live PRAGMA query at
 * runtime.
 *
 * Why a curated module and not a live PRAGMA:
 *   - The schema panel must be available from the start screen, BEFORE
 *     any exercise has run. Querying sqlite_master would couple panel
 *     readiness to engine bootstrap, complicating the "always available"
 *     UX requirement.
 *   - Curated data gives us room to add student-facing notes that the
 *     engine schema does not carry (e.g. "tabla puente N:M", "→ liga a
 *     la que pertenece el entrenador", practical advice for JOINs).
 *   - The data is small (11 tables, ~40 columns) and easy to keep in
 *     sync with the seed by hand. A static check in
 *     tests/schema-reference.test.js asserts the tables list still
 *     matches sqlite_master in data/pokemon.sqlite so the curated copy
 *     cannot drift silently.
 *
 * This file has no DOM dependencies at module load time; render helpers
 * return pure data models that the caller (or the test harness) can
 * turn into DOM. The same source therefore runs in browser and in
 * Node tests.
 *
 * Schema source of truth: data/pokemon.sqlite (regenerated from
 * data/pokemon.sql by tools/convert-pokemon-sql.js).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Curated table / column metadata
  //
  // Every entry matches the actual schema in data/pokemon.sqlite.  After
  // tools/convert-pokemon-sql.js maps the MySQL-oriented DDL in
  // data/pokemon.sql, SQLite's type affinity collapses every numeric type
  // to INTEGER and every character/date type to TEXT, so the `type` field
  // below uses the *real* SQLite affinities, not the source MySQL types.
  // This is the contract the drift tests in tests/schema-reference.test.js
  // assert against (R3-001).
  //
  // Field shapes:
  //   table.name         — string, the SQLite table name (must match the
  //                        sqlite_master entry exactly).
  //   table.description  — student-facing one-liner (Spanish).
  //   table.columns[i]   — { name, type, pk, notnull, note? }.
  //                        type: SQLite affinity ("INTEGER" or "TEXT").
  //                        pk: 0 (not PK), >0 means part of composite PK
  //                        (1 = sole PK, 2 = second column of composite).
  //                        notnull: true/false matching sqlite NOT NULL.
  //   table.foreignKeys  — [{ column, target, targetColumn, note? }].
  //   table.notes        — optional student-facing tip (e.g. "tabla puente").
  // ---------------------------------------------------------------------------
  var TABLES = [
    {
      name: "ligas",
      description: "Ligas Pokémon y sus líderes / campeón.",
      columns: [
        { name: "idliga",  type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre",  type: "TEXT",    pk: 0, notnull: false, note: "Nombre de la liga" },
        { name: "ganador", type: "TEXT",    pk: 0, notnull: false, note: "Campeón actual" },
        { name: "lideres", type: "TEXT",    pk: 0, notnull: false, note: "Líderes de la liga" },
      ],
      foreignKeys: [],
    },
    {
      name: "entrenadores",
      description: "Entrenadores Pokémon y la liga a la que pertenecen.",
      columns: [
        { name: "identrenador", type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre",       type: "TEXT",    pk: 0, notnull: false },
        { name: "apellidos",    type: "TEXT",    pk: 0, notnull: false },
        { name: "edad",         type: "INTEGER", pk: 0, notnull: false },
        { name: "idliga",       type: "INTEGER", pk: 0, notnull: false, note: "FK → ligas.idliga" },
        { name: "nivel",        type: "INTEGER", pk: 0, notnull: false },
        { name: "region",       type: "TEXT",    pk: 0, notnull: false, note: "Región de origen" },
      ],
      foreignKeys: [
        { column: "idliga", target: "ligas", targetColumn: "idliga" },
      ],
    },
    {
      name: "pokemon",
      description: "Pokémon capturados por los entrenadores.",
      columns: [
        { name: "idpokemon",         type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre",            type: "TEXT",    pk: 0, notnull: false },
        { name: "nombre_entrenador", type: "TEXT",    pk: 0, notnull: false, note: "Nombre del dueño (texto, ojo: se duplica con entrenadores.nombre vía identrenador)" },
        { name: "descripcion",       type: "TEXT",    pk: 0, notnull: false, note: "Tipo elemental del Pokémon (texto)" },
        { name: "identrenador",      type: "INTEGER", pk: 0, notnull: false, note: "FK → entrenadores.identrenador" },
        { name: "nivel",             type: "INTEGER", pk: 0, notnull: false },
        { name: "sexo",              type: "TEXT",    pk: 0, notnull: false, note: "'M' o 'F'" },
        { name: "salud",             type: "INTEGER", pk: 0, notnull: false, note: "Puntos de salud" },
      ],
      foreignKeys: [
        { column: "identrenador", target: "entrenadores", targetColumn: "identrenador" },
      ],
    },
    {
      name: "tipo",
      description: "Tipos elementales y sus fortalezas / debilidades.",
      columns: [
        { name: "idtipo",        type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre",        type: "TEXT",    pk: 0, notnull: false, note: "Nombre del tipo" },
        { name: "fuerte_contra", type: "TEXT",    pk: 0, notnull: false, note: "Tipo al que vence" },
        { name: "debil_contra",  type: "TEXT",    pk: 0, notnull: false, note: "Tipo al que pierde" },
        { name: "idpokemon",     type: "INTEGER", pk: 0, notnull: false, note: "FK → pokemon.idpokemon" },
        { name: "descripcion",   type: "TEXT",    pk: 0, notnull: false },
      ],
      foreignKeys: [
        { column: "idpokemon", target: "pokemon", targetColumn: "idpokemon" },
      ],
    },
    {
      name: "ciudades",
      description: "Ciudades del mundo Pokémon.",
      columns: [
        { name: "idciudad",    type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre",      type: "TEXT",    pk: 0, notnull: false },
        { name: "descripcion", type: "TEXT",    pk: 0, notnull: false },
      ],
      foreignKeys: [],
    },
    {
      name: "gimnasios",
      description: "Gimnasios Pokémon, su líder y la ciudad donde están.",
      columns: [
        { name: "idgimnasio", type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "tipo",       type: "TEXT",    pk: 0, notnull: false, note: "Tipo elemental del gimnasio" },
        { name: "lider",      type: "TEXT",    pk: 0, notnull: false },
        { name: "nombre",     type: "TEXT",    pk: 0, notnull: false, note: "Nombre del gimnasio" },
        { name: "idciudad",   type: "INTEGER", pk: 0, notnull: false, note: "FK → ciudades.idciudad" },
      ],
      foreignKeys: [
        { column: "idciudad", target: "ciudades", targetColumn: "idciudad" },
      ],
    },
    {
      name: "combaten",
      description: "Registro de combates entre entrenadores y gimnasios.",
      columns: [
        { name: "idgimnasio",   type: "INTEGER", pk: 1, notnull: true, note: "PK parte 1: FK → gimnasios.idgimnasio" },
        { name: "identrenador", type: "INTEGER", pk: 2, notnull: true, note: "PK parte 2: FK → entrenadores.identrenador" },
        { name: "resultado",    type: "TEXT",    pk: 0, notnull: false, note: "Victoria / Derrota" },
      ],
      foreignKeys: [
        { column: "idgimnasio",   target: "gimnasios",    targetColumn: "idgimnasio" },
        { column: "identrenador", target: "entrenadores", targetColumn: "identrenador" },
      ],
      notes: "Tabla central de la fase JOIN: contiene las dos claves foráneas, encadena INNER JOIN con entrenadores y gimnasios.",
    },
    {
      name: "tiendas",
      description: "Tiendas de cada ciudad y el tipo de objetos que venden.",
      columns: [
        { name: "idtienda",              type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre_tienda",         type: "TEXT",    pk: 0, notnull: false },
        { name: "tipo_tienda",           type: "TEXT",    pk: 0, notnull: false },
        { name: "objetos_de_curaciones", type: "INTEGER", pk: 0, notnull: false, note: "0 = no, 1 = sí" },
        { name: "objetos_de_ayuda",      type: "INTEGER", pk: 0, notnull: false, note: "0 = no, 1 = sí" },
        { name: "idciudad",              type: "INTEGER", pk: 0, notnull: false, note: "FK → ciudades.idciudad" },
      ],
      foreignKeys: [
        { column: "idciudad", target: "ciudades", targetColumn: "idciudad" },
      ],
    },
    {
      name: "asistencia",
      description: "Centros Pokémon: sanación, intercambio, eventos…",
      columns: [
        { name: "idcentropokemon",     type: "INTEGER", pk: 1, notnull: true, note: "Clave primaria" },
        { name: "nombre_centro",       type: "TEXT",    pk: 0, notnull: false },
        { name: "area_de_intercambio", type: "TEXT",    pk: 0, notnull: false, note: "Sanación / Intercambio / Eventos / …" },
        { name: "fecha_asistencia",    type: "TEXT",    pk: 0, notnull: false, note: "Fecha ISO-8601 (TEXT por afinidad SQLite)" },
      ],
      foreignKeys: [],
    },
    {
      name: "pokemonasistencia",
      description: "Qué Pokémon han visitado qué centro Pokémon.",
      columns: [
        { name: "idpokemon",       type: "INTEGER", pk: 1, notnull: true, note: "PK parte 1: FK → pokemon.idpokemon" },
        { name: "idcentropokemon", type: "INTEGER", pk: 2, notnull: true, note: "PK parte 2: FK → asistencia.idcentropokemon" },
      ],
      foreignKeys: [
        { column: "idpokemon",       target: "pokemon",   targetColumn: "idpokemon" },
        { column: "idcentropokemon", target: "asistencia", targetColumn: "idcentropokemon" },
      ],
      notes: "Tabla puente N:M entre pokemon y asistencia.",
    },
    {
      name: "entrenadoresciudades",
      description: "Qué entrenadores han visitado qué ciudades.",
      columns: [
        { name: "idciudad",      type: "INTEGER", pk: 1, notnull: true, note: "PK parte 1: FK → ciudades.idciudad" },
        { name: "identrenador",  type: "INTEGER", pk: 2, notnull: true, note: "PK parte 2: FK → entrenadores.identrenador" },
      ],
      foreignKeys: [
        { column: "idciudad",     target: "ciudades",    targetColumn: "idciudad" },
        { column: "identrenador", target: "entrenadores", targetColumn: "identrenador" },
      ],
      notes: "Tabla puente N:M entre entrenadores y ciudades.",
    },
  ];

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * @returns {Array} A copy of the curated tables list (defensive copy
   *                   so callers cannot mutate the module's internal data).
   */
  function getTables() {
    return TABLES.map(cloneTable);
  }

  /**
   * @param {string} name
   * @returns {Object|null} The table object, or null if not found.
   */
  function getTableByName(name) {
    if (typeof name !== "string" || !name) return null;
    for (var i = 0; i < TABLES.length; i++) {
      if (TABLES[i].name === name) return cloneTable(TABLES[i]);
    }
    return null;
  }

  /**
   * Build a small model for the left-hand table list in the schema modal.
   * Each entry contains just enough information for the list to render
   * without re-reading the full table data.
   *
   * **Pure-data builder** (R2-002): no DOM, no browser globals, no side
   * effects. The caller (app.js) is responsible for turning this model
   * into DOM nodes — the same shape is reused by the test suite, which
   * does not load jsdom or run a real browser.
   *
   * @returns {Array<{name: string, summary: string, columnCount: number, hasForeignKeys: boolean}>}
   */
  function renderTableList() {
    var out = [];
    for (var i = 0; i < TABLES.length; i++) {
      var t = TABLES[i];
      out.push({
        name: t.name,
        summary: t.description,
        columnCount: t.columns.length,
        hasForeignKeys: t.foreignKeys.length > 0,
      });
    }
    return out;
  }

  /**
   * Build a full detail model for a single table — used by the right-hand
   * pane of the schema modal and by the tests.
   *
   * **Pure-data builder** (R2-002): no DOM, no browser globals, no side
   * effects. The caller (app.js) is responsible for turning this model
   * into DOM nodes; tests assert on the returned object directly.
   *
   * Returned shape (stable contract — tests assert on these keys):
   *   {
   *     name: string,
   *     description: string,
   *     notes: string,
   *     columns: [{name, type, pk, notnull, note}],
   *     foreignKeys: [{column, target, targetColumn, note}],
   *     inboundReferences: [{sourceTable, sourceColumn}] // tables that
   *                                                         point here
   *   }
   *
   * @param {string} name
   * @returns {Object|null}
   */
  function renderTableDetail(name) {
    var t = null;
    for (var i = 0; i < TABLES.length; i++) {
      if (TABLES[i].name === name) { t = TABLES[i]; break; }
    }
    if (!t) return null;

    var inbound = [];
    for (var j = 0; j < TABLES.length; j++) {
      if (TABLES[j].name === name) continue;
      for (var k = 0; k < TABLES[j].foreignKeys.length; k++) {
        var fk = TABLES[j].foreignKeys[k];
        if (fk.target === name) {
          inbound.push({
            sourceTable: TABLES[j].name,
            sourceColumn: fk.column,
            targetColumn: fk.targetColumn,
          });
        }
      }
    }

    return {
      name: t.name,
      description: t.description,
      notes: t.notes || "",
      columns: t.columns.map(function (c) {
        return {
          name: c.name,
          type: c.type,
          pk: c.pk,
          notnull: c.notnull,
          note: c.note || "",
        };
      }),
      foreignKeys: t.foreignKeys.map(function (fk) {
        return {
          column: fk.column,
          target: fk.target,
          targetColumn: fk.targetColumn,
        };
      }),
      inboundReferences: inbound,
    };
  }

  /**
   * Look up which table has the column used by a given foreign key, and
   * produce a human-readable hint for the student (e.g.
   * "pokemon.identrenador → entrenadores.identrenador").
   *
   * **Pure helper** (R2-002): no DOM, no browser globals, no side
   * effects. Exposed for tests and the modal.
   *
   * @param {string} tableName
   * @returns {string[]}
   */
  function listForeignKeyHints(tableName) {
    var detail = renderTableDetail(tableName);
    if (!detail) return [];
    var hints = [];
    for (var i = 0; i < detail.foreignKeys.length; i++) {
      var fk = detail.foreignKeys[i];
      hints.push(fk.column + " → " + fk.target + "." + fk.targetColumn);
    }
    return hints;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  function cloneTable(t) {
    return {
      name: t.name,
      description: t.description,
      notes: t.notes || "",
      columns: t.columns.map(function (c) {
        return {
          name: c.name,
          type: c.type,
          pk: c.pk,
          notnull: c.notnull,
          note: c.note || "",
        };
      }),
      foreignKeys: t.foreignKeys.map(function (fk) {
        return { column: fk.column, target: fk.target, targetColumn: fk.targetColumn };
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  if (typeof window !== "undefined") {
    window.SchemaReference = {
      getTables: getTables,
      getTableByName: getTableByName,
      renderTableList: renderTableList,
      renderTableDetail: renderTableDetail,
      listForeignKeyHints: listForeignKeyHints,
    };
  }

  // Node test export — only used when the file is `eval`'d under Node.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      getTables: getTables,
      getTableByName: getTableByName,
      renderTableList: renderTableList,
      renderTableDetail: renderTableDetail,
      listForeignKeyHints: listForeignKeyHints,
    };
  }
})();

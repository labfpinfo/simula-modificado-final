#!/usr/bin/env node
/**
 * tools/validate-exercises.js
 *
 * Valida TODOS los ejercicios de los bancos contra la base de datos real,
 * sin necesidad de abrir el navegador. Pensado para que el profesor pueda
 * añadir ejercicios nuevos y comprobarlos con un solo comando:
 *
 *   npm run validate-exercises
 *
 * Comprueba, por cada ejercicio:
 *   - id único global (duplicados romperían el guardado de progreso)
 *   - campos obligatorios presentes (id, mode, title, prompt, expectedSql, scoring)
 *   - mode válido y coherente con el de su fase
 *   - expectedSql se ejecuta SIN ERROR contra data/pokemon.sqlite
 *   - expectedSql pasa el filtro del motor (un único SELECT/WITH)
 *   - el resultado no está vacío (WARN, no error — puede ser legítimo)
 *   - si ordered=true, la consulta contiene ORDER BY (WARN si no)
 *
 * Exit code: 0 si todo OK (los WARN no bloquean) · 1 si hay errores.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "pokemon.sqlite");
const BANKS_DIR = path.join(ROOT, "src", "exercise-banks");
const ASSEMBLER = path.join(ROOT, "src", "exercises.js");

// --- Cargar bancos + ensamblador en un window simulado -------------------
const windowStub = {};
global.window = windowStub;

const bankFiles = fs.readdirSync(BANKS_DIR).filter((f) => f.endsWith(".js")).sort();
if (bankFiles.length === 0) {
  console.error("validate-exercises: no hay bancos en src/exercise-banks/");
  process.exit(1);
}
for (const f of bankFiles) {
  eval(fs.readFileSync(path.join(BANKS_DIR, f), "utf8"));
}
eval(fs.readFileSync(ASSEMBLER, "utf8"));

const AppExercises = windowStub.AppExercises;
const VALID_MODES = ["guided", "semi-guided", "exam"];
// Mismo criterio que el motor del simulador (sql-engine.js)
const SELECT_RE = /^\s*(SELECT|WITH)\b/i;

let errors = 0;
let warns = 0;
const err = (m) => { console.error("  ✗ " + m); errors++; };
const warn = (m) => { console.warn("  ⚠ " + m); warns++; };

initSqlJs().then((SQL) => {
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const seenIds = {};

  console.log("Validando " + bankFiles.length + " banco(s), " +
    AppExercises.phases.length + " fase(s), " +
    AppExercises.totalExerciseCount() + " ejercicio(s)...\n");

  for (const phase of AppExercises.phases) {
    console.log("Fase " + phase.id + " (" + phase.mode + ") — " +
      phase.exercises.length + " ejercicio(s)");

    if (!VALID_MODES.includes(phase.mode)) {
      err("fase '" + phase.id + "': mode inválido '" + phase.mode + "'");
    }

    for (const ex of phase.exercises) {
      const tag = ex.id || "(sin id)";

      // Campos obligatorios
      for (const field of ["id", "mode", "title", "prompt", "expectedSql", "scoring"]) {
        if (ex[field] == null) err(tag + ": falta el campo '" + field + "'");
      }
      if (!ex.id) continue;

      // Id único
      if (seenIds[ex.id]) {
        err(tag + ": id DUPLICADO (también en fase '" + seenIds[ex.id] + "')");
      }
      seenIds[ex.id] = phase.id;

      // Coherencia de modo
      if (ex.mode && !VALID_MODES.includes(ex.mode)) {
        err(tag + ": mode inválido '" + ex.mode + "'");
      }
      if (ex.mode && ex.mode !== phase.mode) {
        warn(tag + ": mode '" + ex.mode + "' distinto del de su fase ('" + phase.mode + "')");
      }

      if (!ex.expectedSql) continue;

      // Pasa el filtro del motor
      if (!SELECT_RE.test(ex.expectedSql)) {
        err(tag + ": expectedSql no empieza por SELECT/WITH — el motor la rechazaría");
      }

      // Se ejecuta sin error y devuelve filas
      try {
        const res = db.exec(ex.expectedSql);
        const rows = res.length > 0 ? res[0].values : [];
        if (rows.length === 0) {
          warn(tag + ": la consulta devuelve 0 filas — ¿es intencionado?");
        } else {
          console.log("  ✓ " + tag + " (" + rows.length + " fila(s))");
        }
      } catch (e) {
        err(tag + ": ERROR de SQL — " + e.message);
      }

      // ordered=true sin ORDER BY suele ser un descuido
      if (ex.ordered === true && !/order\s+by/i.test(ex.expectedSql)) {
        warn(tag + ": ordered=true pero la consulta no tiene ORDER BY");
      }
    }
  }

  db.close();
  console.log("\nResultado: " + errors + " error(es), " + warns + " aviso(s).");
  process.exit(errors > 0 ? 1 : 0);
}).catch((e) => {
  console.error("validate-exercises: fallo al iniciar sql.js — " + e.message);
  process.exit(1);
});

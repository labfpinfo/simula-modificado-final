#!/usr/bin/env node
/**
 * tools/review-exports.js
 *
 * CORRECCIÓN EN BLOQUE: agrega las entregas HTML exportadas por los
 * alumnos y genera dos CSV listos para abrir en Excel/LibreOffice.
 *
 * Uso:
 *   node tools/review-exports.js carpeta/con/entregas [salida.csv]
 *
 * Ejemplo:
 *   node tools/review-exports.js ~/Descargas/entregas-1DAW notas-1daw.csv
 *
 * Genera:
 *   salida.csv            — una fila por alumno: nombre, nota, %, nº de
 *                           ejercicios resueltos/saltados, intentos y
 *                           pistas totales, fecha de exportación.
 *   salida-detalle.csv    — una fila por (alumno × ejercicio): intentos,
 *                           pistas, resuelto, saltado, variación de nota.
 *                           Útil para ver QUÉ ejercicios costaron más.
 *
 * Cómo funciona: cada HTML exportado por el simulador lleva embebido un
 * bloque <script type="application/json" id="continuation-data"> con el
 * progreso completo (ver src/export-package.js). Esta herramienta lo
 * extrae y lo tabula. No necesita navegador ni dependencias externas.
 *
 * Nota de evaluación: la puntuación se calcula en el cliente (el
 * navegador del alumno), así que trátala como orientativa — el registro
 * de intentos por ejercicio es más difícil de falsear con coherencia y
 * es el dato interesante para detectar anomalías.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const MARKER_RE =
  /<script type="application\/json" id="continuation-data">\s*([\s\S]*?)\s*<\/script>/;

function fail(msg) {
  console.error("review-exports: " + msg);
  process.exit(1);
}

const inDir = process.argv[2];
if (!inDir) {
  fail("uso: node tools/review-exports.js <carpeta-con-entregas> [salida.csv]");
}
if (!fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()) {
  fail("'" + inDir + "' no existe o no es una carpeta");
}
const outFile = process.argv[3] || "resumen-entregas.csv";
const outDetail = outFile.replace(/\.csv$/i, "") + "-detalle.csv";

/** Escape a CSV field (quote if it contains ; " or newline). */
function csv(v) {
  const s = String(v == null ? "" : v);
  if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Números con coma decimal (formato es-ES para Excel en español). */
function num(n) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

const files = fs.readdirSync(inDir).filter((f) => /\.html?$/i.test(f)).sort();
if (files.length === 0) fail("no hay archivos .html en '" + inDir + "'");

const summaryRows = [];
const detailRows = [];
let skippedFiles = 0;

for (const f of files) {
  const full = path.join(inDir, f);
  const html = fs.readFileSync(full, "utf8");
  const m = html.match(MARKER_RE);
  if (!m) {
    console.warn("  ⚠ '" + f + "': no contiene datos de continuación — ignorado " +
      "(¿es realmente un export del simulador?)");
    skippedFiles++;
    continue;
  }

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch (e) {
    console.warn("  ⚠ '" + f + "': JSON embebido ilegible (" + e.message + ") — ignorado");
    skippedFiles++;
    continue;
  }

  const log = Array.isArray(data.attemptLog) ? data.attemptLog : [];
  const solved = log.filter((e) => e.solved).length;
  const skipped = log.filter((e) => e.skipped && !e.solved).length;
  const attempts = log.reduce((a, e) => a + (e.attempts || 0), 0);
  const hints = log.reduce((a, e) => a + (e.hintsUsed || 0), 0);
  const pct = data.maxScore > 0 ? (data.score / data.maxScore) * 100 : 0;

  summaryRows.push([
    csv(data.studentName || "(sin nombre)"),
    num(data.score || 0),
    num(data.maxScore || 0),
    num(pct),
    solved,
    skipped,
    log.length,
    attempts,
    hints,
    csv(data.savedAt || ""),
    csv(f),
  ].join(";"));

  for (const e of log) {
    detailRows.push([
      csv(data.studentName || "(sin nombre)"),
      csv(e.exerciseId || ""),
      csv(e.title || ""),
      e.attempts || 0,
      e.hintsUsed || 0,
      e.solved ? "sí" : "no",
      e.skipped ? "sí" : "no",
      num(e.scoreDelta || 0),
      csv(f),
    ].join(";"));
  }
}

const summaryHeader = [
  "Alumno", "Nota", "Nota máxima", "Porcentaje", "Resueltos", "Saltados",
  "Ejercicios iniciados", "Intentos totales", "Pistas totales",
  "Exportado el", "Archivo",
].join(";");
const detailHeader = [
  "Alumno", "Ejercicio (id)", "Ejercicio (título)", "Intentos", "Pistas",
  "Resuelto", "Saltado", "Variación de nota", "Archivo",
].join(";");

// BOM para que Excel abra el UTF-8 (tildes, ñ) correctamente.
fs.writeFileSync(outFile, "\uFEFF" + summaryHeader + "\n" + summaryRows.join("\n") + "\n");
fs.writeFileSync(outDetail, "\uFEFF" + detailHeader + "\n" + detailRows.join("\n") + "\n");

console.log("\nProcesadas " + summaryRows.length + " entrega(s)" +
  (skippedFiles ? " (" + skippedFiles + " archivo(s) ignorado(s))" : "") + ".");
console.log("  → " + outFile + " (resumen por alumno)");
console.log("  → " + outDetail + " (detalle por ejercicio)");

#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const initSqlJs = require("sql.js");

const MARKER_RE = /<script type="application\/json" id="continuation-data">\s*([\s\S]*?)\s*<\/script>/;
const ROOT = path.resolve(__dirname, "..");

function csv(value) {
  const text = String(value == null ? "" : value);
  return /[;"\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function num(value) {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function loadExerciseBank() {
  const context = vm.createContext({ window: { AppExerciseBanks: [] }, console });
  const bankDir = path.join(ROOT, "src", "exercise-banks");
  for (const name of fs.readdirSync(bankDir).filter((name) => name.endsWith(".js")).sort()) {
    vm.runInContext(fs.readFileSync(path.join(bankDir, name), "utf8"), context, { filename: name });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "exercises.js"), "utf8"), context, { filename: "exercises.js" });
  const exercises = new Map();
  for (const phase of context.window.AppExercises.phases) {
    for (const exercise of phase.exercises) exercises.set(exercise.id, exercise);
  }
  return exercises;
}

function sameResult(expected, actual, ordered) {
  if (expected.length !== actual.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].columns.join("\u0000") !== actual[i].columns.join("\u0000")) return false;
    const expectedRows = expected[i].values.map((row) => JSON.stringify(row));
    const actualRows = actual[i].values.map((row) => JSON.stringify(row));
    if (!ordered) {
      expectedRows.sort();
      actualRows.sort();
    }
    if (expectedRows.join("\u0000") !== actualRows.join("\u0000")) return false;
  }
  return true;
}

function runSql(SQL, seed, sql) {
  const db = new SQL.Database(seed);
  try {
    return { result: db.exec(sql) };
  } catch (error) {
    return { error: error.message };
  } finally {
    db.close();
  }
}

async function verifySubmission(data, exercises) {
  const SQL = await initSqlJs();
  const seed = fs.readFileSync(path.join(ROOT, "data", "pokemon.sqlite"));
  const seen = new Set();
  const entries = [];
  let verifiedScore = 0;
  let claimedScore = 0;
  const log = Array.isArray(data.attemptLog) ? data.attemptLog : [];

  for (const entry of log) {
    const exercise = entry && exercises.get(entry.exerciseId);
    let status = "invalid";
    let verified = false;
    let note = "Unknown or duplicate exercise entry.";
    if (exercise && !seen.has(entry.exerciseId) && typeof entry.solved === "boolean" &&
        typeof entry.skipped === "boolean" && Number.isInteger(entry.attempts) && entry.attempts >= 0 &&
        Number.isInteger(entry.hintsUsed) && entry.hintsUsed >= 0 &&
        typeof entry.scoreDelta === "number" && Number.isFinite(entry.scoreDelta)) {
      seen.add(entry.exerciseId);
      const penalty = Math.min(0, entry.scoreDelta);
      const points = entry.solved ? Math.max(0, ((exercise.scoring && exercise.scoring.points) || 1) + penalty) : 0;
      claimedScore += points;
      if (typeof entry.submittedSql === "string" && entry.submittedSql.trim()) {
        const expected = runSql(SQL, seed, exercise.expectedSql);
        const submitted = runSql(SQL, seed, entry.submittedSql);
        verified = !expected.error && !submitted.error && sameResult(expected.result, submitted.result, exercise.ordered !== false);
        status = verified ? "verified" : "mismatch";
        note = verified ? "Submitted SQL matches the canonical result." : "Submitted SQL does not match the canonical result.";
      } else {
        status = "unverifiable";
        note = "No submitted SQL was exported (legacy or incomplete evidence).";
      }
      if (verified) verifiedScore += Math.max(0, ((exercise.scoring && exercise.scoring.points) || 1) + penalty);
    }
    entries.push({ entry, exercise, status, verified, note });
  }
  return { entries, verifiedScore, claimedScore, canonicalMaxScore: [...exercises.values()].reduce((sum, ex) => sum + ((ex.scoring && ex.scoring.points) || 1), 0) };
}

async function reviewDirectory(inDir, outFile) {
  const exercises = loadExerciseBank();
  const files = fs.readdirSync(inDir).filter((file) => /\.html?$/i.test(file)).sort();
  if (files.length === 0) throw new Error("no HTML exports found");
  const summaryRows = [];
  const detailRows = [];
  let skippedFiles = 0;

  for (const file of files) {
    const match = fs.readFileSync(path.join(inDir, file), "utf8").match(MARKER_RE);
    if (!match) { skippedFiles++; continue; }
    let data;
    try { data = JSON.parse(match[1]); } catch (_error) { skippedFiles++; continue; }
    const review = await verifySubmission(data, exercises);
    const verifiedCount = review.entries.filter((item) => item.status === "verified").length;
    const unverifiableCount = review.entries.filter((item) => item.status === "unverifiable").length;
    const invalidCount = review.entries.filter((item) => item.status === "invalid").length;
    summaryRows.push([
      csv(data.studentName || "(unnamed)"), num(review.verifiedScore), num(review.canonicalMaxScore),
      verifiedCount, unverifiableCount, invalidCount,
      csv("Do not use this as an authoritative grade without verified SQL evidence."), csv(file),
    ].join(";"));
    for (const item of review.entries) {
      const entry = item.entry || {};
      detailRows.push([
        csv(data.studentName || "(unnamed)"), csv(entry.exerciseId || ""),
        csv(item.exercise ? item.exercise.title : ""), entry.attempts || 0, entry.hintsUsed || 0,
        entry.solved === true ? "yes" : "no", item.status, csv(item.note), csv(file),
      ].join(";"));
    }
  }
  const detailFile = outFile.replace(/\.csv$/i, "") + "-detail.csv";
  fs.writeFileSync(outFile, "\uFEFFStudent;Verified score;Canonical maximum;Verified SQL;Unverifiable entries;Invalid entries;Trust limitation;File\n" + summaryRows.join("\n") + "\n");
  fs.writeFileSync(detailFile, "\uFEFFStudent;Exercise id;Canonical title;Attempts;Hints;Claimed solved;Verification;Evidence note;File\n" + detailRows.join("\n") + "\n");
  return { processed: summaryRows.length, skippedFiles, outFile, detailFile };
}

async function main() {
  const inDir = process.argv[2];
  if (!inDir || !fs.existsSync(inDir) || !fs.statSync(inDir).isDirectory()) {
    throw new Error("usage: node tools/review-exports.js <export-directory> [output.csv]");
  }
  const result = await reviewDirectory(inDir, process.argv[3] || "submission-review.csv");
  console.log("Processed " + result.processed + " submission(s)" + (result.skippedFiles ? "; skipped " + result.skippedFiles + " invalid file(s)" : "") + ".");
  console.log("  " + result.outFile);
  console.log("  " + result.detailFile);
}

module.exports = { loadExerciseBank, verifySubmission, reviewDirectory };

if (require.main === module) {
  main().catch((error) => {
    console.error("review-exports: " + error.message);
    process.exitCode = 1;
  });
}

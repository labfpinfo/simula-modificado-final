const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadExerciseBank, verifySubmission, reviewDirectory } = require("./review-exports.js");

describe("review-exports", function () {
  it("derives verification from canonical SQL rather than exported score aggregates", async function () {
    const exercises = loadExerciseBank();
    const exercise = exercises.get("g1-simple-where");
    const data = {
      studentName: "Student",
      score: 999,
      maxScore: 999,
      attemptLog: [{
        exerciseId: exercise.id,
        title: "Forged title",
        attempts: 1,
        hintsUsed: 0,
        solved: true,
        skipped: false,
        scoreDelta: 0,
        submittedSql: exercise.expectedSql,
      }],
    };
    const verification = await verifySubmission(data, exercises);
    assert.strictEqual(verification.verifiedScore, exercise.scoring.points);
    assert.strictEqual(verification.entries[0].status, "verified");

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-exports-"));
    try {
      fs.writeFileSync(path.join(directory, "student.html"),
        '<script type="application/json" id="continuation-data">' + JSON.stringify(data) + "</script>");
      const output = path.join(directory, "review.csv");
      await reviewDirectory(directory, output);
      const csv = fs.readFileSync(output, "utf8");
      assert.ok(!csv.includes("999"));
      assert.ok(csv.includes("Verified score"));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

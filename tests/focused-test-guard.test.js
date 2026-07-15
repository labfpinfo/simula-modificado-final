const { describe, it } = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const checker = path.resolve(__dirname, "..", "tools", "check-focused-tests.js");

describe("focused-test guard", function () {
  it("rejects a focused test while accepting an ordinary test", function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "focused-test-guard-"));
    try {
      fs.writeFileSync(path.join(directory, "ordinary.test.js"), "test('ordinary', () => {});\n");
      assert.strictEqual(childProcess.spawnSync(process.execPath, [checker, directory]).status, 0);
      fs.writeFileSync(path.join(directory, "focused.test.js"), "test" + ".only('focused', () => {});\n");
      assert.notStrictEqual(childProcess.spawnSync(process.execPath, [checker, directory]).status, 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

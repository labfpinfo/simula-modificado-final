#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || ".");
const focusedPattern = /\b(?:test|it|describe)\s*\.\s*only\s*\(/;
const ignored = new Set([".git", ".atl", "dist", "node_modules"]);
const matches = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(fullPath);
    else if (/\.(?:[cm]?js|jsx|ts|tsx)$/.test(entry.name) && focusedPattern.test(fs.readFileSync(fullPath, "utf8"))) {
      matches.push(path.relative(root, fullPath));
    }
  }
}

scan(root);
if (matches.length > 0) {
  console.error("Focused tests are not allowed in committed test suites:");
  for (const match of matches) console.error("  " + match);
  process.exitCode = 1;
}

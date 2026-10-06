#!/usr/bin/env node
// File size guard: source files should stay under ~400 lines and must stay
// under 600, not counting tests. Test files (*.test.ts[x]) are skipped, and a
// Rust file is measured only up to its `#[cfg(test)]` module.

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const SOFT_LIMIT = 400;
const HARD_LIMIT = 600;
const ROOTS = ["src", "src-tauri/src"];
const EXTENSIONS = [".ts", ".tsx", ".rs"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

function isMeasured(path) {
  return EXTENSIONS.some((ext) => path.endsWith(ext)) && !/\.test\.tsx?$/.test(path);
}

export function countNonTestLines(path, text) {
  const lines = text.split(/\r?\n/);
  if (path.endsWith(".rs")) {
    const testStart = lines.findIndex((line) => line.trim() === "#[cfg(test)]");
    if (testStart >= 0) return testStart;
  }
  return lines.length;
}

const over = [];
const near = [];
for (const root of ROOTS) {
  for (const path of walk(root)) {
    if (!isMeasured(path)) continue;
    const count = countNonTestLines(path, readFileSync(path, "utf-8"));
    const rel = relative(process.cwd(), path).replaceAll("\\", "/");
    if (count > HARD_LIMIT) over.push([rel, count]);
    else if (count > SOFT_LIMIT) near.push([rel, count]);
  }
}

for (const [rel, count] of near) {
  console.log(`note: ${rel} has ${count} lines (aim for under ${SOFT_LIMIT}; split it when you next grow it)`);
}
if (over.length > 0) {
  for (const [rel, count] of over) {
    console.error(`error: ${rel} has ${count} lines (limit ${HARD_LIMIT}, tests excluded). Split it by responsibility.`);
  }
  process.exit(1);
}
console.log(`check-size: ok (limit ${HARD_LIMIT}, tests excluded)`);

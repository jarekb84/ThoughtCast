#!/usr/bin/env node
// Commit message convention, enforced by .husky/commit-msg. The first line is
// `PREFIX: what changed`:
//
//   IMPROVE: Add vocabulary hints to Whisper
//   BUG: Keep the stop cue out of the recording
//   MINOR: Transcription accuracy round (#57)
//
// MINOR and MAJOR are the release-bump prefixes that
// .github/workflows/auto-tag.yml looks for in the newest commit on main
// (PRs are squash-merged, so that's the PR title). Every other prefix
// releases as a patch.
//
// Git's own messages (merges, reverts, fixup!/squash!) pass untouched.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";

export const PREFIXES = ["IMPROVE", "BUG", "REFACTOR", "DOCS", "CHORE", "MINOR", "MAJOR"];

const CONVENTIONAL = new RegExp(`^(?:${PREFIXES.join("|")}): \\S`);
const GIT_GENERATED = /^(Merge |Revert "|fixup! |squash! |amend! )/;

/** Returns null when the message is fine, or an explanation when it isn't. */
export function checkCommitMessage(message) {
  const firstLine = message
    .split(/\r?\n/)
    .find((line) => line.trim() !== "" && !line.startsWith("#"));

  if (!firstLine) return "Commit message is empty.";
  if (GIT_GENERATED.test(firstLine) || CONVENTIONAL.test(firstLine)) return null;

  return [
    `Commit message must start with one of ${PREFIXES.map((p) => `${p}:`).join(", ")}`,
    `(MINOR: or MAJOR: on the PR title picks the release bump; anything else is a patch).`,
    `Got: "${firstLine}"`,
    `Example: IMPROVE: Add vocabulary hints to Whisper`,
  ].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/check-commit-msg.mjs <commit message file>");
    process.exit(2);
  }
  const error = checkCommitMessage(readFileSync(file, "utf-8"));
  if (error) {
    console.error(error);
    process.exit(1);
  }
}

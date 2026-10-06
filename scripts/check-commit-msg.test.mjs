import { describe, it, expect } from "vitest";
import { checkCommitMessage } from "./check-commit-msg.mjs";

describe("checkCommitMessage", () => {
  it.each([
    "IMPROVE: Add vocabulary hints to Whisper",
    "BUG: Keep the stop cue out of the recording\n\nBody text.",
    "REFACTOR: Split session lifecycle",
    "DOCS: Rewrite the setup guide",
    "CHORE: Ignore docs/voiceNotes/",
    "MINOR: Transcription accuracy round (#57)",
    "MAJOR: New storage format",
    "Merge branch 'main' into feature",
    'Revert "BUG: Something"',
    "fixup! IMPROVE: Something",
    "# comment line from git\nIMPROVE: After a comment",
  ])("accepts %j", (message) => {
    expect(checkCommitMessage(message)).toBeNull();
  });

  it.each([
    "Add a recording quality report",
    "improve: lowercase prefix",
    "IMPROVE:missing space",
    "IMPROVE - wrong separator",
    "FEATURE: Unknown prefix",
    "[minor] IMPROVE: Bracket markers are not the convention",
    "Minor: Mixed case",
  ])("rejects %j", (message) => {
    expect(checkCommitMessage(message)).toMatch(/must start with/);
  });

  it("rejects an empty message", () => {
    expect(checkCommitMessage("\n# only comments\n")).toBe("Commit message is empty.");
  });
});

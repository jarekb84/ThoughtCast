import { describe, it, expect } from "vitest";
import { evaluateShortcutEvent } from "./evaluateShortcutEvent";

describe("evaluateShortcutEvent — toggle mode", () => {
  it("starts when idle and shortcut pressed", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "toggle",
      recordingStatus: "idle",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "start" });
  });

  it("stops when recording and shortcut pressed", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "toggle",
      recordingStatus: "recording",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "stop" });
  });

  it("stops when paused and shortcut pressed", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "toggle",
      recordingStatus: "paused",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "stop" });
  });

  it("starts a new recording while processing — PRD edge case 2", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "toggle",
      recordingStatus: "processing",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "start" });
  });

  it("ignores release events in toggle mode", () => {
    const action = evaluateShortcutEvent("released", {
      triggerMode: "toggle",
      recordingStatus: "recording",
      isHeld: true,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "ignore" });
  });

  it("ignores repeat presses while held — PRD edge case 3", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "toggle",
      recordingStatus: "recording",
      isHeld: true,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "ignore" });
  });
});

describe("evaluateShortcutEvent — push-to-talk mode", () => {
  it("schedules start when pressed from idle (sub-300ms tap guard)", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "push-to-talk",
      recordingStatus: "idle",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "schedule-start" });
  });

  it("schedules start when pressed during processing of previous take", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "push-to-talk",
      recordingStatus: "processing",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "schedule-start" });
  });

  it("ignores press while already recording (repeat key artifact)", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "push-to-talk",
      recordingStatus: "recording",
      isHeld: false,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "ignore" });
  });

  it("ignores release that arrived before PTT start fired — PRD edge case 4", () => {
    const action = evaluateShortcutEvent("released", {
      triggerMode: "push-to-talk",
      recordingStatus: "idle",
      isHeld: true,
      pttStarted: false,
    });
    expect(action).toEqual({ kind: "ignore" });
  });

  it("stops on release once PTT recording is live", () => {
    const action = evaluateShortcutEvent("released", {
      triggerMode: "push-to-talk",
      recordingStatus: "recording",
      isHeld: true,
      pttStarted: true,
    });
    expect(action).toEqual({ kind: "stop-after-ptt" });
  });

  it("ignores repeat presses while held", () => {
    const action = evaluateShortcutEvent("pressed", {
      triggerMode: "push-to-talk",
      recordingStatus: "recording",
      isHeld: true,
      pttStarted: true,
    });
    expect(action).toEqual({ kind: "ignore" });
  });
});

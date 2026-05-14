import { describe, it, expect } from "vitest";
import { captureAcceleratorFromEvent } from "./captureAccelerator";

function make(init: Partial<KeyboardEventInit & { code: string }>): KeyboardEvent {
  return new KeyboardEvent("keydown", init as KeyboardEventInit);
}

describe("captureAcceleratorFromEvent", () => {
  it("returns null for pure modifier keys", () => {
    expect(captureAcceleratorFromEvent(make({ key: "Control" }))).toBeNull();
    expect(captureAcceleratorFromEvent(make({ key: "Shift" }))).toBeNull();
    expect(captureAcceleratorFromEvent(make({ key: "Alt" }))).toBeNull();
    expect(captureAcceleratorFromEvent(make({ key: "Meta" }))).toBeNull();
  });

  it("captures F-keys directly", () => {
    expect(captureAcceleratorFromEvent(make({ key: "F1" }))).toBe("F1");
    expect(captureAcceleratorFromEvent(make({ key: "F12" }))).toBe("F12");
    expect(captureAcceleratorFromEvent(make({ key: "F24" }))).toBe("F24");
  });

  it("uppercases single letters", () => {
    expect(captureAcceleratorFromEvent(make({ key: "r" }))).toBe("R");
    expect(captureAcceleratorFromEvent(make({ key: "a" }))).toBe("A");
  });

  it("builds compound modifiers in canonical order", () => {
    const result = captureAcceleratorFromEvent(
      make({ key: "r", ctrlKey: true, shiftKey: true })
    );
    expect(result).toBe("CommandOrControl+Shift+R");
  });

  it("treats meta as CommandOrControl (macOS convention)", () => {
    const result = captureAcceleratorFromEvent(
      make({ key: "r", metaKey: true })
    );
    expect(result).toBe("CommandOrControl+R");
  });

  it("captures Alt combinations", () => {
    const result = captureAcceleratorFromEvent(make({ key: "r", altKey: true }));
    expect(result).toBe("Alt+R");
  });

  it("normalizes arrow keys to short form", () => {
    expect(captureAcceleratorFromEvent(make({ key: "ArrowUp" }))).toBe("Up");
    expect(captureAcceleratorFromEvent(make({ key: "ArrowRight" }))).toBe(
      "Right"
    );
  });

  it("normalizes Space", () => {
    expect(captureAcceleratorFromEvent(make({ key: " " }))).toBe("Space");
  });

  it("captures named keys like Escape and Enter", () => {
    expect(captureAcceleratorFromEvent(make({ key: "Escape" }))).toBe("Escape");
    expect(captureAcceleratorFromEvent(make({ key: "Enter" }))).toBe("Enter");
  });

  it("uses `code` for numpad digits", () => {
    expect(
      captureAcceleratorFromEvent(make({ key: "5", code: "Numpad5" }))
    ).toBe("5"); // single-digit branch wins; numpad branch is a safety net for non-printable cases
  });

  it("returns null for unrecognized keys", () => {
    expect(captureAcceleratorFromEvent(make({ key: "Unidentified" }))).toBeNull();
  });
});

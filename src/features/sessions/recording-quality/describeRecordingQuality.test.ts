import { describe, it, expect } from "vitest";
import { describeRecordingQuality } from "./describeRecordingQuality";
import type { RecordingQuality } from "../../../api";

const good: RecordingQuality = {
  speech_level_db: -33.2,
  noise_floor_db: -59.7,
  snr_db: 26.5,
  clipped_percent: 0,
  level_swing_db: 3.9,
  rating: "good",
  issues: [],
};

describe("describeRecordingQuality", () => {
  it("summarizes a good recording without tips", () => {
    const d = describeRecordingQuality(good);
    expect(d.label).toBe("Good");
    expect(d.summary).toBe("Voice −33 dBFS, background −60 dBFS (27 dB apart)");
    expect(d.tips).toEqual([]);
  });

  it("gives one tip per issue, noise before level swings", () => {
    const d = describeRecordingQuality({
      ...good,
      snr_db: 19.9,
      level_swing_db: 14.8,
      rating: "fair",
      issues: ["uneven-level", "noisy"],
    });
    expect(d.label).toBe("Fair");
    expect(d.tips).toHaveLength(2);
    expect(d.tips[0]).toMatch(/Background noise/);
    expect(d.tips[1]).toMatch(/minute to minute/);
  });

  it("explains clipping and quiet input", () => {
    const d = describeRecordingQuality({
      ...good,
      rating: "poor",
      issues: ["clipping", "too-quiet"],
    });
    expect(d.tips[0]).toMatch(/quietly/);
    expect(d.tips[1]).toMatch(/clipped/);
  });
});

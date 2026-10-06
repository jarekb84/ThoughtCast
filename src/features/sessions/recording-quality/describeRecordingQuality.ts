import type { QualityIssue, QualityRating, RecordingQuality } from "../../../api";

export interface RecordingQualityDescription {
  rating: QualityRating;
  label: string;
  /** e.g. "Voice −33 dBFS, background −60 dBFS (27 dB apart)" */
  summary: string;
  /** One actionable suggestion per detected issue, most impactful first. */
  tips: string[];
}

const RATING_LABELS: Record<QualityRating, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const ISSUE_ORDER: QualityIssue[] = ["noisy", "uneven-level", "too-quiet", "clipping"];

const ISSUE_TIPS: Record<QualityIssue, string> = {
  noisy:
    "Background noise is close to your voice. Get closer to the mic or point it at your mouth; a headset or dynamic mic picks up much less of the room.",
  "uneven-level":
    "Your level changed a lot from minute to minute, which usually means the distance to the mic changed while you moved. A headset or clip-on mic keeps it constant.",
  "too-quiet":
    "Your voice reached the mic quietly. Move the mic closer (about a hand's width to a forearm's length) or raise its input gain in your system sound settings.",
  clipping:
    "The input clipped because it was too loud. Lower the mic's input gain a little.",
};

/** Turn the measured numbers into a short label, a summary and fix-it tips. */
export function describeRecordingQuality(
  quality: RecordingQuality
): RecordingQualityDescription {
  const tips = ISSUE_ORDER.filter((issue) => quality.issues.includes(issue)).map(
    (issue) => ISSUE_TIPS[issue]
  );

  return {
    rating: quality.rating,
    label: RATING_LABELS[quality.rating],
    summary: `Voice ${formatDb(quality.speech_level_db)} dBFS, background ${formatDb(
      quality.noise_floor_db
    )} dBFS (${Math.round(quality.snr_db)} dB apart)`,
    tips,
  };
}

/** Whole decibels with a typographic minus sign. */
function formatDb(value: number): string {
  const rounded = Math.round(value);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `${rounded}`;
}

import SettingsSection from "./SettingsSection";
import { Button } from "../../../shared/components";
import type { useSettingsForm } from "../useSettingsForm";
import { AudioFeedbackConfig, CueType } from "../appConfig";
import { CuePathField, useAudioCueRow } from "./useAudioCueRow";
import "./AudioFeedbackSection.css";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface AudioFeedbackSectionProps {
  form: FormHandle;
}

interface CueRow {
  cue: CueType;
  label: string;
  description: string;
  /** Which `AudioFeedbackConfig` path field this row reads / writes. */
  pathField: CuePathField;
}

const CUE_ROWS: ReadonlyArray<CueRow> = [
  {
    cue: "start",
    label: "Recording started",
    description: "Plays the moment recording begins.",
    pathField: "startCuePath",
  },
  {
    cue: "stop",
    label: "Recording stopped",
    description: "Plays after you stop a recording.",
    pathField: "stopCuePath",
  },
  {
    cue: "ready",
    label: "Transcription ready",
    description: "Plays once the transcript is on the clipboard.",
    pathField: "readyCuePath",
  },
];

/**
 * Settings → Audio Feedback tab.
 *
 * Hosts the master enable toggle, the volume slider, and three cue rows.
 * Each row's path picker writes an absolute path into the form draft; an
 * empty path means "use the bundled default at
 * `<documents>/ThoughtCast/sounds/<cue>.wav`" (Rust resolves at playback time).
 */
export default function AudioFeedbackSection({ form }: AudioFeedbackSectionProps) {
  const feedback = form.draft.audioFeedback;

  const setField = (next: Partial<AudioFeedbackConfig>) => {
    form.setField("audioFeedback", { ...feedback, ...next });
  };

  return (
    <SettingsSection
      title="Audio Feedback"
      description="Short, non-verbal cues so you can tell — by sound alone — what just happened."
    >
      <label className="audio-feedback-toggle">
        <input
          type="checkbox"
          checked={feedback.enabled}
          onChange={(e) => setField({ enabled: e.target.checked })}
        />
        <span>Play audio cues</span>
      </label>

      <div className="audio-feedback-volume">
        <label htmlFor="audio-feedback-volume-slider">Volume</label>
        <input
          id="audio-feedback-volume-slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={feedback.volume}
          disabled={!feedback.enabled}
          onChange={(e) => setField({ volume: Number(e.target.value) })}
        />
        <span className="audio-feedback-volume-readout">
          {Math.round(feedback.volume * 100)}%
        </span>
      </div>

      <div className="audio-feedback-cues">
        <h4 className="audio-feedback-cues-heading">Cues</h4>
        {CUE_ROWS.map((row) => (
          <AudioFeedbackCueRow
            key={row.cue}
            row={row}
            feedback={feedback}
            volume={feedback.volume}
            disabled={!feedback.enabled}
            onChange={(next) => setField(next)}
          />
        ))}
      </div>
    </SettingsSection>
  );
}

interface CueRowProps {
  row: CueRow;
  feedback: AudioFeedbackConfig;
  volume: number;
  disabled: boolean;
  onChange: (partial: Partial<AudioFeedbackConfig>) => void;
}

function AudioFeedbackCueRow({
  row,
  feedback,
  volume,
  disabled,
  onChange,
}: CueRowProps) {
  const {
    defaultPath,
    isUsingDefault,
    validationMessage,
    validationOk,
    handleBrowse,
    handlePreview,
    handleReset,
  } = useAudioCueRow({
    cue: row.cue,
    label: row.label,
    pathField: row.pathField,
    feedback,
    volume,
    onChange,
  });
  const currentPath = feedback[row.pathField];

  return (
    <div className={"audio-feedback-cue-row" + (disabled ? " disabled" : "")}>
      <div className="audio-feedback-cue-header">
        <span className="audio-feedback-cue-label">{row.label}</span>
        <span className="audio-feedback-cue-description">{row.description}</span>
      </div>
      <div className="audio-feedback-cue-controls">
        <input
          type="text"
          className="audio-feedback-cue-path"
          value={currentPath}
          spellCheck={false}
          placeholder={
            isUsingDefault
              ? `Default: ${defaultPath || "loading…"}`
              : "Custom file"
          }
          onChange={(e) =>
            onChange({
              [row.pathField]: e.target.value,
            } as Partial<AudioFeedbackConfig>)
          }
          disabled={disabled}
        />
        <Button variant="secondary" onClick={handleBrowse} disabled={disabled}>
          Browse…
        </Button>
        <Button variant="secondary" onClick={handlePreview} disabled={disabled}>
          ▶ Preview
        </Button>
        {!isUsingDefault && (
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={disabled}
          >
            Reset
          </Button>
        )}
      </div>
      {validationMessage && (
        <span
          className={
            "audio-feedback-cue-validation " +
            (validationOk ? "validation-ok" : "validation-bad")
          }
        >
          {validationOk ? "✓" : "⚠"} {validationMessage}
        </span>
      )}
    </div>
  );
}

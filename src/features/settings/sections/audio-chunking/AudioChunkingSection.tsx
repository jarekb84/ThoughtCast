import SettingsSection from "../SettingsSection";
import type { useSettingsForm } from "../../useSettingsForm";
import { CHUNKING_LIMITS } from "../../appConfig";
import { useChunkingOverheadSummary } from "./useChunkingOverheadSummary";
import { minutesToChunkSeconds } from "./minutesToChunkSeconds";
import { formatHumanReadableDuration } from "../../../transcription/formatHumanReadableDuration";
import "./AudioChunkingSection.css";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface AudioChunkingSectionProps {
  form: FormHandle;
}

/**
 * Settings → Audio Chunking section (rendered under the Transcription tab).
 *
 * Hosts the master toggle, target chunk-window inputs (min/max minutes),
 * silence-detect threshold and minimum-silence-duration controls, plus a
 * read-only "Recent performance" block summarizing chunking overhead so the
 * user can judge whether the feature is worth keeping enabled.
 */
export default function AudioChunkingSection({
  form,
}: AudioChunkingSectionProps) {
  const chunking = form.draft.audioChunking;
  const overhead = useChunkingOverheadSummary();

  const setMinutesField = (
    field: "minChunkDurationSec" | "maxChunkDurationSec",
    minutes: number
  ) => {
    const seconds = minutesToChunkSeconds(minutes);
    if (seconds === null) return;
    form.setChunkingField(field, seconds);
  };

  return (
    <SettingsSection
      title="Audio Chunking"
      description="Split long recordings at silent pauses before transcribing — avoids repetition loops on long files. Recommended for recordings over 10 minutes."
    >
      <label className="chunking-toggle">
        <input
          type="checkbox"
          checked={chunking.enabled}
          onChange={(e) => form.setChunkingField("enabled", e.target.checked)}
        />
        <span>Enable chunking for long recordings</span>
      </label>

      <fieldset className="chunking-fieldset" disabled={!chunking.enabled}>
        <div className="chunking-subheading">Target chunk length</div>
        <div className="chunking-field-row">
          <label className="chunking-field">
            <span>Min</span>
            <input
              type="number"
              min={CHUNKING_LIMITS.minChunkDurationSec.min / 60}
              max={CHUNKING_LIMITS.minChunkDurationSec.max / 60}
              step={1}
              value={Math.round(chunking.minChunkDurationSec / 60)}
              onChange={(e) =>
                setMinutesField("minChunkDurationSec", Number(e.target.value))
              }
            />
            <span className="chunking-field-suffix">min</span>
          </label>
          <label className="chunking-field">
            <span>Max</span>
            <input
              type="number"
              min={CHUNKING_LIMITS.maxChunkDurationSec.min / 60}
              max={CHUNKING_LIMITS.maxChunkDurationSec.max / 60}
              step={1}
              value={Math.round(chunking.maxChunkDurationSec / 60)}
              onChange={(e) =>
                setMinutesField("maxChunkDurationSec", Number(e.target.value))
              }
            />
            <span className="chunking-field-suffix">min</span>
          </label>
        </div>
        {(form.fieldErrors.chunkingMinDuration ||
          form.fieldErrors.chunkingMaxDuration ||
          form.fieldErrors.chunkingMinMaxOrder) && (
          <p className="chunking-field-error">
            {form.fieldErrors.chunkingMinDuration ||
              form.fieldErrors.chunkingMaxDuration ||
              form.fieldErrors.chunkingMinMaxOrder}
          </p>
        )}

        <div className="chunking-subheading">Silence detection</div>
        <div className="chunking-field-row">
          <label className="chunking-field">
            <span>Threshold</span>
            <input
              type="number"
              min={CHUNKING_LIMITS.silenceThresholdDb.min}
              max={CHUNKING_LIMITS.silenceThresholdDb.max}
              step={1}
              value={chunking.silenceThresholdDb}
              onChange={(e) =>
                form.setChunkingField(
                  "silenceThresholdDb",
                  Number(e.target.value)
                )
              }
            />
            <span className="chunking-field-suffix">dB</span>
          </label>
          <label className="chunking-field">
            <span>Min duration</span>
            <input
              type="number"
              min={CHUNKING_LIMITS.minSilenceDurationSec.min}
              max={CHUNKING_LIMITS.minSilenceDurationSec.max}
              step={0.1}
              value={chunking.minSilenceDurationSec}
              onChange={(e) =>
                form.setChunkingField(
                  "minSilenceDurationSec",
                  Number(e.target.value)
                )
              }
            />
            <span className="chunking-field-suffix">sec</span>
          </label>
        </div>
        {(form.fieldErrors.chunkingSilenceThreshold ||
          form.fieldErrors.chunkingMinSilenceDuration) && (
          <p className="chunking-field-error">
            {form.fieldErrors.chunkingSilenceThreshold ||
              form.fieldErrors.chunkingMinSilenceDuration}
          </p>
        )}
      </fieldset>

      <ChunkingOverheadReadout overhead={overhead} />
    </SettingsSection>
  );
}

interface OverheadReadoutProps {
  overhead: ReturnType<typeof useChunkingOverheadSummary>;
}

function ChunkingOverheadReadout({ overhead }: OverheadReadoutProps) {
  if (overhead.sampleCount === 0) {
    return (
      <div className="chunking-overhead chunking-overhead-empty">
        No chunked recordings yet — analysis overhead will appear here after
        the first long recording.
      </div>
    );
  }

  const avgPerMinute = overhead.averageOverheadPerMinute ?? 0;
  const longest = overhead.longestAnalysisSeconds ?? 0;
  const longestAudio = overhead.longestAnalysisAudioSeconds ?? 0;

  return (
    <div className="chunking-overhead">
      <div className="chunking-overhead-heading">Recent performance</div>
      <div className="chunking-overhead-row">
        Last {overhead.sampleCount} chunked{" "}
        {overhead.sampleCount === 1 ? "recording" : "recordings"}: median{" "}
        {avgPerMinute.toFixed(2)}s analysis per minute of audio.
      </div>
      <div className="chunking-overhead-row">
        Longest analysis: {longest.toFixed(1)}s on a{" "}
        {formatHumanReadableDuration(longestAudio)} recording.
      </div>
    </div>
  );
}

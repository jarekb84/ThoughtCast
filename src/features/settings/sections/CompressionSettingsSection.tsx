import SettingsSection from "./SettingsSection";
import PathPickerField from "../PathPickerField";
import { COMPRESSION_AGE_OPTIONS } from "../appConfig";
import type { useSettingsForm } from "../useSettingsForm";
import "./CompressionSettingsSection.css";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface CompressionSettingsSectionProps {
  form: FormHandle;
  onCompressNow?: () => void;
  compressNowDisabledReason?: string;
  storageSummary?: React.ReactNode;
}

/**
 * Audio Compression section of the Settings panel.
 *
 * Toggles + age threshold + (optional) one-time "Compress now" button +
 * (optional) storage summary slot. The optional props are filled in by
 * Phase D — Phase A only wires the toggle persistence and FFmpeg path.
 */
export default function CompressionSettingsSection({
  form,
  onCompressNow,
  compressNowDisabledReason,
  storageSummary,
}: CompressionSettingsSectionProps) {
  const compression = form.draft.audioCompression;

  return (
    <SettingsSection
      title="Audio Compression"
      description="Convert recordings from uncompressed WAV to compact M4A — about 90% smaller, same audio."
    >
      <PathPickerField
        label="FFmpeg path"
        value={form.draft.ffmpegPath}
        kind="ffmpeg"
        validation={form.pathValidations["ffmpegPath"]}
        errorOverride={form.fieldErrors.ffmpegPath}
        pickerOptions={{
          title: "Locate the FFmpeg binary",
          filters: [{ name: "Executable", extensions: ["exe", ""] }],
        }}
        onChange={(v) => form.setField("ffmpegPath", v)}
        onValidate={() => form.revalidatePath("ffmpegPath", "ffmpeg")}
        helpText="Install FFmpeg from ffmpeg.org and point to the binary."
      />

      <label className="compression-toggle">
        <input
          type="checkbox"
          checked={compression.compressNewRecordings}
          onChange={(e) =>
            form.setCompressionField("compressNewRecordings", e.target.checked)
          }
        />
        <span>Compress new recordings after transcription</span>
      </label>

      <label className="compression-toggle">
        <input
          type="checkbox"
          checked={compression.compressOldRecordingsEnabled}
          onChange={(e) =>
            form.setCompressionField(
              "compressOldRecordingsEnabled",
              e.target.checked
            )
          }
        />
        <span>Auto-compress existing recordings older than:</span>
      </label>

      <div className="compression-age-row">
        {COMPRESSION_AGE_OPTIONS.map((days) => (
          <label key={days} className="compression-age-option">
            <input
              type="radio"
              name="compressOldRecordingsOlderThanDays"
              value={days}
              checked={
                compression.compressOldRecordingsOlderThanDays === days
              }
              disabled={!compression.compressOldRecordingsEnabled}
              onChange={() =>
                form.setCompressionField(
                  "compressOldRecordingsOlderThanDays",
                  days
                )
              }
            />
            <span>{days === 1 ? "1 day" : `${days} days`}</span>
          </label>
        ))}
      </div>
      <p className="compression-actions-hint">
        Automatic sweep runs on app startup when this is enabled. The button
        below ignores the threshold and compresses every uncompressed WAV.
      </p>

      <p className="compression-format-note">
        Format: M4A (AAC, ~90% smaller than WAV)
      </p>

      {storageSummary && (
        <div className="compression-storage">{storageSummary}</div>
      )}

      {onCompressNow && (
        <div className="compression-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCompressNow}
            disabled={Boolean(compressNowDisabledReason)}
            title={compressNowDisabledReason}
          >
            Compress All WAV Files Now
          </button>
          {compressNowDisabledReason && (
            <span className="compression-actions-hint">
              {compressNowDisabledReason}
            </span>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

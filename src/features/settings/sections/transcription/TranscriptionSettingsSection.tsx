import SettingsSection from "../SettingsSection";
import type { useSettingsForm } from "../../useSettingsForm";
import { TRANSCRIPTION_ENGINE_OPTIONS } from "./transcriptionEngineOptions";
import WhisperEngineFields from "./WhisperEngineFields";
import ParakeetEngineFields from "./ParakeetEngineFields";
import "./TranscriptionSettingsSection.css";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface TranscriptionSettingsSectionProps {
  form: FormHandle;
}

/** Settings → Transcription: engine choice, then that engine's files and options. */
export default function TranscriptionSettingsSection({
  form,
}: TranscriptionSettingsSectionProps) {
  const engine = form.draft.transcription.engine;

  return (
    <SettingsSection
      title="Transcription"
      description="The local engine and model that turn each recording into text. Everything runs on this machine."
    >
      <fieldset className="transcription-engine-fieldset">
        <legend className="transcription-engine-legend">Engine</legend>
        {TRANSCRIPTION_ENGINE_OPTIONS.map((option) => (
          <label key={option.value} className="transcription-engine-radio">
            <input
              type="radio"
              name="transcription-engine"
              value={option.value}
              checked={engine === option.value}
              onChange={() => form.setTranscriptionField("engine", option.value)}
            />
            <span className="transcription-engine-radio-text">
              <span className="transcription-engine-radio-label">{option.label}</span>
              <span className="transcription-engine-radio-description">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {engine === "whisper" ? (
        <WhisperEngineFields form={form} />
      ) : (
        <ParakeetEngineFields form={form} />
      )}
    </SettingsSection>
  );
}

import PathPickerField from "../../PathPickerField";
import type { useSettingsForm } from "../../useSettingsForm";

type FormHandle = ReturnType<typeof useSettingsForm>;

/** Whisper's binary and model, plus the options that improve its accuracy. */
export default function WhisperEngineFields({ form }: { form: FormHandle }) {
  const t = form.draft.transcription;

  return (
    <>
      <PathPickerField
        label="Whisper CLI"
        value={form.draft.whisperPath}
        kind="executable"
        validation={form.pathValidations["whisperPath"]}
        pickerOptions={{
          title: "Locate the Whisper CLI binary",
          filters: [{ name: "Executable", extensions: ["exe", ""] }],
        }}
        onChange={(v) => form.setField("whisperPath", v)}
        onValidate={() => form.revalidatePath("whisperPath", "executable")}
        helpText="Path to the compiled whisper-cli (or whisper-cli.exe on Windows)."
      />
      <PathPickerField
        label="Model file"
        value={form.draft.modelPath}
        kind="file"
        validation={form.pathValidations["modelPath"]}
        pickerOptions={{
          title: "Locate a Whisper model file",
          filters: [{ name: "GGML model", extensions: ["bin"] }],
        }}
        onChange={(v) => form.setField("modelPath", v)}
        onValidate={() => form.revalidatePath("modelPath", "file")}
        helpText="A downloaded .bin model file. ggml-large-v3-turbo.bin is the recommended one."
      />

      <div className="transcription-subheading">Accuracy</div>
      <PathPickerField
        label="Voice activity detection model"
        value={t.vadModelPath}
        kind="file"
        validation={form.pathValidations["transcription.vadModelPath"]}
        pickerOptions={{
          title: "Locate a Silero VAD model file",
          filters: [{ name: "GGML model", extensions: ["bin"] }],
        }}
        onChange={(v) => form.setTranscriptionField("vadModelPath", v)}
        onValidate={() => form.revalidatePath("transcription.vadModelPath", "file")}
        helpText="Recommended: ggml-silero-v6.2.0.bin from huggingface.co/ggml-org/whisper-vad. Whisper then skips pauses, where it otherwise invents text and falls into repetition loops. Needs whisper.cpp 1.7.6+."
      />
      <label className="transcription-vocabulary">
        <span className="transcription-vocabulary-label">Vocabulary</span>
        <textarea
          value={t.vocabulary}
          spellCheck={false}
          placeholder="ThoughtCast, Claude, Tauri, FFmpeg, Crusader Kings"
          onChange={(e) => form.setTranscriptionField("vocabulary", e.target.value)}
        />
        <span className="transcription-help">
          Names and terms you say often, separated by commas. Whisper uses them
          as a hint so it spells them right. Keep it to a few dozen terms.
        </span>
      </label>
      <label className="transcription-toggle">
        <input
          type="checkbox"
          checked={t.repairRepetitions}
          onChange={(e) =>
            form.setTranscriptionField("repairRepetitions", e.target.checked)
          }
        />
        <span>
          Repair repetition loops: when Whisper repeats a phrase over and over,
          re-transcribe that part and remove leftover repeats.
        </span>
      </label>
    </>
  );
}

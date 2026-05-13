import SettingsSection from "./SettingsSection";
import PathPickerField from "../PathPickerField";
import type { useSettingsForm } from "../useSettingsForm";

type FormHandle = ReturnType<typeof useSettingsForm>;

interface TranscriptionSettingsSectionProps {
  form: FormHandle;
}

export default function TranscriptionSettingsSection({
  form,
}: TranscriptionSettingsSectionProps) {
  return (
    <SettingsSection
      title="Transcription"
      description="Whisper.cpp binary and model file used to transcribe each recording."
    >
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
        helpText="A downloaded .bin model file, e.g. ggml-large-v3-turbo.bin."
      />
    </SettingsSection>
  );
}

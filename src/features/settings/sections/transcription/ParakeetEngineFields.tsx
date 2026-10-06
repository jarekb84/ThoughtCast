import PathPickerField from "../../PathPickerField";
import type { useSettingsForm } from "../../useSettingsForm";

type FormHandle = ReturnType<typeof useSettingsForm>;

/** Parakeet's binary and model, both from whisper.cpp 1.9+. */
export default function ParakeetEngineFields({ form }: { form: FormHandle }) {
  const t = form.draft.transcription;

  return (
    <>
      <PathPickerField
        label="Parakeet CLI"
        value={t.parakeetPath}
        kind="executable"
        validation={form.pathValidations["transcription.parakeetPath"]}
        pickerOptions={{
          title: "Locate the parakeet-cli binary",
          filters: [{ name: "Executable", extensions: ["exe", ""] }],
        }}
        onChange={(v) => form.setTranscriptionField("parakeetPath", v)}
        onValidate={() => form.revalidatePath("transcription.parakeetPath", "executable")}
        helpText="parakeet-cli (parakeet-cli.exe on Windows), built next to whisper-cli in whisper.cpp 1.9+."
      />
      <PathPickerField
        label="Parakeet model"
        value={t.parakeetModelPath}
        kind="file"
        validation={form.pathValidations["transcription.parakeetModelPath"]}
        pickerOptions={{
          title: "Locate a Parakeet model file",
          filters: [{ name: "GGML model", extensions: ["bin"] }],
        }}
        onChange={(v) => form.setTranscriptionField("parakeetModelPath", v)}
        onValidate={() => form.revalidatePath("transcription.parakeetModelPath", "file")}
        helpText="e.g. ggml-parakeet-tdt-0.6b-v3-f16.bin from huggingface.co/ggml-org/parakeet-GGUF."
      />
    </>
  );
}

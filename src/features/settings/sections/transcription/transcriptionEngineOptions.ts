import type { TranscriptionEngine } from "../../appConfig";

export interface TranscriptionEngineOption {
  value: TranscriptionEngine;
  label: string;
  description: string;
}

/** Engine choices shown in Settings → Transcription, best default first. */
export const TRANSCRIPTION_ENGINE_OPTIONS: readonly TranscriptionEngineOption[] = [
  {
    value: "whisper",
    label: "Whisper",
    description:
      "whisper.cpp with large-v3-turbo. Most accurate on names and technical terms, and it can use your vocabulary list.",
  },
  {
    value: "parakeet",
    label: "Parakeet",
    description:
      "NVIDIA Parakeet TDT v3 through whisper.cpp 1.9+. Can't fall into repetition loops and transcribes more verbatim, but misspells names and takes no vocabulary.",
  },
];

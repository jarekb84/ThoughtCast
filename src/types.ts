export interface Session {
  id: string;
  preview: string;
  timestamp: string;
  audio_path: string;
  duration: number;
  transcript_path?: string;
  clipboard_copied?: boolean;
}

export interface SessionIndex {
  sessions: Session[];
}

export interface WhisperConfig {
  whisperPath: string;
  modelPath: string;
  voiceNotesDir?: string;
}

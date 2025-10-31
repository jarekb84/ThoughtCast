export interface Session {
  id: string;
  preview: string;
  timestamp: string;
  audio_path: string;
  duration: number;
}

export interface SessionIndex {
  sessions: Session[];
}

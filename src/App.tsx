import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import SessionList from "./components/SessionList";
import MainPanel from "./components/MainPanel";
import { Session, SessionIndex } from "./types";
import "./App.css";

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [status, setStatus] = useState("Ready to record");

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Timer for recording duration
  useEffect(() => {
    let interval: number | undefined;

    if (isRecording) {
      interval = window.setInterval(async () => {
        try {
          const duration = await invoke<number>("get_recording_duration");
          setRecordingDuration(duration);
        } catch (error) {
          console.error("Failed to get recording duration:", error);
        }
      }, 100);
    } else {
      setRecordingDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const loadSessions = async () => {
    try {
      const result = await invoke<SessionIndex>("get_sessions");
      setSessions(result.sessions);
      if (result.sessions.length > 0 && !selectedId) {
        setSelectedId(result.sessions[0].id);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setStatus(`Error: ${error}`);
    }
  };

  const handleStartRecording = async () => {
    try {
      await invoke("start_recording");
      setIsRecording(true);
      setStatus("⏺️ Recording...");
    } catch (error) {
      console.error("Failed to start recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  };

  const handleStopRecording = async () => {
    try {
      setStatus("🔄 Saving and transcribing audio...");
      const newSession = await invoke<Session>("stop_recording");
      setIsRecording(false);

      // Check transcription and clipboard status
      if (newSession.transcript_path && newSession.transcript_path.length > 0) {
        if (newSession.clipboard_copied) {
          setStatus("✅ Transcript copied to clipboard!");
        } else {
          setStatus("⚠️ Transcription complete (clipboard copy failed - use Copy button)");
        }
      } else {
        setStatus("⚠️ Recording saved (transcription failed - check Whisper setup)");
      }

      // Reload sessions to include the new one
      await loadSessions();

      // Select the new session
      setSelectedId(newSession.id);

      // Reset status after 5 seconds
      setTimeout(() => setStatus("Ready to record"), 5000);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setStatus(`❌ Error: ${error}`);
      setIsRecording(false);
    }
  };

  const selectedSession: Session | null =
    sessions.find((s) => s.id === selectedId) || null;

  return (
    <div className="app">
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelectSession={setSelectedId}
      />
      <MainPanel
        selectedSession={selectedSession}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        status={status}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />
    </div>
  );
}

export default App;

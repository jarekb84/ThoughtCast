import { useState, useEffect, useCallback } from 'react';
import { Session, useApi } from '../api';

/**
 * Determines appropriate status message based on recording result
 */
export function determineRecordingStatus(session: Session): string {
  if (session.transcript_path && session.transcript_path.length > 0) {
    if (session.clipboard_copied) {
      return "✅ Transcript copied to clipboard!";
    }
    return "⚠️ Transcription complete (clipboard copy failed - use Copy button)";
  }
  return "⚠️ Recording saved (transcription failed - check Whisper setup)";
}

/**
 * Finds session by ID or returns null
 */
export function findSessionById(sessions: Session[], id: string | null): Session | null {
  if (!id) return null;
  return sessions.find(s => s.id === id) || null;
}

/**
 * Selects the first session if none selected and sessions available
 */
export function autoSelectFirstSession(
  sessions: Session[],
  currentSelectedId: string | null
): string | null {
  if (sessions.length > 0 && !currentSelectedId) {
    return sessions[0].id;
  }
  return currentSelectedId;
}

interface RecordingWorkflowState {
  sessions: Session[];
  selectedId: string | null;
  isRecording: boolean;
  isProcessing: boolean;
  recordingDuration: number;
  status: string;
  selectedSession: Session | null;
}

interface RecordingWorkflowActions {
  handleStartRecording: () => Promise<void>;
  handleStopRecording: () => Promise<void>;
  setSelectedId: (id: string | null) => void;
  loadSessions: () => Promise<void>;
}

/**
 * Custom hook managing the complete recording workflow
 *
 * Orchestrates:
 * - Session loading and selection
 * - Recording lifecycle (start/stop)
 * - Duration tracking
 * - Status message management
 */
export function useRecordingWorkflow(): RecordingWorkflowState & RecordingWorkflowActions {
  const { sessionService, recordingService } = useApi();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [status, setStatus] = useState("Ready to record");

  const loadSessions = useCallback(async () => {
    try {
      const result = await sessionService.getSessions();
      setSessions(result.sessions);

      // Auto-select first session if none selected
      const newSelectedId = autoSelectFirstSession(result.sessions, selectedId);
      if (newSelectedId !== selectedId) {
        setSelectedId(newSelectedId);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setStatus(`Error: ${error}`);
    }
  }, [sessionService, selectedId]);

  const handleStartRecording = useCallback(async () => {
    try {
      await recordingService.startRecording();
      setIsRecording(true);
      setStatus("⏺️ Recording...");
    } catch (error) {
      console.error("Failed to start recording:", error);
      setStatus(`❌ Error: ${error}`);
    }
  }, [recordingService]);

  const handleStopRecording = useCallback(async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);
      setStatus("🔄 Saving and transcribing audio...");

      const newSession = await recordingService.stopRecording();

      // Determine and set appropriate status
      const resultStatus = determineRecordingStatus(newSession);
      setStatus(resultStatus);

      // Reload sessions and select the new one
      await loadSessions();
      setSelectedId(newSession.id);

      // Reset status after delay
      setTimeout(() => setStatus("Ready to record"), 5000);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setStatus(`❌ Error: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }, [recordingService, loadSessions]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer for recording duration
  useEffect(() => {
    let interval: number | undefined;

    if (isRecording) {
      interval = window.setInterval(async () => {
        try {
          const duration = await recordingService.getRecordingDuration();
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
  }, [isRecording, recordingService]);

  const selectedSession = findSessionById(sessions, selectedId);

  return {
    sessions,
    selectedId,
    isRecording,
    isProcessing,
    recordingDuration,
    status,
    selectedSession,
    handleStartRecording,
    handleStopRecording,
    setSelectedId,
    loadSessions,
  };
}

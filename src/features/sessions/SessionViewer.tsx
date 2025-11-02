import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Session } from "./types";
import { formatTimestamp } from "../../shared/formatters/date-time";
import { formatDuration } from "../../shared/formatters/duration";
import { formatFilePath } from "../../shared/formatters/file-path";
import RecordingControls from "../recording/RecordingControls";
import "./SessionViewer.css";

interface SessionViewerProps {
  selectedSession: Session | null;
  isRecording: boolean;
  isProcessing: boolean;
  recordingDuration: number;
  status: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSessionsChanged: () => Promise<void>;
}

export default function SessionViewer({
  selectedSession,
  isRecording,
  isProcessing,
  recordingDuration,
  status,
  onStartRecording,
  onStopRecording,
  onSessionsChanged,
}: SessionViewerProps) {
  const [copyButtonText, setCopyButtonText] = useState("Copy to Clipboard");
  const [isCopying, setIsCopying] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);

  // Load transcript when selected session changes
  useEffect(() => {
    const loadTranscript = async () => {
      if (!selectedSession) {
        setTranscript(null);
        setTranscriptError(null);
        return;
      }

      // Skip if no transcript path
      if (!selectedSession.transcript_path) {
        setTranscript(null);
        setTranscriptError("No transcript available");
        return;
      }

      setIsLoadingTranscript(true);
      setTranscriptError(null);

      try {
        const text = await invoke<string>("load_transcript", {
          sessionId: selectedSession.id,
        });
        setTranscript(text);
      } catch (error) {
        console.error("Failed to load transcript:", error);
        setTranscriptError(
          error instanceof Error ? error.message : String(error)
        );
        setTranscript(null);
      } finally {
        setIsLoadingTranscript(false);
      }
    };

    loadTranscript();
  }, [selectedSession?.id]);

  const handleCopyToClipboard = async () => {
    if (!selectedSession) return;

    setIsCopying(true);
    try {
      await invoke("copy_transcript_to_clipboard", {
        sessionId: selectedSession.id,
      });
      setCopyButtonText("Copied!");
      setTimeout(() => setCopyButtonText("Copy to Clipboard"), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      alert(`Failed to copy: ${error}`);
    } finally {
      setIsCopying(false);
    }
  };

  const handleRetranscribe = async () => {
    if (!selectedSession) return;

    setIsRetranscribing(true);
    setIsLoadingTranscript(true);
    setTranscriptError(null);

    try {
      const newTranscript = await invoke<string>("retranscribe_session", {
        sessionId: selectedSession.id,
      });
      setTranscript(newTranscript);

      // Refresh the session list to get updated preview and transcript_path
      await onSessionsChanged();
    } catch (error) {
      console.error("Failed to retranscribe:", error);
      setTranscriptError(
        `Retranscription failed: ${error instanceof Error ? error.message : String(error)}`
      );
      setTranscript(null);
    } finally {
      setIsRetranscribing(false);
      setIsLoadingTranscript(false);
    }
  };

  return (
    <div className="session-viewer">
      <div className="session-viewer-header">
        <h1>ThoughtCast</h1>
        <RecordingControls
          isRecording={isRecording}
          isProcessing={isProcessing}
          recordingDuration={recordingDuration}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
        />
      </div>

      <div className="session-details">
        {selectedSession ? (
          <>
            <h2>Session Details</h2>
            <div className="session-info">
              <div className="info-item">
                <strong>Recorded:</strong>{" "}
                {formatTimestamp(selectedSession.timestamp)}
              </div>
              <div className="info-item">
                <strong>Duration:</strong>{" "}
                {formatDuration(selectedSession.duration)}
              </div>
              <div className="info-item">
                <strong>Audio:</strong>{" "}
                {formatFilePath(selectedSession.audio_path)}
              </div>
              {selectedSession.transcript_path && (
                <div className="info-item">
                  <strong>Transcript:</strong>{" "}
                  {formatFilePath(selectedSession.transcript_path)}
                </div>
              )}
            </div>

            <div className="transcript-actions">
              {transcript && transcript.length > 0 && (
                <button
                  className="copy-button"
                  onClick={handleCopyToClipboard}
                  disabled={isCopying}
                >
                  {copyButtonText}
                </button>
              )}
              <button
                className="retranscribe-button"
                onClick={handleRetranscribe}
                disabled={isRetranscribing}
              >
                {isRetranscribing ? "Re-transcribing..." : "Re-transcribe"}
              </button>
            </div>

            <div className="transcript-section">
              <h3>Transcript</h3>
              {isLoadingTranscript ? (
                <div className="transcript-text no-transcript">
                  Loading transcript...
                </div>
              ) : transcriptError ? (
                <div className="transcript-text no-transcript">
                  {transcriptError}
                </div>
              ) : transcript && transcript.length > 0 ? (
                <div className="transcript-text">{transcript}</div>
              ) : (
                <div className="transcript-text no-transcript">
                  {selectedSession.preview || "No transcript available"}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="no-selection">
            <p>
              Click Record to start capturing audio, or select a session from
              the sidebar
            </p>
          </div>
        )}
      </div>

      <div className="status-bar">
        <span className="status-text">Status: {status}</span>
      </div>
    </div>
  );
}

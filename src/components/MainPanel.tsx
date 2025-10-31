import { Session } from "../types";
import "./MainPanel.css";

interface MainPanelProps {
  selectedSession: Session | null;
  isRecording: boolean;
  recordingDuration: number;
  status: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}

export default function MainPanel({
  selectedSession,
  isRecording,
  recordingDuration,
  status,
  onStartRecording,
  onStopRecording,
}: MainPanelProps) {
  return (
    <div className="main-panel">
      <div className="main-panel-header">
        <h1>ThoughtCast</h1>
      </div>

      <div className="controls-section">
        {isRecording ? (
          <>
            <button
              className="record-button recording"
              onClick={onStopRecording}
            >
              ■ Stop
            </button>
            <div className="recording-timer">{formatDuration(recordingDuration)}</div>
          </>
        ) : (
          <button className="record-button" onClick={onStartRecording}>
            ● Record
          </button>
        )}
        <div className="status-text">Status: {status}</div>
      </div>

      <div className="session-details">
        {selectedSession ? (
          <>
            <h2>Session Details</h2>
            <div className="session-info">
              <div className="info-item">
                <strong>ID:</strong> {selectedSession.id}
              </div>
              <div className="info-item">
                <strong>Time:</strong> {formatTimestamp(selectedSession.timestamp)}
              </div>
              <div className="info-item">
                <strong>Duration:</strong> {formatDuration(selectedSession.duration)}
              </div>
              <div className="info-item">
                <strong>Audio:</strong> {selectedSession.audio_path}
              </div>
            </div>
            <div className="transcript-section">
              <h3>Transcript</h3>
              {selectedSession.transcript && selectedSession.transcript.length > 0 ? (
                <div className="transcript-text">{selectedSession.transcript}</div>
              ) : (
                <div className="transcript-text no-transcript">
                  {selectedSession.preview || "No transcript available"}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="no-selection">
            <p>Click Record to start capturing audio, or select a session from the sidebar</p>
          </div>
        )}
      </div>
    </div>
  );
}

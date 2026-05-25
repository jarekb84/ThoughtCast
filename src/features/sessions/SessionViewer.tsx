import { Session, RecordingStatus } from '../../api';
import { formatTimestamp } from '../../shared/formatters/date-time';
import { formatDuration } from '../../shared/formatters/duration';
import { formatFilePath } from '../../shared/formatters/file-path';
import RecordingControls from '../recording/RecordingControls';
import { Button, Card, InfoRow } from '../../shared/components';
import { useTranscriptViewer } from './useTranscriptViewer';
import './SessionViewer.css';

/**
 * Pick the duration to feed into the transcribing progress UI.
 *
 * During processing, the existing transcription-estimate widget keys off the
 * full audio duration of the just-stopped session (so it can extrapolate "how
 * much of the recording have we transcribed so far"). While recording, the
 * live timer is the right input. This was previously an inline ternary at the
 * `RecordingControls` call site — extracted so the `.tsx` stays presentation-
 * only per the React separation doctrine.
 */
function deriveAudioDurationForControls(
  isProcessing: boolean,
  selectedSession: Session | null,
  recordingDuration: number,
): number {
  if (isProcessing && selectedSession) {
    return selectedSession.duration;
  }
  return recordingDuration;
}

/**
 * Determines the CSS class for status messages based on content
 */
function getStatusClass(status: string): string {
  if (status.includes("✅") || status.includes("copied")) {
    return "status-success";
  }
  if (status.includes("❌") || status.includes("Error")) {
    return "status-error";
  }
  if (status.includes("⚠️") || status.includes("failed")) {
    return "status-warning";
  }
  if (status.includes("🔄") || status.includes("Processing") || status.includes("transcription")) {
    return "status-processing";
  }
  if (status.includes("⏺️") || status.includes("Recording")) {
    return "status-recording";
  }
  if (status.includes("⏸️") || status.includes("paused")) {
    return "status-paused";
  }
  return "status-default";
}

interface SessionViewerProps {
  selectedSession: Session | null;
  recordingStatus: RecordingStatus;
  isProcessing: boolean;
  recordingDuration: number;
  flushedThroughSeconds: number | null;
  status: string;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onCancelRecording: () => void;
  onStopRecording: () => void;
  onRetranscribe: (sessionId: string) => Promise<void>;
  onSessionsChanged: () => Promise<void>;
}

export default function SessionViewer({
  selectedSession,
  recordingStatus,
  isProcessing,
  recordingDuration,
  flushedThroughSeconds,
  status,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onCancelRecording,
  onStopRecording,
  onRetranscribe,
  onSessionsChanged,
}: SessionViewerProps) {
  const {
    transcript,
    transcriptError,
    isLoadingTranscript,
    isCopying,
    copyButtonText,
    handleCopyToClipboard,
  } = useTranscriptViewer(selectedSession, onSessionsChanged);

  const handleRetranscribeClick = () => {
    if (selectedSession) {
      void onRetranscribe(selectedSession.id);
    }
  };

  return (
    <div className="session-viewer">
      <div className="session-viewer-header">
        <h1>ThoughtCast</h1>
        <RecordingControls
          recordingStatus={recordingStatus}
          isProcessing={isProcessing}
          recordingDuration={recordingDuration}
          flushedThroughSeconds={flushedThroughSeconds}
          audioDurationSeconds={deriveAudioDurationForControls(
            isProcessing,
            selectedSession,
            recordingDuration,
          )}
          onStartRecording={onStartRecording}
          onPauseRecording={onPauseRecording}
          onResumeRecording={onResumeRecording}
          onCancelRecording={onCancelRecording}
          onStopRecording={onStopRecording}
        />
      </div>

      <div className="session-details">
        {selectedSession ? (
          <>
            <h2>Session Details</h2>
            <Card variant="subtle" padding="md">
              <InfoRow
                label="Recorded"
                value={formatTimestamp(selectedSession.timestamp)}
              />
              <InfoRow
                label="Duration"
                value={formatDuration(selectedSession.duration)}
              />
              <InfoRow
                label="Audio"
                value={formatFilePath(selectedSession.audio_path)}
              />
              {selectedSession.transcript_path && (
                <InfoRow
                  label="Transcript"
                  value={formatFilePath(selectedSession.transcript_path)}
                />
              )}
            </Card>

            <div className="transcript-actions">
              {transcript && transcript.length > 0 && (
                <Button
                  variant="primary"
                  onClick={handleCopyToClipboard}
                  disabled={isCopying}
                >
                  {copyButtonText}
                </Button>
              )}
              <Button
                variant="success"
                onClick={handleRetranscribeClick}
                disabled={isProcessing || !selectedSession}
              >
                Re-transcribe
              </Button>
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
        <span className={`status-text ${getStatusClass(status)}`}>
          Status: {status}
        </span>
      </div>
    </div>
  );
}

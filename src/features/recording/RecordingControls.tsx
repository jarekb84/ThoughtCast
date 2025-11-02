import { formatDuration } from "../../shared/formatters/duration";
import "./RecordingControls.css";

interface RecordingControlsProps {
  isRecording: boolean;
  isProcessing: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

/**
 * Recording controls component
 *
 * Provides UI for starting/stopping audio recordings with visual feedback
 * for recording, processing, and idle states
 */
export default function RecordingControls({
  isRecording,
  isProcessing,
  recordingDuration,
  onStartRecording,
  onStopRecording,
}: RecordingControlsProps) {
  return (
    <div className="recording-controls">
      {isRecording ? (
        <>
          <div className="recording-timer">{formatDuration(recordingDuration)}</div>
          <button
            className="record-button recording"
            onClick={onStopRecording}
          >
            ■ Stop
          </button>
        </>
      ) : isProcessing ? (
        <button
          className="record-button processing"
          disabled
        >
          ⏳ Processing...
        </button>
      ) : (
        <button className="record-button" onClick={onStartRecording}>
          ● Record
        </button>
      )}
    </div>
  );
}

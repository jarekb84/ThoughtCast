import { formatDuration } from "../../shared/formatters/duration";
import { Button } from "../../shared/components";
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
          <Button
            variant="danger"
            onClick={onStopRecording}
            className="btn-pulse"
          >
            ■ Stop
          </Button>
        </>
      ) : isProcessing ? (
        <Button
          variant="warning"
          disabled
          className="btn-pulse"
        >
          ⏳ Processing...
        </Button>
      ) : (
        <Button variant="primary" onClick={onStartRecording}>
          ● Record
        </Button>
      )}
    </div>
  );
}

import { formatDuration } from '../../shared/formatters/duration';
import { RecordingStatus } from '../../api';
import { Button, ProgressBar } from '../../shared/components';
import { isPausedStatus, isIdleStatus } from './recordingStatusChecks';
import AudioLevelIndicator from './AudioLevelIndicator';
import { useAudioLevels } from './useAudioLevels';
import { useTranscriptionProgress } from '../transcription/useTranscriptionProgress';
import { formatHumanReadableDuration } from '../transcription/formatHumanReadableDuration';
import { prepareProgressDisplay } from '../transcription/prepareProgressDisplay';
import './RecordingControls.css';

interface RecordingControlsProps {
  recordingStatus: RecordingStatus;
  isProcessing: boolean;
  recordingDuration: number;
  audioDurationSeconds: number;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onCancelRecording: () => void;
  onStopRecording: () => void;
}

/**
 * Recording controls component
 *
 * Provides UI for managing audio recordings with pause/resume/cancel functionality.
 * Displays appropriate controls based on current recording state.
 */
export default function RecordingControls({
  recordingStatus,
  isProcessing,
  recordingDuration,
  audioDurationSeconds,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onCancelRecording,
  onStopRecording,
}: RecordingControlsProps) {
  const audioLevels = useAudioLevels(recordingStatus);
  const progress = useTranscriptionProgress(isProcessing, audioDurationSeconds);
  const displayData = prepareProgressDisplay(progress, formatHumanReadableDuration);

  if (isProcessing) {
    return (
      <div className="recording-controls">
        {displayData.shouldDisplay && (
          <div className="transcription-estimate">
            <div className="estimate-text">Estimated: {displayData.estimatedText}</div>
            {displayData.remainingText && (
              <div className="estimate-remaining">{displayData.remainingText}</div>
            )}
            <ProgressBar percent={displayData.progressPercent} height={4} />
          </div>
        )}
        <Button variant="warning" disabled className="btn-pulse">
          <span className="spinner-icon">⟳</span>
          Transcribing...
        </Button>
      </div>
    );
  }

  if (isIdleStatus(recordingStatus)) {
    return (
      <div className="recording-controls">
        <Button variant="primary" onClick={onStartRecording}>
          ● Record
        </Button>
      </div>
    );
  }

  // Recording or Paused state - show all controls
  const isPaused = isPausedStatus(recordingStatus);

  return (
    <div className="recording-controls">
      {!isPaused && audioLevels.length > 0 && (
        <AudioLevelIndicator levels={audioLevels} />
      )}

      <div className={`recording-timer ${isPaused ? 'paused' : ''}`}>
        {formatDuration(recordingDuration)}
        {isPaused && <span className="pause-indicator"> PAUSED</span>}
      </div>

      <div className="recording-buttons">
        {isPaused ? (
          <Button variant="success" onClick={onResumeRecording}>
            ▶ Resume
          </Button>
        ) : (
          <Button variant="neutral" onClick={onPauseRecording}>
            ⏸ Pause
          </Button>
        )}

        <Button variant="secondary" onClick={onCancelRecording}>
          ✕ Cancel
        </Button>

        <Button variant="danger" onClick={onStopRecording} className="btn-pulse">
          ■ Stop
        </Button>
      </div>
    </div>
  );
}

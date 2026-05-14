import SessionList from "../features/sessions/SessionList";
import SessionViewer from "../features/sessions/SessionViewer";
import SettingsPanel from "../features/settings/SettingsPanel";
import { useSettingsPanel } from "../features/settings/useSettingsPanel";
import { useSettingsForm } from "../features/settings/useSettingsForm";
import { useCompressionBatch } from "../features/compression/useCompressionBatch";
import CompressionProgressDialog from "../features/compression/CompressionProgressDialog";
import CompressionCompletionToast from "../features/compression/CompressionCompletionToast";
import CompressionStorageSummary from "../features/compression/CompressionStorageSummary";
import { useGlobalRecordingShortcut } from "../features/keyboard-shortcuts/useGlobalRecordingShortcut";
import { useGlobalCancelShortcut } from "../features/keyboard-shortcuts/useGlobalCancelShortcut";
import { useRecordingWorkflow } from "./useRecordingWorkflow";
import { useAppVersion } from "./useAppVersion";
import { useState } from "react";
import "./App.css";

function App() {
  useAppVersion();

  const settingsPanel = useSettingsPanel();
  const settingsForm = useSettingsForm();
  const compressionBatch = useCompressionBatch();
  const [progressDialogHidden, setProgressDialogHidden] = useState(false);

  const {
    sessions,
    selectedId,
    recordingStatus,
    recordingStatusRef,
    isProcessing,
    recordingDuration,
    status,
    selectedSession,
    handleStartRecording,
    handlePauseRecording,
    handleResumeRecording,
    handleCancelRecording,
    handleStopRecording,
    setSelectedId,
    loadSessions,
  } = useRecordingWorkflow();

  // Read the *baseline* (last-saved) shortcut config so unsaved edits in the
  // panel don't go live before the user clicks Save.
  const savedShortcuts = settingsForm.baseline.keyboardShortcuts;

  useGlobalRecordingShortcut({
    accelerator: savedShortcuts.recordShortcut,
    triggerMode: savedShortcuts.triggerMode,
    recordingStatusRef,
    // Disable shortcut handling while the Settings panel is open so the user
    // can press their record key during rebind without dispatching a recording.
    enabled: !settingsPanel.isOpen,
    onStart: handleStartRecording,
    onStop: handleStopRecording,
  });

  useGlobalCancelShortcut({
    accelerator: savedShortcuts.cancelShortcut,
    recordingStatus,
    // Stand down while the Settings panel is open so the panel's own Escape
    // handler (close / discard prompt) keeps working without canceling a
    // concurrent recording.
    enabled: !settingsPanel.isOpen,
    onCancel: handleCancelRecording,
  });

  const handleCompressNow = async () => {
    // Manual button always compresses every uncompressed WAV. The configured
    // age threshold only governs the automatic startup sweep — see
    // `start_batch_compression` in the Rust side.
    setProgressDialogHidden(false);
    await compressionBatch.start({ ignoreThreshold: true });
  };

  return (
    <div className="app">
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelectSession={setSelectedId}
      />
      <SessionViewer
        selectedSession={selectedSession}
        recordingStatus={recordingStatus}
        isProcessing={isProcessing}
        recordingDuration={recordingDuration}
        status={status}
        onStartRecording={handleStartRecording}
        onPauseRecording={handlePauseRecording}
        onResumeRecording={handleResumeRecording}
        onCancelRecording={handleCancelRecording}
        onStopRecording={handleStopRecording}
        onSessionsChanged={loadSessions}
      />
      <SettingsPanel
        isOpen={settingsPanel.isOpen}
        onClose={() => {
          settingsPanel.close();
          void compressionBatch.refreshStorage();
        }}
        form={settingsForm}
        recordingStatus={recordingStatus}
        renderCompressionExtras={(form) => ({
          onCompressNow: form.draft.ffmpegPath ? handleCompressNow : undefined,
          compressNowDisabledReason: compressionBatch.getCompressNowDisabledReason(
            Boolean(form.draft.ffmpegPath)
          ),
          storageSummary: (
            <CompressionStorageSummary stats={compressionBatch.storage} />
          ),
        })}
      />
      {/*
        Gate on `total > 0`, not just `isRunning`: the backend flips to
        Running synchronously before the worker thread has decided whether
        anything is eligible. Without this gate, a startup auto-sweep (or a
        manual press with no eligible files) briefly flashes a "0 of 0"
        dialog. With it, the dialog only appears once the worker has actual
        work queued up.
      */}
      {compressionBatch.isRunning &&
        compressionBatch.progress.total > 0 &&
        !progressDialogHidden && (
          <CompressionProgressDialog
            progress={compressionBatch.progress}
            onRunInBackground={() => setProgressDialogHidden(true)}
            onCancel={compressionBatch.cancel}
          />
        )}
      {compressionBatch.lastCompletion && (
        <CompressionCompletionToast
          summary={compressionBatch.lastCompletion}
          onDismiss={() => {
            compressionBatch.dismissCompletion();
            void loadSessions();
          }}
        />
      )}
    </div>
  );
}

export default App;

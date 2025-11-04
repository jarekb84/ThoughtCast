import SessionList from "../features/sessions/SessionList";
import SessionViewer from "../features/sessions/SessionViewer";
import { useRecordingWorkflow } from "./useRecordingWorkflow";
import { useAppVersion } from "./useAppVersion";
import "./App.css";

function App() {
  // Set app version in window title
  useAppVersion();

  const {
    sessions,
    selectedId,
    recordingStatus,
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
    loadSessions
  } = useRecordingWorkflow();

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
    </div>
  );
}

export default App;

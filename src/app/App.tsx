import SessionList from "../features/sessions/SessionList";
import SessionViewer from "../features/sessions/SessionViewer";
import { useRecordingWorkflow } from "./useRecordingWorkflow";
import "./App.css";

function App() {
  const {
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
        isRecording={isRecording}
        isProcessing={isProcessing}
        recordingDuration={recordingDuration}
        status={status}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onSessionsChanged={loadSessions}
      />
    </div>
  );
}

export default App;

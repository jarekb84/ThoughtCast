import { Session } from "../types";
import "./MainPanel.css";

interface MainPanelProps {
  selectedSession: Session | null;
}

export default function MainPanel({ selectedSession }: MainPanelProps) {
  return (
    <div className="main-panel">
      <div className="main-panel-header">
        <h1>ThoughtCast</h1>
      </div>

      <div className="controls-section">
        <button className="record-button" disabled>
          ● Record
        </button>
        <div className="status-text">Status: Not implemented yet</div>
      </div>

      <div className="session-details">
        {selectedSession ? (
          <>
            <h2>Selected Session</h2>
            <div className="session-info">
              <div className="info-item">
                <strong>ID:</strong> {selectedSession.id}
              </div>
              <div className="info-item">
                <strong>Time:</strong> {selectedSession.timestamp}
              </div>
            </div>
            <div className="transcript-section">
              <h3>Transcript Preview</h3>
              <div className="transcript-text">{selectedSession.preview}</div>
              <div className="implementation-note">
                (Recording functionality coming in next phase)
              </div>
            </div>
          </>
        ) : (
          <div className="no-selection">
            <p>Select a session from the sidebar or start a new recording</p>
            <p className="implementation-note">
              Recording functionality will be implemented in the next phase
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

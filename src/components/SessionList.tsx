import { Session } from "../types";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
}

export default function SessionList({
  sessions,
  selectedId,
  onSelectSession,
}: SessionListProps) {
  return (
    <div className="session-list">
      <h2 className="session-list-header">Sessions</h2>
      <div className="session-items">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${
              selectedId === session.id ? "selected" : ""
            }`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="session-timestamp">{session.timestamp}</div>
            <div className="session-preview">{session.preview}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

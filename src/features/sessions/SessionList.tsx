import { Session } from "./types";
import { formatShortTimestamp } from "../../shared/formatters/date-time";
import { formatDuration } from "../../shared/formatters/duration";
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
      <h2>Sessions</h2>
      <div className="sessions">
        {sessions.length === 0 ? (
          <div className="no-sessions">No recordings yet</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${
                session.id === selectedId ? "selected" : ""
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="session-header">
                <span className="session-icon">🎙️</span>
                <span className="session-timestamp">
                  {formatShortTimestamp(session.timestamp)}
                </span>
                <span className="session-duration">
                  ({formatDuration(session.duration)})
                </span>
              </div>
              <div className="session-preview">
                {session.preview.substring(0, 50)}
                {session.preview.length > 50 && "..."}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

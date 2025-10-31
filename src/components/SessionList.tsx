import { Session } from "../types";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
}

function formatShortTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timestamp;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

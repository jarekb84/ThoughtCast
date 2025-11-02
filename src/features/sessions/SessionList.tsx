import { Session } from "./types";
import SessionListItem from "./SessionListItem";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
}

/**
 * SessionList Component
 *
 * Displays a scrollable list of recording sessions in the sidebar.
 * Uses SessionListItem for consistent presentation.
 */
export default function SessionList({
  sessions,
  selectedId,
  onSelectSession,
}: SessionListProps) {
  return (
    <div className="session-list">
      <h2 className="session-list-title">Sessions</h2>
      <div className="session-list-items">
        {sessions.length === 0 ? (
          <div className="session-list-empty">No recordings yet</div>
        ) : (
          sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              isSelected={session.id === selectedId}
              onSelect={() => onSelectSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

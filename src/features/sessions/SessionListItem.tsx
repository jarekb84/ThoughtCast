import { Session } from "./types";
import { formatShortTimestamp } from "../../shared/formatters/date-time";
import { formatDuration } from "../../shared/formatters/duration";
import "./SessionListItem.css";

interface SessionListItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * L2 SessionListItem Component
 *
 * Renders a single session in the list with subtle selection states
 * and hover effects that follow the design system guidelines.
 */
export default function SessionListItem({
  session,
  isSelected,
  onSelect,
}: SessionListItemProps) {
  return (
    <div
      className={`session-list-item ${isSelected ? "session-list-item-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="session-list-item-header">
        <span className="session-list-item-icon">🎙️</span>
        <span className="session-list-item-timestamp">
          {formatShortTimestamp(session.timestamp)}
        </span>
        <span className="session-list-item-duration">
          ({formatDuration(session.duration)})
        </span>
      </div>
      <div className="session-list-item-preview">
        {session.preview.substring(0, 50)}
        {session.preview.length > 50 && "..."}
      </div>
    </div>
  );
}

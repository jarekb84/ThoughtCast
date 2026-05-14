import { memo, useCallback } from "react";
import { Session } from "../../api";
import { formatShortTimestamp } from "../../shared/formatters/date-time";
import { formatDuration } from "../../shared/formatters/duration";
import { truncateText } from "../../shared/formatters/text";
import "./SessionListItem.css";

interface SessionListItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function SessionListItemImpl({ session, isSelected, onSelect }: SessionListItemProps) {
  const isProcessing = session.preview === "Processing...";

  const handleClick = useCallback(() => {
    onSelect(session.id);
  }, [onSelect, session.id]);

  return (
    <div
      className={`session-list-item ${isSelected ? "session-list-item-selected" : ""} ${isProcessing ? "session-list-item-processing" : ""}`}
      onClick={handleClick}
    >
      <div className="session-list-item-header">
        <span className="session-list-item-icon">
          {isProcessing ? <span className="processing-spinner">⟳</span> : "🎙️"}
        </span>
        <span className="session-list-item-timestamp">
          {formatShortTimestamp(session.timestamp)}
        </span>
        <span className="session-list-item-duration">
          ({formatDuration(session.duration)})
        </span>
      </div>
      <div className="session-list-item-preview">
        {truncateText(session.preview, 50)}
      </div>
    </div>
  );
}

const SessionListItem = memo(SessionListItemImpl);
export default SessionListItem;

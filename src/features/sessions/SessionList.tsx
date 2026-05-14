import { memo, useRef } from "react";
import { Session } from "../../api";
import SessionListItem from "./SessionListItem";
import { useVirtualizedList } from "./useVirtualizedList";
import "./SessionList.css";

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
}

// Matches the rendered height of `.session-list-item`: 8px margin top + 1px
// border + 12px padding top + ~22px header line + 8px header margin + ~18px
// preview line + 12px padding bottom + 1px border + 8px margin bottom. The
// overscan in useVirtualizedList absorbs minor drift.
const SESSION_ITEM_HEIGHT = 92;

function SessionListImpl({
  sessions,
  selectedId,
  onSelectSession,
}: SessionListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { startIndex, endIndex, offsetY, totalHeight } = useVirtualizedList(
    scrollContainerRef,
    sessions.length,
    SESSION_ITEM_HEIGHT
  );

  const visibleSessions = sessions.slice(startIndex, endIndex);

  return (
    <div className="session-list">
      <h2 className="session-list-title">Sessions</h2>
      <div className="session-list-items" ref={scrollContainerRef}>
        {sessions.length === 0 ? (
          <div className="session-list-empty">No recordings yet</div>
        ) : (
          <div
            className="session-list-virtual-spacer"
            style={{ height: totalHeight }}
          >
            <div
              className="session-list-virtual-window"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visibleSessions.map((session) => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  isSelected={session.id === selectedId}
                  onSelect={onSelectSession}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SessionList = memo(SessionListImpl);
export default SessionList;

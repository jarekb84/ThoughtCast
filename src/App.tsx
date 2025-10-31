import { useState } from "react";
import SessionList from "./components/SessionList";
import MainPanel from "./components/MainPanel";
import { mockSessions } from "./mockData";
import { Session } from "./types";
import "./App.css";

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(
    mockSessions[0]?.id || null
  );

  const selectedSession: Session | null =
    mockSessions.find((s) => s.id === selectedId) || null;

  return (
    <div className="app">
      <SessionList
        sessions={mockSessions}
        selectedId={selectedId}
        onSelectSession={setSelectedId}
      />
      <MainPanel selectedSession={selectedSession} />
    </div>
  );
}

export default App;

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import { agents } from "./data/agents";
import { rooms } from "./data/rooms";
import AgentTaskQueue from "./components/AgentTaskQueue";
import LoginScreen from "./components/LoginScreen";
import ChatPanel from "./components/ChatPanel";
import OfficeMap from "./components/OfficeMap";
import RoomSelector from "./components/RoomSelector";
import SettingsPanel from "./components/SettingsPanel";
import "./App.css";

const allowedEmails = [
  "gallerykuns@gmail.com",
  "sylove887@gmail.com"
  // "staff@example.com",
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState("director");
  const [activeRoomId, setActiveRoomId] = useState("general");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("chat");
  const [motionApi, setMotionApi] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const activeAgent = useMemo(() => {
    return agents.find((agent) => agent.id === activeAgentId) || agents[0];
  }, [activeAgentId]);

  const activeRoom = useMemo(() => {
    return rooms.find((room) => room.id === activeRoomId) || rooms[0];
  }, [activeRoomId]);

  if (!authReady) {
    return <div className="loading-screen">UNFRAME AI OFFICE 불러오는 중...</div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!allowedEmails.includes(user.email)) {
    return (
      <main className="login-screen">
        <div className="login-card">
          <p className="eyebrow">ACCESS LIMITED</p>
          <h1>승인되지 않은 계정입니다.</h1>
          <p>{user.email}</p>
          <button onClick={() => signOut(auth)}>다른 계정으로 로그인</button>
        </div>
      </main>
    );
  }

  return (
    <main className="office-shell">
      <header className="office-header">
        <div>
          <p className="eyebrow">UNFRAME AI OFFICE</p>
          <h1>AI Crew Room</h1>
        </div>

        <div className="user-box">
          <span>{user.email}</span>
          <button
            type="button"
            className="settings-trigger-button"
            onClick={() => setIsSettingsOpen(true)}
          >
            ⚙️ Settings
          </button>
          <button onClick={() => signOut(auth)}>나가기</button>
        </div>
      </header>

      <RoomSelector
        rooms={rooms}
        activeRoomId={activeRoomId}
        onChangeRoom={setActiveRoomId}
      />

      <section className="office-mode-layout">
        <section className="office-main-area">
          <OfficeMap
            agents={agents}
            activeAgentId={activeAgentId}
            onSelectAgent={setActiveAgentId}
            user={user}
            room={activeRoom}
            onMotionApiReady={setMotionApi}
          />
        </section>

        <aside className="office-side-panel">
          <div className="side-panel-tabs" role="tablist" aria-label="오른쪽 패널 탭">
            <button
              type="button"
              role="tab"
              aria-selected={activeSideTab === "chat"}
              className={activeSideTab === "chat" ? "active" : ""}
              onClick={() => setActiveSideTab("chat")}
            >
              채팅
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSideTab === "tasks"}
              className={activeSideTab === "tasks" ? "active" : ""}
              onClick={() => setActiveSideTab("tasks")}
            >
              업무 보드
            </button>
          </div>

          <div
            className={`side-panel-content ${activeSideTab === "tasks" ? "tasks" : "chat"}`}
          >
            {activeSideTab === "chat" ? (
              <ChatPanel
                key={`${activeRoomId}-${activeAgent.id}`}
                agent={activeAgent}
                user={user}
                roomId={activeRoomId}
                roomName={activeRoom.name}
              />
            ) : (
              <AgentTaskQueue
                room={activeRoom}
                user={user}
                agents={agents}
                triggerCollaboration={motionApi?.triggerCollaboration}
                onTaskRunStart={motionApi?.handleTaskRunStart}
                onTaskRunComplete={motionApi?.handleTaskRunEnd}
                onTaskRunError={motionApi?.handleTaskRunEnd}
              />
            )}
          </div>
        </aside>
      </section>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </main>
  );
}

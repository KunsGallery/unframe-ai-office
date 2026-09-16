import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import { agents } from "./data/agents";
import { rooms } from "./data/rooms";
import { subscribeTeamMessages, subscribeTeamTyping } from "./lib/teamChat";
import AgentTaskQueue from "./components/AgentTaskQueue";
import LoginScreen from "./components/LoginScreen";
import ChatPanel from "./components/ChatPanel";
import TeamChatPanel from "./components/TeamChatPanel";
import OfficeMap from "./components/OfficeMap";
import RoomSelector from "./components/RoomSelector";
import SettingsPanel from "./components/SettingsPanel";
import {
  stopPresence,
  subscribeOnlineUsers,
} from "./lib/presence";
import "./App.css";

const allowedEmails = [
  "gallerykuns@gmail.com",
  "sylove887@gmail.com"
  // "staff@example.com",
];

function playTeamNotification(audioContextRef) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    const storedVolume = Number(window.localStorage.getItem("unframe-notification-volume"));
    const volume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(storedVolume, 1)) : 0.8;
    gain.gain.exponentialRampToValueAtTime(0.1 * volume, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch {
    // Autoplay policies may block sound until a user gesture.
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState("director");
  const initialRoomId = new URLSearchParams(window.location.search).get("room");
  const [activeRoomId, setActiveRoomId] = useState(
    rooms.some((room) => room.id === initialRoomId) ? initialRoomId : "general",
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("team-chat");
  const [motionApi, setMotionApi] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [latestTeamMessage, setLatestTeamMessage] = useState(null);
  const [teamTypingUsers, setTeamTypingUsers] = useState([]);
  const [quietMode, setQuietMode] = useState(() => window.localStorage.getItem("unframe-quiet-mode") === "true");
  const knownTeamMessageIdsRef = useRef(new Set());
  const teamAudioContextRef = useRef(null);
  const sideTabs = ["team-chat", "chat", "tasks"];

  const handleSideTabKeyDown = (event, tabId) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    event.preventDefault();
    const currentIndex = sideTabs.indexOf(tabId);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? sideTabs.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + sideTabs.length) % sideTabs.length;
    const nextTab = sideTabs[nextIndex];
    setActiveSideTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`side-tab-${nextTab}`)?.focus());
  };

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

  const canUsePresence = Boolean(
    user?.email && allowedEmails.includes(user.email) && activeRoom,
  );
  const visibleOnlineUsers = canUsePresence ? onlineUsers : [];

  useEffect(() => {
    if (!canUsePresence) {
      return undefined;
    }

    return subscribeOnlineUsers({
      roomId: activeRoom.id,
      currentUserEmail: user.email,
      onChange: setOnlineUsers,
    });
  }, [activeRoom?.id, canUsePresence, user?.email]);

  useEffect(() => {
    if (!user?.email || !allowedEmails.includes(user.email)) return undefined;

    knownTeamMessageIdsRef.current = new Set();
    return subscribeTeamMessages({
      roomId: activeRoomId,
      onChange: (nextMessages) => {
        setLatestTeamMessage(nextMessages.at(-1) || null);
        const receivedNewMessage = nextMessages.some(
          (message) =>
            !knownTeamMessageIdsRef.current.has(message.id) &&
            message.senderEmail !== user.email,
        );
        if (!quietMode && activeSideTab !== "team-chat" && knownTeamMessageIdsRef.current.size && receivedNewMessage) {
          playTeamNotification(teamAudioContextRef);
        }
        knownTeamMessageIdsRef.current = new Set(nextMessages.map((message) => message.id));
      },
    });
  }, [activeRoomId, activeSideTab, quietMode, user?.email]);

  useEffect(() => {
    if (!user?.email || !allowedEmails.includes(user.email)) return undefined;
    return subscribeTeamTyping({
      roomId: activeRoomId,
      onChange: setTeamTypingUsers,
    });
  }, [activeRoomId, user?.email]);

  useEffect(() => {
    if (!user?.email || !allowedEmails.includes(user.email)) {
      return undefined;
    }

    const handleBeforeUnload = () => {
      void stopPresence({ user });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void stopPresence({ user });
    };
  }, [user]);

  const handleSignOut = async () => {
    try {
      await stopPresence({ user });
    } catch (error) {
      console.error("Failed to stop presence before sign out", error);
    }

    await signOut(auth);
  };

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
          <button onClick={handleSignOut}>다른 계정으로 로그인</button>
        </div>
      </main>
    );
  }

  if (new URLSearchParams(window.location.search).get("chat") === "popout") {
    return (
      <main className="chat-popout-shell">
        <TeamChatPanel
          user={user}
          roomId={activeRoomId}
          roomName={activeRoom.name}
          quietMode={quietMode}
          onQuietModeChange={(nextQuietMode) => {
            setQuietMode(nextQuietMode);
            window.localStorage.setItem("unframe-quiet-mode", String(nextQuietMode));
          }}
        />
      </main>
    );
  }

  return (
    <main
      className="office-shell"
      onPointerDown={() => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !teamAudioContextRef.current) {
          teamAudioContextRef.current = new AudioContext();
        }
      }}
    >
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
          <button onClick={handleSignOut}>나가기</button>
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
            key={activeRoomId}
            agents={agents}
            activeAgentId={activeAgentId}
            onSelectAgent={setActiveAgentId}
            user={user}
            room={activeRoom}
            onlineUsers={visibleOnlineUsers}
            latestTeamMessage={latestTeamMessage}
            teamTypingUsers={teamTypingUsers}
            quietMode={quietMode}
            onMotionApiReady={setMotionApi}
          />
        </section>

        <aside className="office-side-panel">
          <div className="side-panel-tabs" role="tablist" aria-label="오른쪽 패널 탭">
            <button
              type="button"
              role="tab"
              id="side-tab-team-chat"
              aria-controls="side-tab-panel"
              aria-selected={activeSideTab === "team-chat"}
              tabIndex={activeSideTab === "team-chat" ? 0 : -1}
              className={activeSideTab === "team-chat" ? "active" : ""}
              onClick={() => setActiveSideTab("team-chat")}
              onKeyDown={(event) => handleSideTabKeyDown(event, "team-chat")}
            >
              직원 채팅
            </button>
            <button
              type="button"
              role="tab"
              id="side-tab-chat"
              aria-controls="side-tab-panel"
              aria-selected={activeSideTab === "chat"}
              tabIndex={activeSideTab === "chat" ? 0 : -1}
              className={activeSideTab === "chat" ? "active" : ""}
              onClick={() => setActiveSideTab("chat")}
              onKeyDown={(event) => handleSideTabKeyDown(event, "chat")}
            >
              AI 채팅
            </button>
            <button
              type="button"
              role="tab"
              id="side-tab-tasks"
              aria-controls="side-tab-panel"
              aria-selected={activeSideTab === "tasks"}
              tabIndex={activeSideTab === "tasks" ? 0 : -1}
              className={activeSideTab === "tasks" ? "active" : ""}
              onClick={() => setActiveSideTab("tasks")}
              onKeyDown={(event) => handleSideTabKeyDown(event, "tasks")}
            >
              업무 보드
            </button>
          </div>

          <div
            id="side-tab-panel"
            role="tabpanel"
            aria-labelledby={`side-tab-${activeSideTab}`}
            className={`side-panel-content ${activeSideTab === "tasks" ? "tasks" : "chat"}`}
          >
            {activeSideTab === "team-chat" ? (
              <TeamChatPanel
                key={activeRoomId}
                user={user}
                roomId={activeRoomId}
                roomName={activeRoom.name}
                onLatestMessage={setLatestTeamMessage}
                onTypingUsersChange={setTeamTypingUsers}
                quietMode={quietMode}
                onQuietModeChange={(nextQuietMode) => {
                  setQuietMode(nextQuietMode);
                  window.localStorage.setItem("unframe-quiet-mode", String(nextQuietMode));
                }}
              />
            ) : activeSideTab === "chat" ? (
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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sendTeamMessage,
  setTeamTyping,
  subscribeTeamMessages,
  subscribeTeamTyping,
  toggleTeamReaction,
} from "../lib/teamChat";

function formatMessageTime(timestamp) {
  if (!timestamp?.toDate) return "방금";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp.toDate());
}

function getInitial(name) {
  return name?.trim().slice(0, 1).toUpperCase() || "?";
}

const REACTION_OPTIONS = ["👍", "❤️", "😂"];

function getTypingLabel(email) {
  return email === "sylove887@gmail.com" ? "소연님" : "대표님";
}

export default function TeamChatPanel({ user, roomId, roomName, onLatestMessage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState([]);
  const [subscriptionKey, setSubscriptionKey] = useState(0);
  const messagesRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isPinnedToBottomRef = useRef(true);
  const hasHydratedRef = useRef(false);
  const knownMessageIdsRef = useRef(new Set());
  const audioContextRef = useRef(null);
  const inputRef = useRef(null);

  const playNotificationSound = () => {
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
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch {
      // Browser autoplay policies may block sound until the user interacts.
    }
  };

  useEffect(() => {
    return subscribeTeamMessages({
      roomId,
      onChange: (nextMessages) => {
        setMessages(nextMessages);
        setIsLoading(false);
        onLatestMessage?.(nextMessages.at(-1) || null);

        const incomingNewMessage = nextMessages.some(
          (message) => !knownMessageIdsRef.current.has(message.id) && message.senderEmail !== user?.email,
        );
        if (hasHydratedRef.current && incomingNewMessage) {
          playNotificationSound();
        }
        knownMessageIdsRef.current = new Set(nextMessages.map((message) => message.id));
        hasHydratedRef.current = true;
      },
      onError: () => {
        setErrorMessage("직원 채팅을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        setIsLoading(false);
      },
    });
  }, [onLatestMessage, roomId, subscriptionKey, user?.email]);

  useEffect(() => {
    return subscribeTeamTyping({
      roomId,
      onChange: setTypingUsers,
    });
  }, [roomId, subscriptionKey]);

  useEffect(() => {
    const typing = Boolean(input.trim());
    void setTeamTyping({ roomId, user, typing });
    const timeoutId = typing
      ? window.setTimeout(() => {
          void setTeamTyping({ roomId, user, typing: false });
        }, 900)
      : null;

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [input, roomId, user]);

  useEffect(() => {
    if (!isPinnedToBottomRef.current) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages.length]);

  const currentUserEmail = user?.email || "";
  const onlineHint = useMemo(
    () => `${roomName}에 있는 팀원에게 바로 메시지를 남기세요.`,
    [roomName],
  );

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setErrorMessage("");

    try {
      await sendTeamMessage({ roomId, user, content });
      setInput("");
      await setTeamTyping({ roomId, user, typing: false });
    } catch (error) {
      console.error("Failed to send team chat message", error);
      setErrorMessage("메시지를 보내지 못했습니다. 네트워크 연결을 확인해주세요.");
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage("");
    setSubscriptionKey((key) => key + 1);
  };

  return (
    <section
      className="team-chat-panel"
      aria-label={`${roomName} 직원 채팅`}
      onPointerDown={() => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext && !audioContextRef.current) audioContextRef.current = new AudioContext();
      }}
    >
      <header className="team-chat-header">
        <div className="team-chat-title-row">
          <span className="live-indicator" aria-hidden="true" />
          <div>
            <h2>직원 채팅</h2>
            <p>{onlineHint}</p>
          </div>
        </div>
        <div className="team-chat-header-tools">
          <span className="team-chat-room">{roomName}</span>
          <button
            type="button"
            className="team-chat-popout"
            onClick={() => {
              const popup = window.open(
                `/?chat=popout&room=${encodeURIComponent(roomId)}`,
                "unframe-team-chat",
                "popup,width=440,height=760,resizable=yes,scrollbars=yes",
              );
              popup?.focus();
            }}
          >
            새 창
          </button>
        </div>
      </header>

      <div
        ref={messagesRef}
        className="team-chat-messages"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={isLoading}
        onScroll={() => {
          const container = messagesRef.current;
          if (!container) return;
          isPinnedToBottomRef.current =
            container.scrollHeight - container.scrollTop - container.clientHeight < 32;
        }}
      >
        {isLoading && <p className="team-chat-status">메시지를 불러오는 중...</p>}
        {!isLoading && messages.length === 0 && (
          <div className="team-chat-empty">
            <strong>아직 대화가 없습니다.</strong>
            <span>첫 메시지로 팀의 대화를 시작해보세요.</span>
          </div>
        )}
        {messages.map((message) => {
          const isMine = message.senderEmail === currentUserEmail;
          return (
            <article
              key={message.id}
              className={`team-message ${isMine ? "mine" : ""}`}
            >
              {!isMine && (
                <div className="team-message-avatar" aria-hidden="true">
                  {getInitial(message.senderName)}
                </div>
              )}
              <div className="team-message-content">
                {!isMine && (
                  <span className="team-message-author">
                    {message.senderName}
                    <small>{message.senderEmail}</small>
                  </span>
                )}
                <p>{message.content}</p>
                {!isMine && (
                  <div className="team-message-reactions" aria-label="메시지 리액션">
                    {REACTION_OPTIONS.map((emoji) => {
                      const reactionCount = Object.values(message.reactions || {}).filter(
                        (value) => value === emoji,
                      ).length;
                      const isActive = message.reactions?.[user?.email?.toLowerCase().replace(/[^a-z0-9]/g, "_")] === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={isActive ? "active" : ""}
                          aria-label={`${emoji} 리액션`}
                          onClick={() =>
                            void toggleTeamReaction({ roomId, messageId: message.id, user, emoji })
                          }
                        >
                          {emoji}{reactionCount > 0 && <span>{reactionCount}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <time>{formatMessageTime(message.createdAt)}</time>
              </div>
            </article>
          );
        })}
        <div ref={messagesEndRef} />
        {typingUsers
          .filter((typingUser) => typingUser.senderEmail !== currentUserEmail)
          .map((typingUser) => (
            <div className="team-typing-indicator" key={typingUser.senderEmail}>
              <span>{getTypingLabel(typingUser.senderEmail)}님이 입력 중</span>
              <i /><i /><i />
            </div>
          ))}
      </div>

      {errorMessage && (
        <div className="team-chat-error" role="alert">
          <span>{errorMessage}</span>
          {!isSending && <button type="button" onClick={handleRetry}>다시 연결</button>}
        </div>
      )}

      <div className="team-chat-input-row">
        <textarea
          ref={inputRef}
          aria-label="직원 채팅 메시지"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="팀원에게 메시지 보내기"
          rows={2}
          maxLength={2000}
          disabled={isSending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        <button type="button" onClick={() => void handleSend()} disabled={isSending || !input.trim()}>
          {isSending ? "전송 중" : "보내기"}
        </button>
      </div>
    </section>
  );
}

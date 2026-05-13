import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_MEMORY_SUMMARY_CHARS,
  MAX_RECENT_MESSAGES,
  MAX_SUMMARY_MESSAGES,
  MAX_USER_MESSAGE_CHARS,
  MODEL_PRESETS,
  OWNER_EMAILS,
  SUMMARY_TRIGGER_MESSAGE_COUNT,
  SUMMARY_UPDATE_INTERVAL,
} from "../config/costControls";
import {
  clearChatMemory,
  loadChatMemory,
  saveMessage,
  saveSummary,
} from "../lib/chatMemory";
import { buildAgentGreeting, getUserToneProfile } from "../data/userToneProfiles";
import { canSendMessage, incrementLocalUsage } from "../lib/usageLimit";

const DAILY_LIMIT_EXCEEDED_MESSAGE =
  "오늘의 AI 요청 한도를 초과했습니다. 중요한 작업은 대표 계정에서 다시 시도해주세요.";
const FALLBACK_ERROR_MESSAGE =
  "죄송합니다. 지금은 응답을 만들지 못했습니다. API 키나 서버 함수를 확인해주세요.";

function getGreetingMessage(agent, user) {
  return {
    role: "assistant",
    content: buildAgentGreeting(agent, user),
  };
}

function trimMessageContent(message) {
  const rawContent =
    typeof message?.content === "string" ? message.content.trim() : "";

  if (!rawContent) {
    return "";
  }

  const maxLength =
    message.role === "assistant"
      ? MAX_ASSISTANT_MESSAGE_CHARS
      : MAX_USER_MESSAGE_CHARS;

  return rawContent.slice(0, maxLength);
}

function getPayloadMessages(messages, maxMessages = MAX_RECENT_MESSAGES) {
  return messages
    .slice(-maxMessages)
    .map((message) => ({
      role: message.role,
      content: trimMessageContent(message),
    }))
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content,
    );
}

function shouldUpdateSummary(messageCount) {
  return (
    messageCount >= SUMMARY_TRIGGER_MESSAGE_COUNT &&
    (messageCount - SUMMARY_TRIGGER_MESSAGE_COUNT) % SUMMARY_UPDATE_INTERVAL === 0
  );
}

function formatEstimatedCost(cost) {
  if (typeof cost !== "number" || Number.isNaN(cost)) {
    return null;
  }

  if (cost < 0.01) {
    return cost.toFixed(4);
  }

  return cost.toFixed(3);
}

export default function ChatPanel({
  agent,
  user,
  roomId = "general",
  roomName = "General Office",
}) {
  const [messages, setMessages] = useState([getGreetingMessage(agent)]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [selectedMode, setSelectedMode] = useState("economy");
  const [lastUsage, setLastUsage] = useState(null);
  const [summary, setSummary] = useState("");
  const activeRequestRef = useRef(0);
  const userToneProfile = useMemo(() => getUserToneProfile(user), [user]);

  const isOwner = OWNER_EMAILS.includes(user?.email || "");
  const effectiveMode = isOwner ? selectedMode : "economy";
  const hasSummary = Boolean(summary.trim());
  const usageSummary = useMemo(() => {
    if (
      !lastUsage ||
      (lastUsage.inputTokens == null &&
        lastUsage.outputTokens == null &&
        lastUsage.estimatedCostUsd == null)
    ) {
      return null;
    }

    const estimatedCost = formatEstimatedCost(lastUsage.estimatedCostUsd);
    const costText = estimatedCost ? ` / 약 $${estimatedCost}` : "";

    return `이번 요청 사용량: input ${lastUsage.inputTokens ?? "-"} / output ${
      lastUsage.outputTokens ?? "-"
    }${costText}`;
  }, [lastUsage]);

  useEffect(() => {
    let isCancelled = false;
    const greetingMessage = getGreetingMessage(agent, user);
    activeRequestRef.current += 1;

    async function hydrateMessages() {
      setIsHydrating(true);
      setLastUsage(null);
      setSummary("");
      setMessages([greetingMessage]);

      try {
        const memory = await loadChatMemory({
          roomId,
          agentId: agent.id,
          userEmail: user?.email,
        });

        if (isCancelled) {
          return;
        }

        setSummary((memory.summary || "").slice(0, MAX_MEMORY_SUMMARY_CHARS));
        setMessages(memory.messages.length ? memory.messages : [greetingMessage]);
      } catch (error) {
        console.error("Failed to load chat memory", error);

        if (!isCancelled) {
          setMessages([greetingMessage]);
          setSummary("");
        }
      } finally {
        if (!isCancelled) {
          setIsHydrating(false);
        }
      }
    }

    hydrateMessages();

    return () => {
      isCancelled = true;
    };
  }, [agent, roomId, user]);

  const requestSummaryUpdate = async (sourceMessages, currentSummary) => {
    const persistedMessages = sourceMessages.filter(
      (message) => message.role === "user" || message.role === "assistant",
    );

    if (!shouldUpdateSummary(persistedMessages.length)) {
      return;
    }

    const summaryMessages = getPayloadMessages(
      persistedMessages,
      MAX_SUMMARY_MESSAGES,
    );

    if (!summaryMessages.length) {
      return;
    }

    setIsSummarizing(true);

    try {
      const res = await fetch("/.netlify/functions/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent,
          task: "summarize",
          mode: "economy",
          messages: summaryMessages,
          memorySummary: currentSummary,
          userEmail: user?.email,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.summary) {
        return;
      }

      const nextSummary = String(data.summary).slice(0, MAX_MEMORY_SUMMARY_CHARS);
      setSummary(nextSummary);

      try {
        await saveSummary({
          roomId,
          agentId: agent.id,
          userEmail: user?.email,
          summary: nextSummary,
        });
      } catch (error) {
        console.error("Failed to save chat summary", error);
      }
    } catch {
      // Summary update is best-effort only.
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleClearChat = async () => {
    const greetingMessage = getGreetingMessage(agent, user);
    setMessages([greetingMessage]);
    setSummary("");
    setLastUsage(null);

    try {
      await clearChatMemory({
        roomId,
        agentId: agent.id,
        userEmail: user?.email,
      });
    } catch (error) {
      console.error("Failed to clear chat memory", error);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || isHydrating) return;

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    const userMessage = { role: "user", content: trimmed, mode: effectiveMode };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    if (!canSendMessage(user?.email)) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: DAILY_LIMIT_EXCEEDED_MESSAGE,
        },
      ]);
      setLastUsage(null);
      return;
    }

    try {
      await saveMessage({
        roomId,
        agentId: agent.id,
        userEmail: user?.email,
        message: userMessage,
      });
    } catch (error) {
      console.error("Failed to save user message", error);
    }

    const payloadMessages = getPayloadMessages(nextMessages);
    setIsLoading(true);

    try {
      const res = await fetch("/.netlify/functions/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent,
          task: "chat",
          messages: payloadMessages,
          memorySummary: summary,
          userEmail: user?.email,
          mode: effectiveMode,
          roomId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "AI 응답 생성 실패");
      }

      if (activeRequestRef.current !== requestId) {
        return;
      }

      const assistantMessage = {
        role: "assistant",
        content: data.reply,
        usage: data.usage ?? null,
        mode: effectiveMode,
      };
      const finalMessages = [...nextMessages, assistantMessage];
      setMessages(finalMessages);
      setLastUsage(data.usage ?? null);
      incrementLocalUsage(user?.email);

      try {
        await saveMessage({
          roomId,
          agentId: agent.id,
          userEmail: user?.email,
          message: assistantMessage,
        });
      } catch (error) {
        console.error("Failed to save assistant message", error);
      }

      void requestSummaryUpdate(finalMessages, summary);
    } catch {
      if (activeRequestRef.current !== requestId) {
        return;
      }

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: FALLBACK_ERROR_MESSAGE,
        },
      ]);
      setLastUsage(null);
    } finally {
      if (activeRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  return (
    <section className="chat-panel">
      <div className="chat-header">
        <div className="agent-avatar small">{agent.emoji}</div>
        <div>
          <h2>{agent.name}</h2>
          <p>{agent.role}</p>
          <p className="chat-room-label">Room: {roomName}</p>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className="chat-clear-button"
            onClick={handleClearChat}
            disabled={isHydrating || isLoading}
          >
            새 대화
          </button>

          <div className="chat-mode-switch" aria-label="model mode">
            <button
              type="button"
              className={effectiveMode === "economy" ? "active" : ""}
              onClick={() => setSelectedMode("economy")}
            >
              {MODEL_PRESETS.economy.label}
              <span>{MODEL_PRESETS.economy.description}</span>
            </button>

            <button
              type="button"
              className={effectiveMode === "premium" ? "active" : ""}
              onClick={() => setSelectedMode("premium")}
              disabled={!isOwner}
              title={isOwner ? "더 정교한 모델 모드" : "Premium은 대표 계정 전용입니다."}
            >
              {MODEL_PRESETS.premium.label}
              <span>{MODEL_PRESETS.premium.description}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="chat-memory-bar">
        {hasSummary && <span>이전 맥락 적용 중</span>}
        {isSummarizing && <span>대화 맥락 정리 중...</span>}
        {isHydrating && <span>이전 대화를 불러오는 중...</span>}
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={message.id || `${message.role}-${index}`} className={`message ${message.role}`}>
            {message.content}
          </div>
        ))}

        {isLoading && <div className="message assistant">생각 중입니다...</div>}
      </div>

      {usageSummary && <div className="chat-usage">{usageSummary}</div>}

      <div className="chat-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`${userToneProfile.chatPlaceholderPrefix}, ${agent.name}에게 업무를 요청해보세요.`}
          rows={2}
          disabled={isHydrating}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
        />

        <button onClick={sendMessage} disabled={isLoading || isHydrating}>
          보내기
        </button>
      </div>
    </section>
  );
}

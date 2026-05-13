// Inspired by the visual status system in pablodelucca/pixel-agents.
// We only adapt the client-side office visualization concepts for this web app.
export const AGENT_STATUSES = {
  idle: {
    label: "대기 중",
    animation: "idle",
    bubble: "",
  },
  thinking: {
    label: "생각 중",
    animation: "thinking",
    bubble: "...",
  },
  working: {
    label: "작업 중",
    animation: "typing",
    bubble: "작업 중",
  },
  waiting: {
    label: "확인 필요",
    animation: "waiting",
    bubble: "확인 필요",
  },
  talking: {
    label: "대화 중",
    animation: "talking",
    bubble: "말하는 중",
  },
  returning: {
    label: "자리로 돌아가는 중",
    animation: "walk",
    bubble: "곧 갈게요",
  },
};

export const STATUS_CLASS_MAP = {
  idle: "status-idle",
  thinking: "status-thinking",
  working: "status-working",
  waiting: "status-waiting",
  talking: "status-talking",
  returning: "status-returning",
};

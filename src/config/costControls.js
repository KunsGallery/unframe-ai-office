export const DEFAULT_MODEL =
  import.meta.env.VITE_DEFAULT_OPENAI_MODEL || "gpt-5.4-mini";

export const PREMIUM_MODEL =
  import.meta.env.VITE_PREMIUM_OPENAI_MODEL || "gpt-5.4";

export const MAX_RECENT_MESSAGES = 6;
export const MAX_USER_MESSAGE_CHARS = 3000;
export const MAX_ASSISTANT_MESSAGE_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 900;
export const MAX_MEMORY_SUMMARY_CHARS = 4000;
export const SUMMARY_TRIGGER_MESSAGE_COUNT = 14;
export const SUMMARY_UPDATE_INTERVAL = 10;
export const MAX_SUMMARY_MESSAGES = 8;
export const STAFF_DAILY_REQUEST_LIMIT = 30;
export const OWNER_DAILY_REQUEST_LIMIT = 300;
export const OWNER_EMAILS = ["gallerykuns@gmail.com"];

export const MODEL_PRESETS = {
  economy: {
    id: "economy",
    label: "Economy",
    description: "기본 작업, 저비용",
    model: DEFAULT_MODEL,
  },
  premium: {
    id: "premium",
    label: "Premium",
    description: "대표 계정 전용, 정교한 작업",
    model: PREMIUM_MODEL,
  },
};

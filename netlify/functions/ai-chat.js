import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OWNER_EMAILS = ["gallerykuns@gmail.com"];
const ALLOWED_EMAILS = [
  "gallerykuns@gmail.com",
  "sylove887@gmail.com",
  // "staff@example.com",
];

const DEFAULT_MODEL = process.env.DEFAULT_OPENAI_MODEL || "gpt-5.4-mini";
const PREMIUM_MODEL = process.env.PREMIUM_OPENAI_MODEL || "gpt-5.4";

const MAX_RECENT_MESSAGES = Number(process.env.MAX_RECENT_MESSAGES || 6);
const MAX_SUMMARY_MESSAGES = Number(process.env.MAX_SUMMARY_MESSAGES || 8);
const MAX_USER_MESSAGE_CHARS = Number(process.env.MAX_USER_MESSAGE_CHARS || 3000);
const MAX_ASSISTANT_MESSAGE_CHARS = Number(process.env.MAX_ASSISTANT_MESSAGE_CHARS || 2000);
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS || 900);
const MAX_MEMORY_SUMMARY_CHARS = Number(process.env.MAX_MEMORY_SUMMARY_CHARS || 4000);
const MAX_SUMMARY_OUTPUT_TOKENS = Number(
  process.env.MAX_SUMMARY_OUTPUT_TOKENS || 700,
);

const MODEL_COSTS_PER_1M = {
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
};

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

function sanitizeMessages(messages, maxMessages = MAX_RECENT_MESSAGES) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .slice(-maxMessages)
    .map((message) => ({
      role: message?.role,
      content: trimMessageContent(message),
    }))
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content,
    );
}

function sanitizeMemorySummary(memorySummary) {
  if (typeof memorySummary !== "string") {
    return "";
  }

  return memorySummary.trim().slice(0, MAX_MEMORY_SUMMARY_CHARS);
}

function resolveMode(requestedMode, userEmail) {
  const isOwner = OWNER_EMAILS.includes(userEmail);
  const safeMode = requestedMode === "premium" ? "premium" : "economy";

  if (!isOwner) {
    return "economy";
  }

  return safeMode;
}

function getReplyText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputItems = Array.isArray(response?.output) ? response.output : [];

  for (const item of outputItems) {
    const contents = Array.isArray(item?.content) ? item.content : [];

    for (const content of contents) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        const trimmedText = content.text.trim();

        if (trimmedText) {
          return trimmedText;
        }
      }
    }
  }

  return "";
}

function getUsagePayload(response, model, mode) {
  const usage = response?.usage;

  if (!usage) {
    return null;
  }

  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? null;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? null;
  const totalTokens = usage.total_tokens ?? null;
  const pricing = MODEL_COSTS_PER_1M[model];
  let estimatedCostUsd = null;

  // UI rough estimate only. Confirm actual billing with the OpenAI Dashboard
  // and official pricing before using it for financial decisions.
  if (
    pricing &&
    typeof inputTokens === "number" &&
    typeof outputTokens === "number"
  ) {
    estimatedCostUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;
  }

  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    mode,
    estimatedCostUsd,
  };
}

function buildChatInstructions(agentPrompt, memorySummary) {
  const summaryInstructions = memorySummary
    ? `\n\n이전 대화 요약:\n${memorySummary}\n\n이 요약을 참고하되, 최근 사용자의 요청을 우선한다.`
    : "";

  return `${agentPrompt}${summaryInstructions}`;
}

function buildSummaryInstructions(agentPrompt, memorySummary) {
  return [
    agentPrompt,
    "당신의 임무는 긴 대화의 작업 맥락을 한국어로 짧고 실용적으로 요약하는 것이다.",
    "출력은 1200자 이하로 유지한다.",
    "다음 항목을 간결하게 정리한다: 현재 작업 주제, 사용자가 선호한 톤/방향, 결정된 사항, 피해야 할 사항, 다음에 이어서 작업할 때 필요한 핵심 맥락.",
    "민감한 API 키, 비밀번호, 토큰, 개인 비밀 정보는 요약하지 않는다.",
    memorySummary ? `기존 요약:\n${memorySummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const {
      agent,
      messages,
      memorySummary,
      userEmail,
      mode,
      task,
    } = JSON.parse(event.body || "{}");

    if (!ALLOWED_EMAILS.includes(userEmail)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "허용되지 않은 계정입니다." }),
      };
    }

    if (!agent || typeof agent.systemPrompt !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }),
      };
    }

    const safeTask = task === "summarize" ? "summarize" : "chat";
    const safeSummary = sanitizeMemorySummary(memorySummary);
    const messageLimit =
      safeTask === "summarize" ? MAX_SUMMARY_MESSAGES : MAX_RECENT_MESSAGES;
    const sanitizedMessages = sanitizeMessages(messages, messageLimit);

    if (!sanitizedMessages.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "전송할 대화가 없습니다." }),
      };
    }

    if (safeTask === "summarize") {
      const response = await openai.responses.create({
        model: DEFAULT_MODEL,
        instructions: buildSummaryInstructions(agent.systemPrompt, safeSummary),
        input: sanitizedMessages,
        max_output_tokens: Math.min(MAX_SUMMARY_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
      });

      const summary = getReplyText(response).slice(0, 1200);
      const usage = getUsagePayload(response, DEFAULT_MODEL, "economy");

      return {
        statusCode: 200,
        body: JSON.stringify({
          summary,
          usage,
        }),
      };
    }

    const resolvedMode = resolveMode(mode, userEmail);
    const model = resolvedMode === "premium" ? PREMIUM_MODEL : DEFAULT_MODEL;
    const response = await openai.responses.create({
      model,
      instructions: buildChatInstructions(agent.systemPrompt, safeSummary),
      input: sanitizedMessages,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    });

    const reply = getReplyText(response).slice(0, MAX_ASSISTANT_MESSAGE_CHARS);
    const usage = getUsagePayload(response, model, resolvedMode);

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply: reply || "응답을 생성했지만 텍스트를 추출하지 못했습니다.",
        usage,
      }),
    };
  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AI 서버 오류가 발생했습니다.",
      }),
    };
  }
}

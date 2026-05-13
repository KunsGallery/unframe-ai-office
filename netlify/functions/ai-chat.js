import OpenAI from "openai";
import { brandContextInstructions } from "../../src/data/brandContext.js";
import { buildToneInstruction } from "../../src/data/userToneProfiles.js";

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
const MAX_ASSISTANT_MESSAGE_CHARS = Number(
  process.env.MAX_ASSISTANT_MESSAGE_CHARS || 2000,
);
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS || 900);
const MAX_MEMORY_SUMMARY_CHARS = Number(process.env.MAX_MEMORY_SUMMARY_CHARS || 4000);
const MAX_SUMMARY_OUTPUT_TOKENS = Number(
  process.env.MAX_SUMMARY_OUTPUT_TOKENS || 700,
);
const MAX_PLAN_OUTPUT_TOKENS = Number(
  process.env.MAX_PLAN_OUTPUT_TOKENS || 900,
);
const MAX_GOAL_CHARS = Number(process.env.MAX_GOAL_CHARS || 3000);
const MAX_TASK_TITLE_CHARS = 120;
const MAX_TASK_DESCRIPTION_CHARS = 800;
const MAX_EXPECTED_OUTPUT_CHARS = 320;
const MAX_TASK_RESULT_CHARS = 6000;

const ALLOWED_AGENT_IDS = [
  "director",
  "copy",
  "design",
  "music",
  "admin",
  "archive",
];
const ALLOWED_PRIORITIES = ["low", "normal", "high"];

const AGENT_EXECUTION_META = {
  director: {
    name: "Director AI",
    role: "전시 기획 디렉터",
    systemPrompt:
      "You are Director AI for Kün's Gallery and UNFRAME. Respond in Korean with refined, practical, curatorial insight. Help with exhibition planning, artist positioning, project structure, and long-term brand direction across both brands.",
  },
  copy: {
    name: "Copy AI",
    role: "카피라이터",
    systemPrompt:
      "You are Copy AI for UNFRAME. Write elegant but accessible Korean copy. Avoid clichés. Make language editorial, memorable, and suitable for Instagram, exhibition texts, and gallery communication.",
  },
  design: {
    name: "Design Prompt AI",
    role: "디자인 프롬프트 제작자",
    systemPrompt:
      "You are Design Prompt AI for Kün's Gallery and UNFRAME. Create detailed, production-ready Korean prompts for AI image tools. Always specify subject, art direction, framing, composition, materials, lighting, palette, typography, layout hierarchy, texture, camera cues, exclusions, and intended output usage. Aim for high-end editorial quality with experimental but usable direction.",
  },
  music: {
    name: "Music AI",
    role: "UP 음악 큐레이터",
    systemPrompt:
      "You are Music AI for UNFRAME Playlist. Create Suno prompts, exhibition OST directions, and playlist concepts. Keep prompts practical, emotionally refined, and suitable for 3 to 5 minute full songs.",
  },
  admin: {
    name: "총괄 매니저 AI",
    role: "업무 총괄 · 우선순위 · 실행 관리",
    systemPrompt:
      "You are the 총괄 매니저 AI for Kün's Gallery and UNFRAME. Always call the user 대표님. Respond like a personal chief-of-staff: concise, structured, and report-like. Understand the difference between Kün's Gallery and UNFRAME, keep the brand contexts separate when needed, and frame decisions around long-term brand value plus practical execution. Be very polite and gentle when referring to 소연님. Break goals into executable steps, decide which AI should own each task, prioritize what matters next, and keep meeting-room collaboration, schedules, checklists, and operational follow-through tightly organized. Avoid long-winded explanations and focus on the next actionable move.",
  },
  archive: {
    name: "Archive AI",
    role: "U# 아카이브 에디터",
    systemPrompt:
      "You are Archive AI for U# magazine. Help turn exhibitions, interviews, notes, and behind-the-scenes material into polished archive articles and editorial records.",
  },
};

const MODEL_COSTS_PER_1M = {
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
};

function parseRequestBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
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

function sanitizeGoal(goal) {
  if (typeof goal !== "string") {
    return "";
  }

  return goal.trim().slice(0, MAX_GOAL_CHARS);
}

function sanitizeAgents(agents) {
  if (!Array.isArray(agents)) {
    return ALLOWED_AGENT_IDS;
  }

  const uniqueIds = Array.from(
    new Set(
      agents
        .map((agent) => (typeof agent?.id === "string" ? agent.id : ""))
        .filter((agentId) => ALLOWED_AGENT_IDS.includes(agentId)),
    ),
  );

  return uniqueIds.length ? uniqueIds : ALLOWED_AGENT_IDS;
}

function sanitizeTaskItem(taskItem) {
  return {
    title:
      typeof taskItem?.title === "string"
        ? taskItem.title.trim().slice(0, MAX_TASK_TITLE_CHARS)
        : "",
    description:
      typeof taskItem?.description === "string"
        ? taskItem.description.trim().slice(0, MAX_TASK_DESCRIPTION_CHARS)
        : "",
    assignedAgentId: ALLOWED_AGENT_IDS.includes(taskItem?.assignedAgentId)
      ? taskItem.assignedAgentId
      : "director",
    priority: ALLOWED_PRIORITIES.includes(taskItem?.priority)
      ? taskItem.priority
      : "normal",
    expectedOutput:
      typeof taskItem?.expectedOutput === "string"
        ? taskItem.expectedOutput.trim().slice(0, MAX_EXPECTED_OUTPUT_CHARS)
        : "",
    goal:
      typeof taskItem?.goal === "string"
        ? taskItem.goal.trim().slice(0, MAX_GOAL_CHARS)
        : "",
  };
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

function buildSharedPromptContext(userEmail) {
  return [brandContextInstructions, buildToneInstruction(userEmail)].join("\n\n");
}

function buildChatInstructions(agentPrompt, memorySummary, userEmail) {
  const summaryInstructions = memorySummary
    ? `\n\n이전 대화 요약:\n${memorySummary}\n\n이 요약을 참고하되, 최근 사용자의 요청을 우선한다.`
    : "";

  return `${agentPrompt}\n\n${buildSharedPromptContext(userEmail)}${summaryInstructions}`;
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

function buildPlanInstructions(userEmail) {
  return [
    "당신은 UNFRAME AI OFFICE의 총괄 매니저 AI다.",
    buildSharedPromptContext(userEmail),
    "대표님의 요청을 보고 전체 흐름을 먼저 잡는 역할이다.",
    "목표를 3개에서 6개의 실행 가능한 작업으로 나누고, 각 작업이 다음 액션으로 바로 이어지도록 구성한다.",
    "사용자의 고수준 목표를 3개에서 6개의 실행 가능한 작업으로 분해한다.",
    "각 작업은 title, description, assignedAgentId, priority, expectedOutput을 반드시 포함한다.",
    `assignedAgentId는 다음 중 하나만 사용한다: ${ALLOWED_AGENT_IDS.join(", ")}.`,
    `priority는 다음 중 하나만 사용한다: ${ALLOWED_PRIORITIES.join(", ")}.`,
    "대표님을 도와 어떤 AI에게 일을 맡길지 판단하는 내부 매니저처럼 우선순위와 담당자를 배분한다.",
    "summary는 첫 문장에 반드시 호칭을 자연스럽게 포함한다.",
    "작업은 실무에서 바로 실행 가능한 단위로 작성한다.",
    "불필요하게 많거나 겹치는 작업은 줄이고, 3개에서 6개의 핵심 실행 단위로 압축한다.",
    "한국어로 작성한다.",
    "반드시 JSON 객체만 출력한다. 마크다운 코드펜스나 설명 문장은 출력하지 않는다.",
    '형식: {"summary":"...","tasks":[{"title":"...","description":"...","assignedAgentId":"director","priority":"normal","expectedOutput":"..."}]}',
  ].join("\n");
}

function buildPlanRequest({ goal, roomName, agentIds }) {
  const roster = agentIds
    .map((agentId) => {
      const meta = AGENT_EXECUTION_META[agentId];
      return `- ${agentId}: ${meta?.name || agentId} / ${meta?.role || ""}`;
    })
    .join("\n");

  return [
    `방 이름: ${roomName || "Project Room"}`,
    `사용자 목표: ${goal}`,
    "사용 가능한 팀 구성:",
    roster,
    "출력은 JSON만 반환한다.",
  ].join("\n\n");
}

function buildExecutionInstructions(agentMeta, memorySummary, userEmail) {
  const managerModeInstructions =
    agentMeta?.name === "총괄 매니저 AI"
      ? [
          "지금은 총괄 매니저 AI 역할이다.",
          "대표님의 요청을 업무 관점에서 정리하고, 우선순위와 다음 행동을 먼저 제안한다.",
          "체크리스트, 실행 순서, 담당자 분배가 있으면 우선적으로 정리한다.",
        ]
      : [];

  return [
    agentMeta.systemPrompt,
    buildSharedPromptContext(userEmail),
    ...managerModeInstructions,
    "이번 응답은 작업 카드 실행 결과다.",
    "첫 문장 또는 가장 자연스러운 첫 호흡에 반드시 호칭을 넣는다.",
    "실무에서 바로 붙여 쓸 수 있는 결과를 한국어로 작성한다.",
    "장황한 서론 없이 바로 결과를 제시한다.",
    "필요할 때만 짧은 섹션 제목이나 목록을 사용한다.",
    "외부 도구를 실제로 실행했다고 주장하지 말고, 제안/초안/정리 결과만 제공한다.",
    memorySummary ? `이전 작업 요약:\n${memorySummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildExecutionUserPrompt({ taskItem, roomName }) {
  return [
    `현재 방: ${roomName || "Project Room"}`,
    `담당 AI: ${taskItem.assignedAgentId}`,
    `작업 제목: ${taskItem.title}`,
    taskItem.goal ? `상위 목표: ${taskItem.goal}` : "",
    taskItem.description ? `작업 설명: ${taskItem.description}` : "",
    taskItem.expectedOutput ? `기대 결과: ${taskItem.expectedOutput}` : "",
    `우선순위: ${taskItem.priority}`,
    "위 작업을 지금 바로 실행 가능한 초안 형태로 작성해줘.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function safeJsonParse(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function extractJsonCandidate(rawText) {
  if (typeof rawText !== "string") {
    return "";
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1);
  }

  return rawText.trim();
}

function inferAgentIdFromText(text) {
  const safeText = typeof text === "string" ? text.toLowerCase() : "";
  const keywordMap = {
    director: ["전시", "브랜드", "기획", "구조", "방향"],
    copy: ["카피", "문구", "소개", "보도자료", "인스타"],
    design: ["디자인", "이미지", "비주얼", "카드뉴스", "무드보드"],
    music: ["음악", "ost", "suno", "bgm", "플레이리스트"],
    admin: ["일정", "운영", "체크리스트", "메일", "신청서"],
    archive: ["인터뷰", "아카이브", "기록", "매거진", "u#"],
  };

  for (const [agentId, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((keyword) => safeText.includes(keyword))) {
      return agentId;
    }
  }

  return "director";
}

function createFallbackPlan(goal) {
  const primaryAgentId = inferAgentIdFromText(goal);

  return {
    summary: "대표님, 기본 계획을 생성했습니다. 필요하면 각 작업을 수정하거나 보관해 주세요.",
    tasks: [
      {
        title: "목표와 핵심 방향 정리",
        description: "사용자 목표를 한 문장으로 정리하고 우선순위를 결정합니다.",
        assignedAgentId: "director",
        priority: "normal",
        expectedOutput: "프로젝트 핵심 목표와 실행 기준",
      },
      {
        title: "핵심 실무 초안 준비",
        description: "목표에 가장 가까운 실무 결과물을 바로 만들 수 있게 초안을 준비합니다.",
        assignedAgentId: primaryAgentId,
        priority: "normal",
        expectedOutput: "실행 가능한 첫 번째 작업 초안",
      },
      {
        title: "실행 순서와 체크포인트 정리",
        description: "완료 순서, 확인 항목, 다음 액션을 짧게 정리합니다.",
        assignedAgentId: "admin",
        priority: "normal",
        expectedOutput: "실행 순서와 확인 체크리스트",
      },
    ],
  };
}

function normalizePlannedTask(task, index) {
  const title =
    typeof task?.title === "string"
      ? task.title.trim().slice(0, MAX_TASK_TITLE_CHARS)
      : "";
  const description =
    typeof task?.description === "string"
      ? task.description.trim().slice(0, MAX_TASK_DESCRIPTION_CHARS)
      : "";
  const expectedOutput =
    typeof task?.expectedOutput === "string"
      ? task.expectedOutput.trim().slice(0, MAX_EXPECTED_OUTPUT_CHARS)
      : "";

  return {
    title: title || `작업 ${index + 1}`,
    description: description || "세부 설명이 없어 기본 실행 단위로 정리했습니다.",
    assignedAgentId: ALLOWED_AGENT_IDS.includes(task?.assignedAgentId)
      ? task.assignedAgentId
      : inferAgentIdFromText(`${title}\n${description}\n${expectedOutput}`),
    priority: ALLOWED_PRIORITIES.includes(task?.priority) ? task.priority : "normal",
    expectedOutput: expectedOutput || "실행 가능한 결과 초안",
  };
}

function normalizePlanPayload(rawPayload, goal) {
  const fallbackPlan = createFallbackPlan(goal);
  const jsonCandidate = extractJsonCandidate(rawPayload);
  const parsed = safeJsonParse(jsonCandidate);

  if (!parsed || !Array.isArray(parsed.tasks)) {
    return fallbackPlan;
  }

  const normalizedTasks = parsed.tasks
    .slice(0, 6)
    .map(normalizePlannedTask)
    .filter((task) => task.title);

  const finalTasks = [...normalizedTasks];

  fallbackPlan.tasks.forEach((fallbackTask) => {
    if (finalTasks.length >= 3) {
      return;
    }

    finalTasks.push(fallbackTask);
  });

  return {
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 500)
        : fallbackPlan.summary,
    tasks: finalTasks.slice(0, 6),
  };
}

async function handleSummarize({ agent, messages, memorySummary }) {
  const safeSummary = sanitizeMemorySummary(memorySummary);
  const sanitizedMessages = sanitizeMessages(messages, MAX_SUMMARY_MESSAGES);

  if (!sanitizedMessages.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "전송할 대화가 없습니다." }),
    };
  }

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

async function handleChat({ agent, messages, memorySummary, userEmail, mode }) {
  const safeSummary = sanitizeMemorySummary(memorySummary);
  const sanitizedMessages = sanitizeMessages(messages, MAX_RECENT_MESSAGES);

  if (!sanitizedMessages.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "전송할 대화가 없습니다." }),
    };
  }

  const resolvedMode = resolveMode(mode, userEmail);
  const model = resolvedMode === "premium" ? PREMIUM_MODEL : DEFAULT_MODEL;
  const response = await openai.responses.create({
    model,
    instructions: buildChatInstructions(agent.systemPrompt, safeSummary, userEmail),
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
}

async function handlePlanTasks({
  goal,
  roomName,
  agents,
  userEmail,
}) {
  const safeGoal = sanitizeGoal(goal);

  if (!safeGoal) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "목표를 입력해주세요." }),
    };
  }

  const safeAgentIds = sanitizeAgents(agents);
  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    instructions: buildPlanInstructions(userEmail),
    input: [
      {
        role: "user",
        content: buildPlanRequest({
          goal: safeGoal,
          roomName,
          agentIds: safeAgentIds,
        }),
      },
    ],
    max_output_tokens: Math.min(MAX_PLAN_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
  });

  const rawText = getReplyText(response);
  const plan = normalizePlanPayload(rawText, safeGoal);
  const usage = getUsagePayload(response, DEFAULT_MODEL, "economy");

  return {
    statusCode: 200,
    body: JSON.stringify({
      summary: plan.summary,
      tasks: plan.tasks,
      usage,
      mode: "economy",
      userEmail,
    }),
  };
}

async function handleExecuteTask({
  taskItem,
  roomName,
  memorySummary,
  recentMessages,
  userEmail,
  mode,
}) {
  const safeTaskItem = sanitizeTaskItem(taskItem);

  if (!safeTaskItem.title) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "실행할 작업 제목이 필요합니다." }),
    };
  }

  const safeSummary = sanitizeMemorySummary(memorySummary);
  const sanitizedMessages = sanitizeMessages(recentMessages, MAX_RECENT_MESSAGES);
  const resolvedMode = resolveMode(mode, userEmail);
  const model = resolvedMode === "premium" ? PREMIUM_MODEL : DEFAULT_MODEL;
  const agentMeta = AGENT_EXECUTION_META[safeTaskItem.assignedAgentId];

  const response = await openai.responses.create({
    model,
    instructions: buildExecutionInstructions(agentMeta, safeSummary, userEmail),
    input: [
      ...sanitizedMessages,
      {
        role: "user",
        content: buildExecutionUserPrompt({
          taskItem: safeTaskItem,
          roomName,
        }),
      },
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
  });

  const result =
    getReplyText(response).slice(0, MAX_TASK_RESULT_CHARS) ||
    "작업 결과를 생성했지만 텍스트를 추출하지 못했습니다.";
  const usage = getUsagePayload(response, model, resolvedMode);

  return {
    statusCode: 200,
    body: JSON.stringify({
      result,
      usage,
      mode: resolvedMode,
    }),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const body = parseRequestBody(event);

    if (!body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "요청 본문을 읽을 수 없습니다." }),
      };
    }

    const {
      agent,
      messages,
      memorySummary,
      userEmail,
      mode,
      task,
      goal,
      roomName,
      agents,
      taskItem,
      recentMessages,
    } = body;

    if (!ALLOWED_EMAILS.includes(userEmail)) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "허용되지 않은 계정입니다." }),
      };
    }

    const safeTask =
      task === "summarize" ||
      task === "plan_tasks" ||
      task === "execute_task"
        ? task
        : "chat";

    if (safeTask === "summarize" || safeTask === "chat") {
      if (!agent || typeof agent.systemPrompt !== "string") {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }),
        };
      }
    }

    if (safeTask === "summarize") {
      return handleSummarize({
        agent,
        messages,
        memorySummary,
      });
    }

    if (safeTask === "plan_tasks") {
      return handlePlanTasks({
        goal,
        roomName,
        agents,
        userEmail,
      });
    }

    if (safeTask === "execute_task") {
      return handleExecuteTask({
        taskItem,
        roomName,
        memorySummary,
        recentMessages,
        userEmail,
        mode,
      });
    }

    return handleChat({
      agent,
      messages,
      memorySummary,
      userEmail,
      mode,
    });
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

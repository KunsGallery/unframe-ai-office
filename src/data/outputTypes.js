export const OUTPUT_TYPES = [
  { value: "exhibition_text", label: "전시 텍스트" },
  { value: "instagram_copy", label: "인스타 카피" },
  { value: "design_prompt", label: "디자인 프롬프트" },
  { value: "suno_prompt", label: "Suno 프롬프트" },
  { value: "email_draft", label: "이메일 초안" },
  { value: "checklist", label: "체크리스트" },
  { value: "article_draft", label: "아티클 초안" },
  { value: "interview_questions", label: "인터뷰 질문" },
  { value: "general", label: "일반 문서" },
];

export const OUTPUT_TYPE_MAP = OUTPUT_TYPES.reduce((accumulator, item) => {
  accumulator[item.value] = item;
  return accumulator;
}, {});

export function inferOutputType(task) {
  const expectedOutput = String(task?.expectedOutput || "").toLowerCase();
  const title = String(task?.title || "").toLowerCase();
  const combined = `${title} ${expectedOutput}`;

  if (
    combined.includes("인스타") ||
    combined.includes("instagram") ||
    combined.includes("카피")
  ) {
    return "instagram_copy";
  }

  if (
    combined.includes("디자인") ||
    combined.includes("프롬프트") ||
    combined.includes("prompt")
  ) {
    return task?.assignedAgentId === "music" ? "suno_prompt" : "design_prompt";
  }

  if (combined.includes("전시")) {
    return "exhibition_text";
  }

  if (combined.includes("메일") || combined.includes("email")) {
    return "email_draft";
  }

  if (combined.includes("체크리스트") || combined.includes("checklist")) {
    return "checklist";
  }

  if (combined.includes("기사") || combined.includes("article")) {
    return "article_draft";
  }

  if (combined.includes("인터뷰")) {
    return "interview_questions";
  }

  if (task?.assignedAgentId === "music") {
    return "suno_prompt";
  }

  if (task?.assignedAgentId === "design") {
    return "design_prompt";
  }

  if (task?.assignedAgentId === "copy") {
    return "instagram_copy";
  }

  return "general";
}

export const TASK_STATUSES = {
  planned: {
    label: "계획됨",
    className: "status-planned",
  },
  running: {
    label: "작업 중",
    className: "status-running",
  },
  completed: {
    label: "완료",
    className: "status-completed",
  },
  failed: {
    label: "실패",
    className: "status-failed",
  },
  archived: {
    label: "보관됨",
    className: "status-archived",
  },
};

export const AGENT_TASK_MAP = {
  director: ["전시 방향", "기획", "브랜드 전략", "프로젝트 구조"],
  copy: ["카피", "문구", "인스타그램", "보도자료", "전시 소개"],
  design: ["디자인 프롬프트", "시각 기획", "카드뉴스", "이미지"],
  music: ["음악", "OST", "Suno", "릴스 BGM", "플레이리스트"],
  admin: ["일정", "체크리스트", "메일", "운영", "신청서"],
  archive: ["인터뷰", "매거진", "기록", "U#", "아카이브"],
};

export const TASK_PRIORITIES = ["low", "normal", "high"];
export const TASK_EXECUTABLE_STATUSES = ["planned", "failed"];

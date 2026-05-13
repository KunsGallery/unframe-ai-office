import { AGENT_STATUSES, STATUS_CLASS_MAP } from "../data/agentStatuses";

export default function AgentActivityPanel({
  agents,
  agentVisualStates,
  activeAgentId,
  nearestAgentId,
}) {
  return (
    <section className="agent-activity-panel" aria-label="AI 직원 상태">
      <div className="activity-panel-title">AI 상태 보드</div>

      {agents.map((agent) => {
        const visualState = agentVisualStates?.[agent.id] || {};
        const status =
          visualState.status ||
          (agent.id === activeAgentId
            ? "talking"
            : agent.id === nearestAgentId
              ? "waiting"
              : "idle");
        const meta = AGENT_STATUSES[status] || AGENT_STATUSES.idle;
        const statusClass = STATUS_CLASS_MAP[status] || STATUS_CLASS_MAP.idle;
        const isMoving = Boolean(visualState.isMoving);
        const message = visualState.message;
        const mode = visualState.mode || "base";
        let activityLabel = meta.label;

        if (mode === "collaboration-moving") {
          activityLabel = "회의실 이동 중";
        } else if (mode === "collaboration-ready") {
          activityLabel = "브레인스토밍 준비 중";
        } else if (mode === "collaboration") {
          activityLabel = "브레인스토밍 중";
        } else if (mode === "task" && isMoving) {
          activityLabel = "작업 위치로 이동 중";
        } else if (mode === "task") {
          activityLabel = "작업 수행 중";
        } else if (mode === "coordination" && isMoving) {
          activityLabel = "팀 호출 중";
        } else if (mode === "coordination") {
          activityLabel = "회의실로 모이는 중";
        } else if (status === "returning" || mode === "returning") {
          activityLabel = "자리로 돌아가는 중";
        } else if (isMoving) {
          activityLabel = "이동 중";
        } else if (mode === "roaming") {
          activityLabel = "다른 자리 확인 중";
        }

        return (
          <div key={agent.id} className={`activity-row ${statusClass}`}>
            <div className="activity-dot" aria-hidden="true" />
            <div className="activity-agent">
              <strong>{agent.name}</strong>
              <span>
                {message
                  ? message
                  : agent.character?.label || agent.role}
              </span>
            </div>
            <div className="activity-status">{activityLabel}</div>
          </div>
        );
      })}
    </section>
  );
}

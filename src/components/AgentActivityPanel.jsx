import { AGENT_STATUSES, STATUS_CLASS_MAP } from "../data/agentStatuses";

export default function AgentActivityPanel({
  agents,
  agentVisualStates,
  activeAgentId,
  nearestAgentId,
}) {
  function shortenMessage(value) {
    const text = typeof value === "string" ? value.trim() : "";

    if (!text) {
      return "";
    }

    return text.length > 42 ? `${text.slice(0, 42)}…` : text;
  }

  return (
    <section className="agent-activity-panel" aria-label="AI 직원 상태">
      <div className="activity-panel-title">AI 상태 보드</div>
      <div className="agent-activity-list">
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
            activityLabel = "회의실 이동";
          } else if (mode === "collaboration-ready") {
            activityLabel = "협업 대기";
          } else if (mode === "collaboration") {
            activityLabel = "협업 중";
          } else if (mode === "task" && isMoving) {
            activityLabel = "작업 이동";
          } else if (mode === "task") {
            activityLabel = "작업 수행";
          } else if (mode === "coordination" && isMoving) {
            activityLabel = "호출 중";
          } else if (mode === "coordination") {
            activityLabel = "회의 모임";
          } else if (status === "returning" || mode === "returning") {
            activityLabel = "복귀 중";
          } else if (isMoving) {
            activityLabel = "이동 중";
          } else if (mode === "roaming") {
            activityLabel = "순회 중";
          }

          const shortMessage = shortenMessage(message || agent.character?.label || agent.role);

          return (
            <div key={agent.id} className={`activity-row ${statusClass}`}>
              <div className="activity-dot" aria-hidden="true" />
              <div className="activity-agent">
                <strong>{agent.name}</strong>
                <span title={message || agent.character?.label || agent.role}>
                  {shortMessage}
                </span>
              </div>
              <div className="activity-status" title={activityLabel}>
                {activityLabel}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

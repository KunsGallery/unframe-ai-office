import { useMemo, useState } from "react";
import { TASK_EXECUTABLE_STATUSES } from "../data/taskTypes";

function getResultPreview(result) {
  if (typeof result !== "string") {
    return "";
  }

  return result.trim().slice(0, 160);
}

export default function TaskCard({
  task,
  agent,
  statusMeta,
  onRun,
  onArchive,
  isRunning,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canRun = TASK_EXECUTABLE_STATUSES.includes(task.status);
  const hasResult = Boolean(task.result?.trim());
  const preview = useMemo(() => getResultPreview(task.result), [task.result]);

  if (task.status === "archived") {
    return null;
  }

  return (
    <article
      className={`task-card ${task.status || "planned"} ${isRunning ? "running" : ""}`}
      style={{
        "--task-agent-color": agent?.character?.accentColor || agent?.color || "#004aad",
      }}
    >
      <div className="task-card-head">
        <div>
          <p className="task-kicker">{task.planId || "Task Plan"}</p>
          <h4>{task.title || "이름 없는 작업"}</h4>
        </div>
        <span className={`task-status-badge ${statusMeta?.className || ""}`}>
          {isRunning ? "작업 중" : statusMeta?.label || task.status}
        </span>
      </div>

      <div className="task-card-meta">
        <span className="task-agent-chip">
          {agent?.emoji || "🤖"} {agent?.name || task.assignedAgentId}
        </span>
        <span className="task-priority-chip">우선순위 {task.priority || "normal"}</span>
      </div>

      {task.description ? <p className="task-description">{task.description}</p> : null}
      {task.expectedOutput ? (
        <p className="task-expected-output">
          <strong>예상 결과</strong>
          <span>{task.expectedOutput}</span>
        </p>
      ) : null}

      {hasResult ? (
        <div className="task-result-block">
          <div className="task-result-summary">
            <strong>결과 미리보기</strong>
            <span>{preview}</span>
          </div>
          <button
            type="button"
            className="task-toggle-button"
            onClick={() => setIsExpanded((previous) => !previous)}
          >
            {isExpanded ? "결과 접기" : "결과 펼치기"}
          </button>
          {isExpanded ? <pre className="task-result">{task.result}</pre> : null}
        </div>
      ) : null}

      {task.errorMessage ? <p className="task-error-message">{task.errorMessage}</p> : null}

      {task.usage ? (
        <p className="task-usage">
          usage input {task.usage.inputTokens ?? "-"} / output {task.usage.outputTokens ?? "-"}
        </p>
      ) : null}

      <div className="task-actions">
        {canRun ? (
          <button type="button" onClick={() => onRun(task)} disabled={isRunning}>
            {isRunning ? "작업 중..." : "실행"}
          </button>
        ) : null}
        <button type="button" className="secondary" onClick={() => onArchive(task)}>
          보관
        </button>
      </div>
    </article>
  );
}

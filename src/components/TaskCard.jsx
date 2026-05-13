import { useMemo, useState } from "react";
import { TASK_EXECUTABLE_STATUSES } from "../data/taskTypes";
import { OUTPUT_TYPES, inferOutputType } from "../data/outputTypes";

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
  onSaveResult,
  onSaveOutput,
  isRunning,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [resultDraft, setResultDraft] = useState(task.result || "");
  const [outputType, setOutputType] = useState(() => inferOutputType(task));
  const [archiveTitle, setArchiveTitle] = useState(task.title || "");
  const [copyState, setCopyState] = useState("idle");
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [archiveState, setArchiveState] = useState("idle");
  const canRun = TASK_EXECUTABLE_STATUSES.includes(task.status);
  const hasResult = Boolean(task.result?.trim());
  const preview = useMemo(() => getResultPreview(task.result), [task.result]);
  const hasDraftChanges = resultDraft !== (task.result || "");

  if (task.status === "archived") {
    return null;
  }

  const handleCopy = async () => {
    if (!task.result?.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(task.result);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch (error) {
      console.error("Failed to copy task result", error);
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  };

  const handleSaveResult = async () => {
    if (!resultDraft.trim() || !hasDraftChanges || !onSaveResult) {
      return;
    }

    setIsSavingResult(true);

    try {
      await onSaveResult(task, resultDraft);
      setIsEditing(false);
    } finally {
      setIsSavingResult(false);
    }
  };

  const handleSaveOutput = async () => {
    if (!resultDraft.trim() || !onSaveOutput) {
      return;
    }

    setArchiveState("saving");

    try {
      await onSaveOutput(task, {
        title: archiveTitle.trim() || task.title || "Task Output",
        type: outputType,
        content: resultDraft,
      });
      setArchiveState("saved");
      window.setTimeout(() => setArchiveState("idle"), 2200);
    } catch (error) {
      console.error("Failed to archive output", error);
      setArchiveState("error");
      window.setTimeout(() => setArchiveState("idle"), 2200);
    }
  };

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

          <div className="task-result-toolbar">
            <button
              type="button"
              className="task-toggle-button"
              onClick={() => setIsExpanded((previous) => !previous)}
            >
              {isExpanded ? "결과 접기" : "결과 펼치기"}
            </button>
            <button type="button" className="task-tool-button" onClick={handleCopy}>
              {copyState === "copied"
                ? "복사됨"
                : copyState === "error"
                  ? "복사 실패"
                  : "복사"}
            </button>
            <button
              type="button"
              className="task-tool-button secondary"
              onClick={() => {
                setIsExpanded(true);
                setIsEditing((previous) => !previous);
                setResultDraft(task.result || "");
                setArchiveTitle(task.title || "");
                setOutputType(inferOutputType(task));
              }}
            >
              {isEditing ? "수정 취소" : "수정"}
            </button>
          </div>

          {isExpanded ? (
            <div className="task-result-content">
              {isEditing ? (
                <>
                  <textarea
                    className="task-result-editor"
                    value={resultDraft}
                    onChange={(event) => setResultDraft(event.target.value)}
                    rows={10}
                  />
                  <div className="task-result-edit-actions">
                    <button
                      type="button"
                      className="task-tool-button"
                      onClick={handleSaveResult}
                      disabled={!hasDraftChanges || isSavingResult || !resultDraft.trim()}
                    >
                      {isSavingResult ? "저장 중..." : "수정본 저장"}
                    </button>
                    <button
                      type="button"
                      className="task-tool-button secondary"
                      onClick={() => {
                        setResultDraft(task.result || "");
                        setIsEditing(false);
                      }}
                      disabled={isSavingResult}
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <pre className="task-result">{task.result}</pre>
              )}

              <div className="task-output-archive">
                <div className="task-output-archive-head">
                  <strong>Output Archive 저장</strong>
                  <span>
                    {archiveState === "saved"
                      ? "아카이브 저장됨"
                      : archiveState === "error"
                        ? "저장 실패"
                        : "필요한 결과만 보관합니다."}
                  </span>
                </div>
                <input
                  className="task-output-title-input"
                  value={archiveTitle}
                  onChange={(event) => setArchiveTitle(event.target.value)}
                  placeholder="아카이브 제목"
                />
                <div className="task-output-archive-actions">
                  <select
                    className="task-output-type-select"
                    value={outputType}
                    onChange={(event) => setOutputType(event.target.value)}
                  >
                    {OUTPUT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="task-tool-button"
                    onClick={handleSaveOutput}
                    disabled={archiveState === "saving" || !resultDraft.trim()}
                  >
                    {archiveState === "saving" ? "저장 중..." : "아카이브 저장"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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

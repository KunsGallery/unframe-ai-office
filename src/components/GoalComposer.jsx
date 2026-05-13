import { useState } from "react";

export default function GoalComposer({ room, onCreatePlan, isPlanning }) {
  const [goal, setGoal] = useState("");
  const trimmedGoal = goal.trim();

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!trimmedGoal || isPlanning) {
      return;
    }

    onCreatePlan(trimmedGoal);
    setGoal("");
  };

  return (
    <form className="goal-composer" onSubmit={handleSubmit}>
      <div className="goal-composer-header">
        <div>
          <p className="goal-composer-label">MANAGER AI</p>
          <strong>{room?.name || "Project Room"} 업무 목표</strong>
        </div>
        {isPlanning ? <span className="goal-planning-badge">분배 중</span> : null}
      </div>

      <textarea
        className="goal-input"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="이 방에서 AI 팀에게 맡길 목표를 입력해보세요. 예: 다음 전시 홍보 플랜을 만들어줘."
        rows={4}
        disabled={isPlanning}
      />

      <div className="goal-composer-actions">
        <span className="goal-composer-hint">
          {isPlanning
            ? "Manager AI가 작업을 나누는 중..."
            : "자동 실행 없이 계획만 생성합니다."}
        </span>
        <button type="submit" disabled={!trimmedGoal || isPlanning}>
          작업 계획 만들기
        </button>
      </div>
    </form>
  );
}

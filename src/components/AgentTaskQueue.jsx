import { useEffect, useMemo, useState } from "react";
import { TASK_STATUSES } from "../data/taskTypes";
import {
  archiveTask,
  loadTasks,
  saveTasksFromPlan,
  updateTask,
} from "../lib/taskQueue";
import { canSendMessage, incrementLocalUsage } from "../lib/usageLimit";
import GoalComposer from "./GoalComposer";
import TaskCard from "./TaskCard";

const DAILY_LIMIT_EXCEEDED_MESSAGE =
  "오늘의 AI 요청 한도를 초과했습니다. 대표 계정이 아니면 economy 요청만 가능하며 자동 실행은 비활성화되어 있습니다.";

function getRecentContextTasks(tasks) {
  return tasks
    .filter((task) => task.status === "completed" && typeof task.result === "string")
    .slice(0, 6)
    .map((task) => ({
      role: "assistant",
      content: `${task.title}\n${task.result}`.slice(0, 1200),
    }));
}

function buildMemorySummary(tasks, room) {
  const lines = tasks
    .filter((task) => task.status === "completed" && task.result)
    .slice(0, 4)
    .map((task) => `- ${task.title}: ${String(task.result).slice(0, 220)}`);

  return [`방 이름: ${room?.name || room?.id || "Project Room"}`, ...lines]
    .join("\n")
    .slice(0, 4000);
}

export default function AgentTaskQueue({
  room,
  user,
  agents,
  triggerCollaboration,
  onPlanningStart,
  onPlanningEnd,
  onTaskRunStart,
  onTaskRunComplete,
  onTaskRunError,
}) {
  const [tasks, setTasks] = useState([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  const agentMap = useMemo(() => {
    return agents.reduce((accumulator, agent) => {
      accumulator[agent.id] = agent;
      return accumulator;
    }, {});
  }, [agents]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateTasks() {
      setIsHydrating(true);
      setErrorMessage("");

      const loadedTasks = await loadTasks({
        roomId: room?.id,
        userEmail: user?.email,
      });

      if (!isCancelled) {
        setTasks(loadedTasks);
        setIsHydrating(false);
      }
    }

    hydrateTasks();

    return () => {
      isCancelled = true;
    };
  }, [room?.id, user?.email]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => task.status !== "archived");
  }, [tasks]);

  const handleCreatePlan = async (goal) => {
    if (!user?.email || !room?.id || isPlanning) {
      return;
    }

    if (!canSendMessage(user.email)) {
      setErrorMessage(DAILY_LIMIT_EXCEEDED_MESSAGE);
      return;
    }

    setIsPlanning(true);
    setErrorMessage("");
    setNoticeMessage("");
    onPlanningStart?.();

    try {
      const response = await fetch("/.netlify/functions/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: "plan_tasks",
          goal,
          roomId: room.id,
          roomName: room.name,
          agents: agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            description: agent.description,
          })),
          userEmail: user.email,
          mode: "economy",
        }),
      });

      const data = await response.json();

      if (!response.ok || !Array.isArray(data.tasks)) {
        throw new Error(data.error || "작업 계획을 만들지 못했습니다.");
      }

      const savedTasks = await saveTasksFromPlan({
        roomId: room.id,
        userEmail: user.email,
        goal,
        tasks: data.tasks,
      });

      incrementLocalUsage(user.email);
      setTasks((previous) => [...savedTasks, ...previous]);
      setNoticeMessage(data.summary || "새 작업 계획이 저장되었습니다.");

      const involvedAgentIds = Array.from(
        new Set(
          data.tasks
            .map((taskItem) => taskItem?.assignedAgentId)
            .filter(Boolean),
        ),
      );

      if (involvedAgentIds.length) {
        triggerCollaboration?.(involvedAgentIds, goal);
      }
    } catch (error) {
      console.error("Failed to create plan", error);
      setErrorMessage(error.message || "작업 계획을 만들지 못했습니다.");
    } finally {
      onPlanningEnd?.();
      setIsPlanning(false);
    }
  };

  const handleRunTask = async (taskItem) => {
    if (!taskItem?.id || !user?.email || !room?.id || runningTaskId) {
      return;
    }

    if (!canSendMessage(user.email)) {
      setErrorMessage(DAILY_LIMIT_EXCEEDED_MESSAGE);
      return;
    }

    setRunningTaskId(taskItem.id);
    setErrorMessage("");
    setNoticeMessage("");
    onTaskRunStart?.(taskItem);
    setTasks((previous) =>
      previous.map((task) =>
        task.id === taskItem.id
          ? {
              ...task,
              status: "running",
              errorMessage: "",
            }
          : task,
      ),
    );

    try {
      await updateTask({
        roomId: room.id,
        userEmail: user.email,
        taskId: taskItem.id,
        updates: {
          status: "running",
          errorMessage: "",
          executedAt: new Date().toISOString(),
          mode: "economy",
        },
      });

      const response = await fetch("/.netlify/functions/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: "execute_task",
          taskItem: {
            title: taskItem.title,
            description: taskItem.description,
            assignedAgentId: taskItem.assignedAgentId,
            expectedOutput: taskItem.expectedOutput || "",
            priority: taskItem.priority || "normal",
            goal: taskItem.goal || "",
          },
          roomId: room.id,
          roomName: room.name,
          memorySummary: buildMemorySummary(tasks, room),
          recentMessages: getRecentContextTasks(tasks),
          userEmail: user.email,
          mode: "economy",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.result) {
        throw new Error(data.error || "작업 실행에 실패했습니다.");
      }

      incrementLocalUsage(user.email);
      const completedAtIso = new Date().toISOString();

      await updateTask({
        roomId: room.id,
        userEmail: user.email,
        taskId: taskItem.id,
        updates: {
          status: "completed",
          result: data.result,
          usage: data.usage ?? null,
          errorMessage: "",
          completedAt: completedAtIso,
          executedAt: completedAtIso,
          mode: "economy",
        },
      });

      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskItem.id
            ? {
                ...task,
                status: "completed",
                result: data.result,
                usage: data.usage ?? null,
                errorMessage: "",
                completedAt: completedAtIso,
                executedAt: completedAtIso,
                mode: "economy",
              }
            : task,
        ),
      );
      setNoticeMessage(`${taskItem.title} 작업 결과가 저장되었습니다.`);
      onTaskRunComplete?.(taskItem);
    } catch (error) {
      console.error("Failed to execute task", error);

      try {
        await updateTask({
          roomId: room.id,
          userEmail: user.email,
          taskId: taskItem.id,
          updates: {
            status: "failed",
            errorMessage: error.message || "작업 실행 중 오류가 발생했습니다.",
          },
        });
      } catch (updateError) {
        console.error("Failed to persist task failure", updateError);
      }

      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskItem.id
            ? {
                ...task,
                status: "failed",
                errorMessage: error.message || "작업 실행 중 오류가 발생했습니다.",
              }
            : task,
        ),
      );
      setErrorMessage(error.message || "작업 실행 중 오류가 발생했습니다.");
      onTaskRunError?.(taskItem);
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleArchiveTask = async (taskItem) => {
    if (!taskItem?.id || !room?.id || !user?.email) {
      return;
    }

    try {
      await archiveTask({
        roomId: room.id,
        userEmail: user.email,
        taskId: taskItem.id,
      });

      setTasks((previous) =>
        previous.map((task) =>
          task.id === taskItem.id ? { ...task, status: "archived" } : task,
        ),
      );
    } catch (error) {
      console.error("Failed to archive task", error);
      setErrorMessage("작업을 보관하지 못했습니다.");
    }
  };

  return (
    <section className={`agent-task-queue ${isCollapsed ? "collapsed" : ""}`}>
      <div className="task-queue-header">
        <div>
          <p className="task-queue-kicker">AI 업무 보드</p>
          <h3>Agent Task Queue</h3>
        </div>
        <button
          type="button"
          className="task-queue-toggle"
          onClick={() => setIsCollapsed((previous) => !previous)}
        >
          {isCollapsed ? "열기" : "접기"}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          <GoalComposer room={room} onCreatePlan={handleCreatePlan} isPlanning={isPlanning} />

          {errorMessage ? <p className="task-queue-error">{errorMessage}</p> : null}
          {noticeMessage ? <p className="task-queue-notice">{noticeMessage}</p> : null}

          <div className="task-queue-list">
            {isHydrating ? (
              <div className="task-empty-state">저장된 작업을 불러오는 중...</div>
            ) : visibleTasks.length ? (
              visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  agent={agentMap[task.assignedAgentId]}
                  statusMeta={TASK_STATUSES[task.status] || TASK_STATUSES.planned}
                  onRun={handleRunTask}
                  onArchive={handleArchiveTask}
                  isRunning={runningTaskId === task.id}
                />
              ))
            ) : (
              <div className="task-empty-state">
                목표를 입력하면 room별 작업 카드가 여기에 저장됩니다.
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_BEHAVIOR_PRESETS,
  MOTION_POINTS,
} from "../data/agentMotionPresets";

const DEFAULT_MOVE_SPEED = 22;
const ARRIVAL_THRESHOLD = 0.45;
const MIN_MOVE_DURATION_MS = 420;
const MAX_MOVE_DURATION_MS = 900;
const ARRIVE_CALLBACK_BUFFER_MS = 60;
const POSITION_LIMITS = {
  minX: 8,
  maxX: 92,
  minY: 10,
  maxY: 90,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPoint(point) {
  return {
    x: clamp(point.x, POSITION_LIMITS.minX, POSITION_LIMITS.maxX),
    y: clamp(point.y, POSITION_LIMITS.minY, POSITION_LIMITS.maxY),
  };
}

function getDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getBaseStatus(agent, activeAgentId) {
  if (agent.id === activeAgentId) {
    return "talking";
  }

  return agent.character?.defaultStatus || "idle";
}

function getSeatPoint(layout) {
  if (!layout) {
    return null;
  }

  return {
    x: layout.seatX ?? layout.x,
    y: layout.seatY ?? layout.y,
  };
}

function createInitialPositions(agents, baseLayout) {
  return agents.reduce((accumulator, agent) => {
    const seatPoint = getSeatPoint(baseLayout[agent.id]);

    if (seatPoint) {
      accumulator[agent.id] = seatPoint;
    }

    return accumulator;
  }, {});
}

function createInitialVisualStates(agents, activeAgentId) {
  return agents.reduce((accumulator, agent) => {
    accumulator[agent.id] = {
      status: getBaseStatus(agent, activeAgentId),
      message: "",
      isMoving: false,
      mode: "base",
    };

    return accumulator;
  }, {});
}

function getCollaborationMessages(agentId, topic) {
  const safeTopic = topic || "협업 플랜";

  const messages = {
    director: [`${safeTopic} 정리 중`, "방향 잡는 중", "팀 브리핑"],
    copy: ["카피 초안 작성", "문장 다듬는 중", "CTA 정리"],
    design: ["비주얼 컨셉 제안", "무드보드 공유", "레이아웃 검토"],
    music: ["사운드 톤 제안", "리듬 체크", "OST 무드 정리"],
    admin: ["일정 정리", "체크리스트 확인", "실행 순서 정리"],
    archive: ["레퍼런스 정리", "기록 포인트 수집", "아카이브 메모"],
  };

  return messages[agentId] || ["협업 중", safeTopic, "조율 중"];
}

function getMoveDurationMs(from, to, speed) {
  const distance = getDistance(from, to);

  if (distance <= ARRIVAL_THRESHOLD) {
    return 0;
  }

  return clamp(
    Math.round((distance / Math.max(speed, 1)) * 1000),
    MIN_MOVE_DURATION_MS,
    MAX_MOVE_DURATION_MS,
  );
}

export function useAgentMotion({
  agents,
  activeAgentId,
  baseLayout,
  isChatLoading = false,
}) {
  const [agentPositions, setAgentPositions] = useState(() =>
    createInitialPositions(agents, baseLayout),
  );
  const [agentVisualStates, setAgentVisualStates] = useState(() =>
    createInitialVisualStates(agents, activeAgentId),
  );

  const positionsRef = useRef(agentPositions);
  const visualStatesRef = useRef(agentVisualStates);
  const timersRef = useRef(new Map());
  const collaborationRef = useRef(null);
  const reduceMotionRef = useRef(false);

  const agentLookup = useMemo(
    () =>
      agents.reduce((accumulator, agent) => {
        accumulator[agent.id] = agent;
        return accumulator;
      }, {}),
    [agents],
  );

  const deskPositions = useMemo(() => {
    const mappedFromLayout = Object.keys(baseLayout).reduce((accumulator, key) => {
      const seatPoint = getSeatPoint(baseLayout[key]);

      if (seatPoint) {
        accumulator[key] = seatPoint;
      }

      return accumulator;
    }, {});

    return {
      ...MOTION_POINTS.desks,
      ...mappedFromLayout,
    };
  }, [baseLayout]);

  useEffect(() => {
    positionsRef.current = agentPositions;
  }, [agentPositions]);

  useEffect(() => {
    visualStatesRef.current = agentVisualStates;
  }, [agentVisualStates]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      reduceMotionRef.current = mediaQuery.matches;
    };

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  const clearAgentTimers = useCallback((agentId) => {
    const existingTimers = timersRef.current.get(agentId);

    if (!existingTimers) {
      return;
    }

    existingTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
      window.clearInterval(timerId);
    });

    timersRef.current.delete(agentId);
  }, []);

  const registerAgentTimer = useCallback((agentId, timerId) => {
    const timers = timersRef.current.get(agentId) || [];
    timers.push(timerId);
    timersRef.current.set(agentId, timers);
  }, []);

  const updateAgentVisualState = useCallback((agentId, updater) => {
    setAgentVisualStates((previous) => {
      const next =
        typeof updater === "function"
          ? updater(previous[agentId] || {})
          : updater;

      const updated = {
        ...previous,
        [agentId]: {
          ...(previous[agentId] || {}),
          ...next,
        },
      };

      visualStatesRef.current = updated;
      return updated;
    });
  }, []);

  const finishMovement = useCallback(
    (agentId, options = {}) => {
      updateAgentVisualState(agentId, {
        status:
          options.onArriveStatus ||
          visualStatesRef.current[agentId]?.status ||
          "idle",
        message:
          options.onArriveMessage !== undefined
            ? options.onArriveMessage
            : visualStatesRef.current[agentId]?.message || "",
        isMoving: false,
        mode: options.onArriveMode || "base",
      });
      options.onArrive?.();
    },
    [updateAgentVisualState],
  );

  const sendAgentToPoint = useCallback(
    (agentId, point, options = {}) => {
      const targetPoint = clampPoint(point);
      const currentPosition =
        positionsRef.current[agentId] ||
        deskPositions[agentId] ||
        targetPoint;
      const {
        speed = DEFAULT_MOVE_SPEED,
        status,
        message,
        mode = "base",
        onArriveStatus,
        onArriveMessage,
        onArriveMode = "base",
        onArrive,
        immediate = false,
        durationMs,
      } = options;
      const movementDuration =
        reduceMotionRef.current || immediate
          ? 0
          : durationMs ?? getMoveDurationMs(currentPosition, targetPoint, speed);

      clearAgentTimers(agentId);

      if (movementDuration === 0) {
        const nextPositions = {
          ...positionsRef.current,
          [agentId]: targetPoint,
        };

        positionsRef.current = nextPositions;
        setAgentPositions(nextPositions);
        finishMovement(agentId, {
          onArriveStatus: onArriveStatus || status,
          onArriveMessage:
            onArriveMessage !== undefined ? onArriveMessage : message,
          onArriveMode,
          onArrive,
        });
        return;
      }

      updateAgentVisualState(agentId, (previous) => ({
        status: status || previous.status || "idle",
        message: message !== undefined ? message : previous.message || "",
        isMoving: true,
        mode,
      }));

      setAgentPositions((previous) => {
        const next = {
          ...previous,
          [agentId]: targetPoint,
        };

        positionsRef.current = next;
        return next;
      });

      const arriveTimer = window.setTimeout(() => {
        finishMovement(agentId, {
          onArriveStatus,
          onArriveMessage,
          onArriveMode,
          onArrive,
        });
      }, movementDuration + ARRIVE_CALLBACK_BUFFER_MS);

      registerAgentTimer(agentId, arriveTimer);
    },
    [
      clearAgentTimers,
      deskPositions,
      finishMovement,
      registerAgentTimer,
      updateAgentVisualState,
    ],
  );

  const sendAgentToDesk = useCallback(
    (agentId, options = {}) => {
      const deskPoint = deskPositions[agentId];

      if (!deskPoint) {
        return;
      }

      sendAgentToPoint(agentId, deskPoint, {
        durationMs: 800,
        ...options,
        onArriveStatus: options.onArriveStatus,
        onArriveMessage:
          options.onArriveMessage !== undefined ? options.onArriveMessage : "",
        onArriveMode: options.onArriveMode || "base",
      });
    },
    [deskPositions, sendAgentToPoint],
  );

  const clearCollaboration = useCallback(() => {
    if (!collaborationRef.current) {
      return;
    }

    collaborationRef.current.intervals.forEach((timerId) =>
      window.clearInterval(timerId),
    );
    collaborationRef.current.timeouts.forEach((timerId) =>
      window.clearTimeout(timerId),
    );

    collaborationRef.current = null;
  }, []);

  const triggerCollaboration = useCallback(
    (agentIds, topic = "협업 플랜") => {
      if (!agentIds.length) {
        return;
      }

      clearCollaboration();

      const slots = [
        MOTION_POINTS.collaborationTable.left,
        MOTION_POINTS.collaborationTable.center,
        MOTION_POINTS.collaborationTable.right,
        MOTION_POINTS.collaborationTable.topLeft,
        MOTION_POINTS.collaborationTable.topRight,
        MOTION_POINTS.collaborationTable.bottomLeft,
        MOTION_POINTS.collaborationTable.bottomRight,
      ];

      const intervals = [];
      const timeouts = [];

      agentIds.forEach((agentId, index) => {
        const messages = getCollaborationMessages(agentId, topic);
        const statusCycle = ["talking", "working", "thinking"];
        const collaborationStatus = statusCycle[index % statusCycle.length];

        sendAgentToPoint(agentId, slots[index % slots.length], {
          mode: "collaboration",
          status: collaborationStatus,
          message: messages[0],
          speed: 26,
          durationMs: 760,
          onArriveStatus: collaborationStatus,
          onArriveMessage: messages[0],
          onArriveMode: "collaboration",
        });

        const bubbleTimer = window.setInterval(() => {
          updateAgentVisualState(agentId, (previous) => {
            const nextIndex =
              ((previous.messageIndex || 0) + 1) % messages.length;
            const nextStatus = statusCycle[nextIndex % statusCycle.length];

            return {
              status: nextStatus,
              message: messages[nextIndex],
              isMoving: false,
              mode: "collaboration",
              messageIndex: nextIndex,
            };
          });
        }, AGENT_BEHAVIOR_PRESETS.collaboration.bubbleIntervalMs);

        intervals.push(bubbleTimer);
      });

      const returnTimer = window.setTimeout(() => {
        agentIds.forEach((agentId) => {
          sendAgentToDesk(agentId, {
            status: "returning",
            message: "곧 갈게요",
            mode: "returning",
            speed: 24,
            durationMs: 800,
            onArriveStatus: agentId === activeAgentId ? "talking" : "idle",
            onArriveMessage: "",
            onArriveMode: "base",
          });
        });

        clearCollaboration();
      }, AGENT_BEHAVIOR_PRESETS.collaboration.durationMs);

      timeouts.push(returnTimer);
      collaborationRef.current = { agentIds, topic, intervals, timeouts };
    },
    [
      activeAgentId,
      clearCollaboration,
      sendAgentToDesk,
      sendAgentToPoint,
      updateAgentVisualState,
    ],
  );

  useEffect(() => {
    setAgentPositions((previous) => {
      const next = { ...previous };

      agents.forEach((agent) => {
        if (!next[agent.id] && baseLayout[agent.id]) {
          next[agent.id] = getSeatPoint(baseLayout[agent.id]);
        }
      });

      positionsRef.current = next;
      return next;
    });

    setAgentVisualStates((previous) => {
      const next = { ...previous };

      agents.forEach((agent) => {
        if (!next[agent.id]) {
          next[agent.id] = {
            status: getBaseStatus(agent, activeAgentId),
            message: "",
            isMoving: false,
            mode: "base",
          };
        }
      });

      visualStatesRef.current = next;
      return next;
    });
  }, [activeAgentId, agents, baseLayout]);

  useEffect(() => {
    setAgentVisualStates((previous) => {
      const next = { ...previous };

      agents.forEach((agent) => {
        const currentState = next[agent.id] || {};

        if (currentState.mode === "collaboration" || currentState.isMoving) {
          return;
        }

        next[agent.id] = {
          ...currentState,
          status: getBaseStatus(agent, activeAgentId),
          message:
            currentState.mode === "base" || !currentState.mode
              ? ""
              : currentState.message || "",
          mode: "base",
        };
      });

      visualStatesRef.current = next;
      return next;
    });
  }, [activeAgentId, agents]);

  useEffect(() => {
    if (!AGENT_BEHAVIOR_PRESETS.idleWander.enabled || reduceMotionRef.current) {
      return undefined;
    }

    const wanderTimer = window.setInterval(() => {
      if (reduceMotionRef.current || collaborationRef.current || isChatLoading) {
        return;
      }

      const eligibleAgents = agents.filter((agent) => {
        const currentState = visualStatesRef.current[agent.id];

        return (
          agent.id !== activeAgentId &&
          !currentState?.isMoving &&
          currentState?.mode !== "collaboration" &&
          currentState?.mode !== "returning"
        );
      });

      if (!eligibleAgents.length) {
        return;
      }

      const selectedAgent =
        eligibleAgents[Math.floor(Math.random() * eligibleAgents.length)];
      const deskPoint = deskPositions[selectedAgent.id];

      if (!deskPoint) {
        return;
      }

      const radius = AGENT_BEHAVIOR_PRESETS.idleWander.radius;
      const wanderPoint = clampPoint({
        x: deskPoint.x + (Math.random() * 2 - 1) * radius,
        y: deskPoint.y + (Math.random() * 2 - 1) * radius,
      });

      sendAgentToPoint(selectedAgent.id, wanderPoint, {
        status: "idle",
        message: "",
        mode: "wander",
        speed: 14,
        durationMs: 720,
        onArriveStatus: "idle",
        onArriveMessage: "",
        onArriveMode: "wander",
      });

      const returnTimer = window.setTimeout(() => {
        sendAgentToDesk(selectedAgent.id, {
          status: "returning",
          message: "곧 갈게요",
          mode: "returning",
          speed: 14,
          durationMs: 800,
          onArriveStatus: getBaseStatus(
            selectedAgent,
            activeAgentId,
          ),
          onArriveMessage: "",
          onArriveMode: "base",
        });
      }, AGENT_BEHAVIOR_PRESETS.idleWander.lingerMs);

      registerAgentTimer(selectedAgent.id, returnTimer);
    }, AGENT_BEHAVIOR_PRESETS.idleWander.intervalMs);

    return () => {
      window.clearInterval(wanderTimer);
    };
  }, [
    activeAgentId,
    agents,
    deskPositions,
    isChatLoading,
    registerAgentTimer,
    sendAgentToDesk,
    sendAgentToPoint,
  ]);

  useEffect(() => {
    if (!activeAgentId || collaborationRef.current?.agentIds.includes(activeAgentId)) {
      return;
    }

    const activeAgent = agentLookup[activeAgentId];

    if (!activeAgent) {
      return;
    }

    sendAgentToDesk(activeAgentId, {
      status: "talking",
      message: "",
      mode: "base",
      speed: 18,
      durationMs: 800,
      onArriveStatus: "talking",
      onArriveMessage: "",
      onArriveMode: "base",
    });
  }, [activeAgentId, agentLookup, sendAgentToDesk]);

  useEffect(() => {
    const timerMap = timersRef.current;

    return () => {
      clearCollaboration();
      timerMap.forEach((timerIds) => {
        timerIds.forEach((timerId) => {
          window.clearTimeout(timerId);
          window.clearInterval(timerId);
        });
      });
    };
  }, [clearCollaboration]);

  return {
    agentPositions,
    agentVisualStates,
    triggerCollaboration,
    sendAgentToDesk,
    sendAgentToPoint,
  };
}

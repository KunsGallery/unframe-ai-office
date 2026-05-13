import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_BEHAVIOR_PRESETS,
  AGENT_VISIT_ROUTES,
  MOTION_POINTS,
} from "../data/agentMotionPresets";
import { MEETING_ROOM } from "../data/pixelOfficeLayout";

const DEFAULT_MOVE_SPEED = 12;
const ARRIVAL_THRESHOLD = 0.45;
const MAX_FRAME_DELTA_SECONDS = 0.05;
const ROAMING_BUBBLES = [
  "자료 확인 중",
  "잠깐 다녀올게요",
  "같이 볼게요",
  "메모 확인",
  "아이디어 공유 중",
];
const COLLAB_INVITE_BUBBLES = [
  "같이 볼까요?",
  "회의실로 모일게요",
  "잠깐 논의해요",
];
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

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomIntBetween(min, max) {
  return Math.round(randomBetween(min, max));
}

function pickRandom(list) {
  if (!list.length) {
    return null;
  }

  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const next = [...list];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }

  return next;
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

function withOffset(point, spreadX = 4, spreadY = 3, yBias = 0) {
  return clampPoint({
    x: point.x + randomBetween(-spreadX, spreadX),
    y: point.y + randomBetween(-spreadY, spreadY) + yBias,
  });
}

function waitFor(ms, registerTimer) {
  return new Promise((resolve) => {
    const timerId = window.setTimeout(resolve, ms);
    registerTimer(timerId);
  });
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
  const agentTargetsRef = useRef({});
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const timersRef = useRef(new Map());
  const reduceMotionRef = useRef(false);
  const roamAvailableAtRef = useRef({});
  const collaborationRef = useRef(null);
  const collaborationTokenRef = useRef(null);

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
      const patch =
        typeof updater === "function"
          ? updater(previous[agentId] || {})
          : updater;

      const updated = {
        ...previous,
        [agentId]: {
          ...(previous[agentId] || {}),
          ...patch,
        },
      };

      visualStatesRef.current = updated;
      return updated;
    });
  }, []);

  const scheduleMessageClear = useCallback(
    (agentId, mode, delayMs) => {
      if (!delayMs) {
        return;
      }

      const clearTimer = window.setTimeout(() => {
        updateAgentVisualState(agentId, (previous) => {
          if (previous.isMoving || previous.mode !== mode) {
            return previous;
          }

          return {
            message: "",
          };
        });
      }, delayMs);

      registerAgentTimer(agentId, clearTimer);
    },
    [registerAgentTimer, updateAgentVisualState],
  );

  const finishMovement = useCallback(
    (targetEntry) => {
      const {
        agentId,
        onArrive,
        onArriveStatus,
        onArriveMessage,
        onArriveMode = "base",
        clearMessageAfterMs = 0,
      } = targetEntry;

      const finalMessage =
        onArriveMessage !== undefined
          ? onArriveMessage
          : visualStatesRef.current[agentId]?.message || "";

      updateAgentVisualState(agentId, {
        status:
          onArriveStatus ||
          visualStatesRef.current[agentId]?.status ||
          "idle",
        message: finalMessage,
        isMoving: false,
        mode: onArriveMode,
      });

      scheduleMessageClear(agentId, onArriveMode, clearMessageAfterMs);
      onArrive?.();
    },
    [scheduleMessageClear, updateAgentVisualState],
  );

  const startAnimationLoop = useCallback(() => {
    if (animationFrameRef.current || reduceMotionRef.current) {
      return;
    }

    const step = (time) => {
      if (lastFrameTimeRef.current == null) {
        lastFrameTimeRef.current = time;
      }

      const deltaSeconds = Math.min(
        (time - lastFrameTimeRef.current) / 1000,
        MAX_FRAME_DELTA_SECONDS,
      );
      lastFrameTimeRef.current = time;

      const targets = agentTargetsRef.current;
      const targetIds = Object.keys(targets);

      if (!targetIds.length) {
        animationFrameRef.current = null;
        lastFrameTimeRef.current = null;
        return;
      }

      const arrivals = [];

      setAgentPositions((previous) => {
        let hasChanges = false;
        const next = { ...previous };

        targetIds.forEach((agentId) => {
          const targetEntry = targets[agentId];
          const currentPosition = next[agentId] || targetEntry.target;
          const dx = targetEntry.target.x - currentPosition.x;
          const dy = targetEntry.target.y - currentPosition.y;
          const distance = Math.hypot(dx, dy);

          if (distance <= ARRIVAL_THRESHOLD) {
            next[agentId] = targetEntry.target;
            arrivals.push(targetEntry);
            delete targets[agentId];
            hasChanges = true;
            return;
          }

          const stepDistance = Math.min(distance, targetEntry.speed * deltaSeconds);

          if (stepDistance >= distance) {
            next[agentId] = targetEntry.target;
            arrivals.push(targetEntry);
            delete targets[agentId];
            hasChanges = true;
            return;
          }

          next[agentId] = {
            x: currentPosition.x + (dx / distance) * stepDistance,
            y: currentPosition.y + (dy / distance) * stepDistance,
          };
          hasChanges = true;
        });

        positionsRef.current = next;
        return hasChanges ? next : previous;
      });

      arrivals.forEach((entry) => finishMovement(entry));
      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, [finishMovement]);

  const registerCollaborationHandle = useCallback((timerId, type = "timeout") => {
    if (!collaborationRef.current) {
      return;
    }

    collaborationRef.current[type === "interval" ? "intervals" : "timeouts"].push(timerId);
  }, []);

  const clearCollaboration = useCallback(() => {
    if (!collaborationRef.current) {
      collaborationTokenRef.current = null;
      return;
    }

    collaborationRef.current.intervals.forEach((timerId) =>
      window.clearInterval(timerId),
    );
    collaborationRef.current.timeouts.forEach((timerId) =>
      window.clearTimeout(timerId),
    );

    collaborationRef.current = null;
    collaborationTokenRef.current = null;
  }, []);

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
        stayMs = 0,
        clearMessageAfterMs = 0,
        immediate = false,
      } = options;

      clearAgentTimers(agentId);
      roamAvailableAtRef.current[agentId] = Date.now() + stayMs;

      if (reduceMotionRef.current || immediate) {
        const nextPositions = {
          ...positionsRef.current,
          [agentId]: targetPoint,
        };

        positionsRef.current = nextPositions;
        setAgentPositions(nextPositions);
        finishMovement({
          agentId,
          onArrive,
          onArriveStatus: onArriveStatus || status,
          onArriveMessage:
            onArriveMessage !== undefined ? onArriveMessage : message,
          onArriveMode,
          clearMessageAfterMs,
        });
        return;
      }

      updateAgentVisualState(agentId, (previous) => ({
        status: status || previous.status || "idle",
        message: message !== undefined ? message : previous.message || "",
        isMoving: true,
        mode,
      }));

      agentTargetsRef.current[agentId] = {
        agentId,
        target: targetPoint,
        speed,
        onArrive,
        onArriveStatus,
        onArriveMessage,
        onArriveMode,
        clearMessageAfterMs,
        startedFrom: currentPosition,
      };

      startAnimationLoop();
    },
    [
      clearAgentTimers,
      deskPositions,
      finishMovement,
      startAnimationLoop,
      updateAgentVisualState,
    ],
  );

  const sendAgentToDesk = useCallback(
    (agentId, options = {}) => {
      const deskPoint = deskPositions[agentId];

      if (!deskPoint) {
        return;
      }

      const reason = options.reason || "auto";
      const agent = agentLookup[agentId];
      const baseStatus = agent ? getBaseStatus(agent, activeAgentId) : "idle";

      sendAgentToPoint(agentId, deskPoint, {
        speed:
          options.speed ||
          (reason === "user-request" ? 18 : reason === "collaboration-end" ? 14 : 12),
        status:
          reason === "user-request"
            ? "returning"
            : options.status || baseStatus,
        message:
          reason === "user-request"
            ? "곧 갈게요"
            : options.message ?? "",
        mode:
          reason === "user-request"
            ? "returning"
            : options.mode || "base",
        onArriveStatus: options.onArriveStatus || baseStatus,
        onArriveMessage:
          options.onArriveMessage !== undefined ? options.onArriveMessage : "",
        onArriveMode: options.onArriveMode || "base",
        onArrive: options.onArrive,
        stayMs: options.stayMs || 0,
        immediate: options.immediate,
      });
    },
    [activeAgentId, agentLookup, deskPositions, sendAgentToPoint],
  );

  const pickRoamingTarget = useCallback(
    (agentId) => {
      const roamingPreset = AGENT_BEHAVIOR_PRESETS.officeRoaming;
      const roll = Math.random();
      const visitRoutes = AGENT_VISIT_ROUTES[agentId] || [];
      const hallwayPoints = Object.values(MOTION_POINTS.hallway);
      const loungePoints = Object.values(MOTION_POINTS.lounge);

      if (roll < roamingPreset.visitOtherDeskProbability && visitRoutes.length) {
        const targetAgentId = pickRandom(visitRoutes);
        const targetDesk = deskPositions[targetAgentId];

        if (targetDesk) {
          return {
            point: withOffset(targetDesk, 3.5, 2.5, 1.2),
            speed: randomBetween(10, 12),
          };
        }
      }

      if (
        roll <
        roamingPreset.visitOtherDeskProbability + roamingPreset.hallwayProbability
      ) {
        const target = pickRandom(hallwayPoints);

        if (target) {
          return {
            point: withOffset(target, 3, 2, 0),
            speed: randomBetween(10, 12),
          };
        }
      }

      if (
        roll <
        roamingPreset.visitOtherDeskProbability +
          roamingPreset.hallwayProbability +
          roamingPreset.loungeProbability
      ) {
        const target = pickRandom(loungePoints);

        if (target) {
          return {
            point: withOffset(target, 2.5, 2, 0.5),
            speed: randomBetween(10, 11.5),
          };
        }
      }

      if (
        roll >
          1 - roamingPreset.returnHomeProbability &&
        deskPositions[agentId]
      ) {
        return {
          point: withOffset(deskPositions[agentId], 2, 1.5, 0),
          speed: randomBetween(10, 11.5),
        };
      }

      return {
        point: withOffset(MEETING_ROOM.entrance, 2, 2, 0),
        speed: randomBetween(10, 12),
      };
    },
    [deskPositions],
  );

  const triggerCollaboration = useCallback(
    (agentIds, topic = "협업 플랜") => {
      if (!agentIds.length) {
        return;
      }

      clearCollaboration();
      const token = Symbol("collaboration");
      collaborationTokenRef.current = token;
      collaborationRef.current = {
        agentIds,
        topic,
        intervals: [],
        timeouts: [],
      };

      const isActiveSequence = () => collaborationTokenRef.current === token;
      const wait = (ms) => waitFor(ms, (timerId) => registerCollaborationHandle(timerId));
      const roomSeats = [
        MEETING_ROOM.seats.lead,
        MEETING_ROOM.seats.topLeft,
        MEETING_ROOM.seats.topRight,
        MEETING_ROOM.seats.bottomLeft,
        MEETING_ROOM.seats.bottomRight,
        MEETING_ROOM.seats.bottom,
      ];

      void (async () => {
        const leadAgentId = agentIds[0];
        const collaboratorIds = agentIds.slice(1);

        collaboratorIds.forEach((agentId) => {
          updateAgentVisualState(agentId, {
            status: "thinking",
            message: "",
            isMoving: false,
            mode: "coordination",
          });
        });

        for (const collaboratorId of collaboratorIds) {
          if (!isActiveSequence()) {
            return;
          }

          const invitePoint = withOffset(deskPositions[collaboratorId], 3, 2, 1);
          const inviteBubble = pickRandom(COLLAB_INVITE_BUBBLES) || "회의실로 모일게요";

          sendAgentToPoint(leadAgentId, invitePoint, {
            status: "working",
            message: inviteBubble,
            mode: "coordination",
            speed: 14,
            onArriveStatus: "working",
            onArriveMessage: inviteBubble,
            onArriveMode: "coordination",
            clearMessageAfterMs: 1700,
          });

          updateAgentVisualState(collaboratorId, {
            status: "thinking",
            message: "회의실에서 볼게요",
            isMoving: false,
            mode: "coordination",
          });

          await wait(randomIntBetween(1200, 1600));
        }

        if (!isActiveSequence()) {
          return;
        }

        agentIds.forEach((agentId, index) => {
          const seatPoint = roomSeats[index] || roomSeats[roomSeats.length - 1];
          const collaborationMessages = getCollaborationMessages(agentId, topic);
          const isLead = index === 0;

          sendAgentToPoint(agentId, seatPoint, {
            status: isLead ? "talking" : "working",
            message: isLead ? "회의실에서 정리할게요" : "",
            mode: "collaboration",
            speed: 14,
            onArriveStatus: isLead ? "talking" : "working",
            onArriveMessage: isLead ? collaborationMessages[0] : "",
            onArriveMode: "collaboration",
          });
        });

        await wait(randomIntBetween(1400, 1800));

        if (!isActiveSequence()) {
          return;
        }

        agentIds.forEach((agentId, index) => {
          const messages = getCollaborationMessages(agentId, topic);
          const statusCycle = ["talking", "working", "thinking"];
          const initialStatus = statusCycle[index % statusCycle.length];

          updateAgentVisualState(agentId, {
            status: initialStatus,
            message: messages[0],
            isMoving: false,
            mode: "collaboration",
            messageIndex: 0,
          });

          const intervalId = window.setInterval(() => {
            updateAgentVisualState(agentId, (previous) => {
              const nextIndex = ((previous.messageIndex || 0) + 1) % messages.length;
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

          registerCollaborationHandle(intervalId, "interval");
        });

        await wait(
          randomIntBetween(
            AGENT_BEHAVIOR_PRESETS.collaboration.durationMs - 1000,
            AGENT_BEHAVIOR_PRESETS.collaboration.durationMs + 1000,
          ),
        );

        if (!isActiveSequence()) {
          return;
        }

        clearCollaboration();

        agentIds.forEach((agentId) => {
          sendAgentToDesk(agentId, {
            reason: "collaboration-end",
            onArriveStatus: agentId === activeAgentId ? "talking" : "idle",
            onArriveMessage: "",
            onArriveMode: "base",
          });
        });
      })();
    },
    [
      activeAgentId,
      clearCollaboration,
      deskPositions,
      registerCollaborationHandle,
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

        if (currentState.mode === "returning") {
          next[agent.id] = {
            ...currentState,
            status: getBaseStatus(agent, activeAgentId),
            message: "",
            mode: "base",
          };
          return;
        }

        if (!currentState.status) {
          next[agent.id] = {
            ...currentState,
            status: getBaseStatus(agent, activeAgentId),
          };
        }
      });

      visualStatesRef.current = next;
      return next;
    });
  }, [activeAgentId, agents]);

  useEffect(() => {
    if (!AGENT_BEHAVIOR_PRESETS.officeRoaming.enabled || reduceMotionRef.current) {
      return undefined;
    }

    const roamingTimer = window.setInterval(() => {
      if (reduceMotionRef.current || collaborationRef.current || isChatLoading) {
        return;
      }

      const now = Date.now();
      const eligibleAgents = agents.filter((agent) => {
        const currentState = visualStatesRef.current[agent.id];
        const nextAvailableAt = roamAvailableAtRef.current[agent.id] || 0;

        return (
          agent.id !== activeAgentId &&
          !currentState?.isMoving &&
          currentState?.mode !== "collaboration" &&
          currentState?.mode !== "returning" &&
          now >= nextAvailableAt
        );
      });

      if (!eligibleAgents.length) {
        return;
      }

      const shuffledAgents = shuffle(eligibleAgents);
      const maxAgents = Math.min(
        shuffledAgents.length,
        AGENT_BEHAVIOR_PRESETS.officeRoaming.maxAgentsPerTick,
      );
      const moveCount = Math.min(maxAgents, Math.random() < 0.55 ? 1 : 2);

      shuffledAgents.slice(0, moveCount).forEach((agent) => {
        if (Math.random() > AGENT_BEHAVIOR_PRESETS.officeRoaming.moveProbability) {
          roamAvailableAtRef.current[agent.id] =
            Date.now() + randomIntBetween(2800, 5400);
          return;
        }

        const target = pickRoamingTarget(agent.id);
        const shouldShowBubble = Math.random() < 0.3;
        const roamingMessage = shouldShowBubble ? pickRandom(ROAMING_BUBBLES) : "";

        sendAgentToPoint(agent.id, target.point, {
          status: "idle",
          message: roamingMessage,
          mode: "roaming",
          speed: target.speed,
          onArriveStatus: "idle",
          onArriveMessage: roamingMessage,
          onArriveMode: "roaming",
          stayMs: randomIntBetween(
            AGENT_BEHAVIOR_PRESETS.officeRoaming.minStayMs,
            AGENT_BEHAVIOR_PRESETS.officeRoaming.maxStayMs,
          ),
          clearMessageAfterMs: roamingMessage
            ? randomIntBetween(1800, 2600)
            : 0,
        });
      });
    }, AGENT_BEHAVIOR_PRESETS.officeRoaming.intervalMs);

    return () => {
      window.clearInterval(roamingTimer);
    };
  }, [
    activeAgentId,
    agents,
    isChatLoading,
    pickRoamingTarget,
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
      reason: "auto",
      onArriveStatus: "talking",
      onArriveMessage: "",
      onArriveMode: "base",
    });
  }, [activeAgentId, agentLookup, sendAgentToDesk]);

  useEffect(() => {
    const agentTargets = agentTargetsRef.current;
    const timerMap = timersRef.current;

    return () => {
      clearCollaboration();

      Object.values(agentTargets).forEach((targetEntry) => {
        targetEntry.onArrive = null;
      });

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

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

import { useCallback, useEffect, useMemo } from "react";
import { AGENT_STATUSES } from "../data/agentStatuses";
import {
  AGENT_LAYOUT,
  MEETING_ROOM,
  OFFICE_OBJECTS,
} from "../data/pixelOfficeLayout";
import { useAgentMotion } from "../hooks/useAgentMotion";
import AgentActivityPanel from "./AgentActivityPanel";
import OfficeAgent from "./OfficeAgent";
import PlayerAvatar from "./PlayerAvatar";
import { usePlayerMovement } from "../hooks/usePlayerMovement";

const DEBUG_HIT_AREAS = false;
const DESK_HIT_RADIUS = 12;
const DESK_RETURN_THRESHOLD = 1.25;
const DEBUG_AGENT_MOTION = import.meta.env.DEV && false;

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target?.isContentEditable
  );
}

function getDistance(from, to) {
  return Math.hypot(from.x - to.x, from.y - to.y);
}

function getAgentSeatPosition(layout) {
  if (!layout) {
    return null;
  }

  return {
    x: layout.seatX ?? layout.x,
    y: layout.seatY ?? layout.y,
  };
}

function getNearestCharacterTarget(playerPosition, agents, agentPositions) {
  let nearest = null;

  for (const agent of agents) {
    const baseLayout = AGENT_LAYOUT[agent.id];
    const layout = agentPositions[agent.id] || getAgentSeatPosition(baseLayout);

    if (!layout || !baseLayout) {
      continue;
    }

    const distance = getDistance(playerPosition, layout);
    const hitRadius = baseLayout.hitRadius || 9;

    if (distance <= hitRadius && (!nearest || distance < nearest.distance)) {
      nearest = { agent, distance };
    }
  }

  return nearest;
}

function getNearestInteractionTarget(playerPosition, agents, agentPositions) {
  let nearest = null;

  for (const agent of agents) {
    const layout = AGENT_LAYOUT[agent.id];
    const currentPosition = agentPositions[agent.id] || getAgentSeatPosition(layout);

    if (!layout || !currentPosition) {
      continue;
    }

    const characterDistance = getDistance(playerPosition, currentPosition);
    const deskDistance = Math.min(
      getDistance(playerPosition, { x: layout.deskX, y: layout.deskY }),
      getDistance(playerPosition, { x: layout.seatX, y: layout.seatY }),
    );

    if (
      characterDistance <= (layout.hitRadius || 9) &&
      (!nearest || characterDistance < nearest.distance)
    ) {
      nearest = {
        agent,
        source: "character",
        distance: characterDistance,
      };
    }

    if (deskDistance <= DESK_HIT_RADIUS && (!nearest || deskDistance < nearest.distance)) {
      nearest = {
        agent,
        source: "desk",
        distance: deskDistance,
      };
    }
  }

  return nearest;
}

function isAgentAwayFromDesk(agentId, agentPositions) {
  const layout = AGENT_LAYOUT[agentId];
  const currentPosition = agentPositions[agentId] || getAgentSeatPosition(layout);

  if (!layout || !currentPosition) {
    return false;
  }

  return (
    getDistance(currentPosition, { x: layout.seatX, y: layout.seatY }) >
    DESK_RETURN_THRESHOLD
  );
}

function getAgentVisualStatus(agentId, activeAgentId, nearestCharacterId) {
  if (agentId === activeAgentId) {
    return "talking";
  }

  if (agentId === nearestCharacterId) {
    return "waiting";
  }

  return "idle";
}

export default function OfficeMap({
  agents,
  activeAgentId,
  onSelectAgent,
  user,
  room,
  onMotionApiReady,
}) {
  const activeAgent =
    agents.find((agent) => agent.id === activeAgentId) || agents[0];

  const { position, isMoving } = usePlayerMovement({ x: 50, y: 86 });

  const {
    agentPositions,
    agentVisualStates,
    triggerCollaboration,
    endCollaboration,
    sendAgentToDesk,
    sendAgentToPoint,
  } = useAgentMotion({
    agents,
    activeAgentId,
    baseLayout: AGENT_LAYOUT,
  });

  const nearestCharacter = useMemo(
    () => getNearestCharacterTarget(position, agents, agentPositions),
    [agentPositions, agents, position],
  );

  const nearestInteractionTarget = useMemo(
    () => getNearestInteractionTarget(position, agents, agentPositions),
    [agentPositions, agents, position],
  );

  const nearestCharacterId = nearestCharacter?.agent?.id || null;
  const nearestInteractionAgentId = nearestInteractionTarget?.agent?.id || null;
  const activeStatus = AGENT_STATUSES.talking;

  const visualStates = useMemo(() => {
    return agents.reduce((accumulator, agent) => {
      const motionState = agentVisualStates[agent.id] || {};
      const baseStatus = getAgentVisualStatus(
        agent.id,
        activeAgentId,
        nearestCharacterId,
      );

      accumulator[agent.id] = {
        ...motionState,
        status:
          motionState.mode && motionState.mode !== "base"
            ? motionState.status
            : motionState.isMoving
              ? motionState.status || baseStatus
              : baseStatus,
        message: motionState.message || "",
      };

      return accumulator;
    }, {});
  }, [activeAgentId, agentVisualStates, agents, nearestCharacterId]);

  const handleTaskRunStart = useCallback((taskItem) => {
    const involvedAgentIds = Array.from(
      new Set(["director", taskItem?.assignedAgentId].filter(Boolean)),
    );

    if (involvedAgentIds.length > 1) {
      triggerCollaboration(involvedAgentIds, taskItem?.title || "작업 실행");
      return;
    }

    sendAgentToPoint(involvedAgentIds[0], MEETING_ROOM.seats.lead, {
      status: "working",
      message: "작업 정리 중",
      mode: "task",
      speed: 14,
      onArriveStatus: "working",
      onArriveMessage: "작업 정리 중",
      onArriveMode: "task",
    });
  }, [sendAgentToPoint, triggerCollaboration]);

  const handleTaskRunEnd = useCallback((taskItem) => {
    const involvedAgentIds = Array.from(
      new Set(["director", taskItem?.assignedAgentId].filter(Boolean)),
    );

    if (!involvedAgentIds.length) {
      return;
    }

    if (involvedAgentIds.length > 1) {
      endCollaboration(involvedAgentIds);
      return;
    }

    sendAgentToDesk(involvedAgentIds[0], {
      reason: "collaboration-end",
      onArriveStatus:
        involvedAgentIds[0] === activeAgentId ? "talking" : "idle",
      onArriveMessage: "",
      onArriveMode: "base",
    });
  }, [activeAgentId, endCollaboration, sendAgentToDesk]);

  useEffect(() => {
    onMotionApiReady?.({
      triggerCollaboration,
      sendAgentToDesk,
      sendAgentToPoint,
      handleTaskRunStart,
      handleTaskRunEnd,
    });
  }, [
    handleTaskRunEnd,
    handleTaskRunStart,
    onMotionApiReady,
    sendAgentToDesk,
    sendAgentToPoint,
    triggerCollaboration,
  ]);

  useEffect(() => {
    return () => {
      onMotionApiReady?.(null);
    };
  }, [onMotionApiReady]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (!nearestInteractionTarget?.agent?.id) {
        return;
      }

      event.preventDefault();

      if (
        nearestInteractionTarget.source === "desk" &&
        isAgentAwayFromDesk(nearestInteractionTarget.agent.id, agentPositions)
      ) {
        sendAgentToDesk(nearestInteractionTarget.agent.id, {
          reason: "user-request",
          onArriveStatus: "talking",
          onArriveMessage: "",
          onArriveMode: "base",
          onArrive: () => onSelectAgent(nearestInteractionTarget.agent.id),
        });
        return;
      }

      onSelectAgent(nearestInteractionTarget.agent.id);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [agentPositions, nearestInteractionTarget, onSelectAgent, sendAgentToDesk]);

  return (
    <section className={`office-map-shell theme-${room.theme}`}>
      <div className="pixel-office-header">
        <div>
          <p className="eyebrow">PROJECT ROOM</p>
          <h2>
            {room.emoji} {room.name}
          </h2>
          <p>{room.description}</p>
        </div>

        <div className="pixel-office-guide">
          <span className="guide-desktop">
            방향키·WASD·ㅈㅁㄴㅇ 이동 · 자리나 AI 앞에서 Enter
          </span>
          <span className="guide-mobile">
            AI 직원을 터치해 대화할 수 있습니다.
          </span>
        </div>
      </div>

      <div className="pixel-office-frame">
        <div className="pixel-office-map">
          <div className="pixel-top-wall">
            <div className="pixel-window window-1" />
            <div className="pixel-window window-2" />
            <div className="pixel-window window-3" />
          </div>

          <div className="pixel-object-layer" aria-hidden="true">
            {OFFICE_OBJECTS.map((object) => (
              <div
                key={object.id}
                className={`pixel-object object-${object.type} object-${object.id}`}
                style={{
                  left: `${object.x}%`,
                  top: `${object.y}%`,
                  width: object.width ? `${object.width}%` : undefined,
                }}
              >
                {object.label ? (
                  <span className="pixel-object-label">{object.label}</span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="pixel-map-floor">
            <div className="pixel-grid" />

            <div className="pixel-floor-content">
              <div
                className="meeting-room-object"
                style={{
                  left: `${MEETING_ROOM.x}%`,
                  top: `${MEETING_ROOM.y}%`,
                  width: `${MEETING_ROOM.width}%`,
                  height: `${MEETING_ROOM.height}%`,
                }}
                aria-hidden="true"
              >
                <div className="meeting-room-label">
                  {MEETING_ROOM.label}
                </div>
                <div className="meeting-room-door" />
                <div className="meeting-table" />
                <div className="meeting-chair chair-1" />
                <div className="meeting-chair chair-2" />
                <div className="meeting-chair chair-3" />
                <div className="meeting-chair chair-4" />
              </div>

              <div className="pixel-map-status">
                <span>현재 선택</span>
                <strong>{activeAgent.name}</strong>
                <em>{activeStatus.label}</em>
              </div>

              {agents.map((agent) => {
                const layout = AGENT_LAYOUT[agent.id];

                if (!layout) {
                  return null;
                }

                return (
                  <div
                    key={`${agent.id}-desk`}
                    className={`agent-desk-object row-${layout.row}`}
                    style={{
                      left: `${layout.deskX}%`,
                      top: `${layout.deskY}%`,
                      "--desk-accent":
                        agent.character?.accentColor || agent.color,
                    }}
                  >
                    <div className="desk-label">{agent.name}</div>
                    <div className="desk-surface">
                      <div className="desk-computer" />
                      <div className="desk-keyboard" />
                    </div>
                    <div className="desk-chair" />
                  </div>
                );
              })}

              {DEBUG_HIT_AREAS &&
                agents.map((agent) => {
                  const baseLayout = AGENT_LAYOUT[agent.id];
                  const layout =
                    agentPositions[agent.id] ||
                    getAgentSeatPosition(baseLayout);
                  const hitRadius = baseLayout?.hitRadius || 9;

                  if (!layout) {
                    return null;
                  }

                  return (
                    <div
                      key={`${agent.id}-hit`}
                      className="pixel-hit-area"
                      style={{
                        left: `${layout.x}%`,
                        top: `${layout.y}%`,
                        width: `${hitRadius * 2}%`,
                        height: `${hitRadius * 2}%`,
                      }}
                    />
                  );
                })}

              {agents.map((agent) => {
                const layout =
                  agentPositions[agent.id] ||
                  getAgentSeatPosition(AGENT_LAYOUT[agent.id]);
                const visualState = visualStates[agent.id];

                if (!layout) {
                  return null;
                }

                return (
                  <OfficeAgent
                    key={agent.id}
                    agent={agent}
                    position={layout}
                    status={
                      visualState?.status ||
                      getAgentVisualStatus(
                        agent.id,
                        activeAgentId,
                        nearestCharacterId,
                      )
                    }
                    message={visualState?.message}
                    isMoving={visualState?.isMoving}
                    mode={visualState?.mode}
                    isActive={agent.id === activeAgentId}
                    isNearby={nearestCharacterId === agent.id}
                    debugPosition={DEBUG_AGENT_MOTION ? layout : null}
                    onClick={() => onSelectAgent(agent.id)}
                  />
                );
              })}

              <PlayerAvatar
                user={user}
                position={position}
                isMoving={isMoving}
                isNearAgent={Boolean(nearestInteractionTarget)}
                nearestAgentName={nearestInteractionTarget?.agent?.name}
              />
            </div>
          </div>
        </div>
      </div>

      <AgentActivityPanel
        agents={agents}
        agentVisualStates={visualStates}
        activeAgentId={activeAgentId}
        nearestAgentId={nearestInteractionAgentId}
      />

      {import.meta.env.DEV ? (
        <button
          type="button"
          className="debug-collab-button"
          onClick={() =>
            triggerCollaboration(
              ["director", "copy", "design"],
              "전시 홍보 플랜",
            )
          }
        >
          협업 테스트
        </button>
      ) : null}

      <div className="office-map-help">
        <span>
          AI 현재 위치와 데스크 위치를 함께 감지해 Enter 상호작용을 처리합니다.
        </span>
        <span>
          자리 비움 상태의 AI는 자기 데스크로 돌아온 뒤 대화가 시작됩니다.
        </span>
      </div>
    </section>
  );
}

import { useMemo, useState } from "react";
import { AGENT_SPRITES } from "../data/agentSprites";
import { AGENT_STATUSES, STATUS_CLASS_MAP } from "../data/agentStatuses";

export default function OfficeAgent({
  agent,
  status,
  message,
  isMoving,
  mode,
  isActive,
  isNearby,
  debugPosition,
  onClick,
  position,
}) {
  const character = agent.character || {};
  const outfit = character.outfit || "navy";
  const body = character.body || "director";
  const spriteKey = character.spriteKey || "agent-generic";
  const spriteMeta = AGENT_SPRITES[agent.id];
  const [failedSpritePath, setFailedSpritePath] = useState(null);
  const statusMeta = AGENT_STATUSES[status] || AGENT_STATUSES.idle;
  const statusClass = STATUS_CLASS_MAP[status] || STATUS_CLASS_MAP.idle;
  const spriteAssetPath = useMemo(() => {
    if (!spriteMeta?.usesExternalAsset) {
      return null;
    }

    return (
      spriteMeta.animations?.[status] ||
      spriteMeta.assetPath ||
      spriteMeta.animations?.idle ||
      null
    );
  }, [spriteMeta, status]);
  const shouldUseSpriteImage =
    Boolean(spriteMeta?.usesExternalAsset) &&
    Boolean(spriteAssetPath) &&
    failedSpritePath !== spriteAssetPath;
  const bubbleText = message || statusMeta.bubble || "";
  const roleLabel = character.label || agent.role;

  return (
    <button
      type="button"
      className={`pixel-agent pixel-agent-character ${statusClass} status-${status} ${isMoving ? "moving" : ""} ${mode === "collaboration" ? "collaboration-mode" : ""} ${mode === "returning" || status === "returning" ? "returning" : ""} outfit-${outfit} ${isActive ? "active" : ""} ${isNearby ? "nearby" : ""}`}
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        "--agent-color": character.accentColor || agent.color,
      }}
      onClick={onClick}
      aria-label={`${agent.name}와 대화하기 (${statusMeta.label})`}
    >
      {bubbleText ? <div className="agent-bubble">{bubbleText}</div> : null}

      <div className="agent-shadow" aria-hidden="true" />

      <div className="agent-sprite-wrap" aria-hidden="true">
        <div
          className={`pixel-ai-character body-${body} sprite-${spriteKey} outfit-${outfit} ${shouldUseSpriteImage ? "has-external-sprite" : ""}`}
        >
          {shouldUseSpriteImage ? (
            <img
              className="pixel-ai-sprite-img"
              src={spriteAssetPath}
              alt=""
              draggable="false"
              onError={() => setFailedSpritePath(spriteAssetPath)}
            />
          ) : (
            <>
              <div className="pixel-ai-head">
                {spriteMeta?.fallbackEmoji || character.avatar || agent.emoji}
              </div>
              <div className="pixel-ai-body" />
            </>
          )}
        </div>
      </div>

      <div className="agent-nameplate">{agent.name}</div>
      <div className="agent-roleplate">{roleLabel}</div>
      {debugPosition ? (
        <div className="agent-debug">
          {debugPosition.x.toFixed(1)}, {debugPosition.y.toFixed(1)}
        </div>
      ) : null}
    </button>
  );
}

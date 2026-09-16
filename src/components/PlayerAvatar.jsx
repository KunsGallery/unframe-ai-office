import {
  getUserDisplayLabel,
  isOwnerEmail,
  isSoyeonEmail,
} from "../data/userToneProfiles";

function getPlayerVariant(user) {
  const userEmail =
    typeof user === "string" ? user : user?.email || user?.userEmail || "";

  if (typeof userEmail !== "string" || !userEmail.trim()) {
    return "default";
  }

  if (isOwnerEmail(userEmail)) {
    return "representative";
  }

  if (isSoyeonEmail(userEmail)) {
    return "staff-soyeon";
  }

  return "default";
}

export default function PlayerAvatar({
  user,
  position,
  isMoving,
  isNearAgent,
  nearestAgentName,
  speechBubble,
}) {
  const isOwner = isOwnerEmail(user);
  const label = getUserDisplayLabel(user);
  const variant = getPlayerVariant(user);

  return (
    <div
      className={`pixel-player ${isMoving ? "moving" : ""} ${isNearAgent ? "near-agent" : ""} ${isOwner ? "owner" : "staff"} variant-${variant}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      {isNearAgent && (
        <div className="pixel-player-hint">
          {nearestAgentName ? `${nearestAgentName}와 대화 가능` : "Talk"}
        </div>
      )}

      {speechBubble && <div className="pixel-player-speech-bubble">{speechBubble}</div>}

      <div className="pixel-player-shadow" aria-hidden="true" />

      <div className="pixel-player-body character-sprite-body" aria-hidden="true">
        <img
          className="character-sprite-image"
          src={isOwner ? "/assets/chat-characters/owner-puppy.png" : "/assets/chat-characters/staff-bunny.png"}
          alt=""
        />
      </div>

      <div className="pixel-player-name">{label}</div>
    </div>
  );
}

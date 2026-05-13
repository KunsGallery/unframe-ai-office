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

      <div className="pixel-player-shadow" aria-hidden="true" />

      <div className="pixel-player-body" aria-hidden="true">
        <div className="pixel-player-head" />
        <div className="pixel-player-outfit" />
      </div>

      <div className="pixel-player-name">{label}</div>
    </div>
  );
}

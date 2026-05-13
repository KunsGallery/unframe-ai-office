const OWNER_EMAIL = "gallerykuns@gmail.com";

export default function PlayerAvatar({
  user,
  position,
  isMoving,
  isNearAgent,
  nearestAgentName,
}) {
  const isOwner = user?.email === OWNER_EMAIL;
  const emoji = isOwner ? "🧑‍💼" : "🙂";
  const label = isOwner ? "대표님" : user?.displayName || "Staff";

  return (
    <div
      className={`pixel-player ${isMoving ? "moving" : ""} ${isNearAgent ? "near-agent" : ""} ${isOwner ? "owner" : "staff"}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      {isNearAgent && (
        <div className="pixel-player-hint">
          {nearestAgentName ? `${nearestAgentName}와 대화 가능` : "Talk"}
        </div>
      )}

      <div className="pixel-player-shadow" aria-hidden="true" />

      <div className="pixel-player-body" aria-hidden="true">
        <div className="pixel-player-head">{emoji}</div>
        <div className="pixel-player-outfit" />
      </div>

      <div className="pixel-player-name">{label}</div>
    </div>
  );
}

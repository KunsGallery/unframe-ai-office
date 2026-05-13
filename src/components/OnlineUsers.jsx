import {
  getUserAvatarEmoji,
  getUserDisplayLabel,
} from "../data/userToneProfiles";

const FALLBACK_POSITIONS = [
  { x: 14, y: 84 },
  { x: 20, y: 80 },
  { x: 24, y: 86 },
  { x: 12, y: 76 },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDisplayPosition(user, index) {
  const fallback = FALLBACK_POSITIONS[index % FALLBACK_POSITIONS.length];
  const rowOffset = Math.floor(index / FALLBACK_POSITIONS.length) * 4;

  return {
    x: clamp(user?.x ?? fallback.x + rowOffset, 8, 92),
    y: clamp(user?.y ?? fallback.y + rowOffset * 0.5, 12, 90),
  };
}

export default function OnlineUsers({ users = [] }) {
  return users.map((user, index) => {
    const position = getDisplayPosition(user, index);
    const label = user?.avatarLabel || getUserDisplayLabel(user?.userEmail);
    const emoji = getUserAvatarEmoji(user?.userEmail);
    const isOwner = label === "대표님";

    return (
      <div
        key={user.id || user.userEmail || `${label}-${index}`}
        className={`remote-user-avatar ${isOwner ? "owner" : "staff"}`}
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
        title={user?.displayName || user?.userEmail || label}
      >
        <div className="remote-user-shadow" aria-hidden="true" />
        <div className="remote-user-sprite" aria-hidden="true">
          <div className="remote-user-head">{emoji}</div>
          <div className="remote-user-body" />
        </div>
        <div className="remote-user-nameplate">{label}</div>
        <span className="remote-user-status-dot" aria-hidden="true" />
      </div>
    );
  });
}

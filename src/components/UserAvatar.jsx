import {
  getUserAvatarEmoji,
  getUserDisplayLabel,
  getUserRoleBadge,
} from "../data/userToneProfiles";

export default function UserAvatar({ user }) {
  const label = getUserDisplayLabel(user);
  const emoji = getUserAvatarEmoji(user);
  const badge = getUserRoleBadge(user);

  return (
    <div className="user-avatar-card">
      <div className="user-avatar-emoji" aria-hidden="true">
        {emoji}
      </div>

      <div className="user-avatar-copy">
        <p>현재 접속 중</p>
        <strong>{label}</strong>
        <span>{badge}</span>
        <small>{user?.email}</small>
      </div>
    </div>
  );
}

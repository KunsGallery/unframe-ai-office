const OWNER_EMAIL = "gallerykuns@gmail.com";

export default function UserAvatar({ user }) {
  const isOwner = user?.email === OWNER_EMAIL;
  const label = isOwner ? "대표님" : user?.displayName || "Staff";
  const emoji = isOwner ? "🧑‍💼" : "👤";
  const badge = isOwner ? "Director" : "Team";

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

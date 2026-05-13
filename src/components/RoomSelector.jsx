export default function RoomSelector({
  rooms,
  activeRoomId,
  onChangeRoom,
}) {
  return (
    <section className="room-selector">
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          className={`room-pill ${room.id === activeRoomId ? "active" : ""}`}
          onClick={() => onChangeRoom(room.id)}
          aria-label={`${room.name} 방 선택`}
        >
          <span className="room-pill-emoji" aria-hidden="true">
            {room.emoji}
          </span>
          <span className="room-pill-copy">
            <strong>{room.name}</strong>
            <span className="room-description">{room.description}</span>
          </span>
        </button>
      ))}
    </section>
  );
}

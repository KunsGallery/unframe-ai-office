export default function AgentCard({ agent, isActive, onClick }) {
  return (
    <button
      className={`agent-card ${isActive ? "active" : ""}`}
      onClick={onClick}
      style={{ "--agent-color": agent.color }}
    >
      <div className="agent-avatar">{agent.emoji}</div>
      <div>
        <h3>{agent.name}</h3>
        <p className="agent-role">{agent.role}</p>
        <p className="agent-description">{agent.description}</p>
      </div>
    </button>
  );
}
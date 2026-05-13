export const MOTION_POINTS = {
  desks: {
    director: { x: 46, y: 44 },
    copy: { x: 24, y: 44 },
    design: { x: 68, y: 44 },
    music: { x: 24, y: 78 },
    admin: { x: 46, y: 78 },
    archive: { x: 68, y: 78 },
  },
  collaborationTable: {
    center: { x: 50, y: 56 },
    left: { x: 42, y: 56 },
    right: { x: 58, y: 56 },
  },
  hallway: {
    topLeft: { x: 18, y: 24 },
    topCenter: { x: 50, y: 24 },
    topRight: { x: 82, y: 24 },
    middleLeft: { x: 14, y: 56 },
    middleRight: { x: 86, y: 56 },
    bottomLeft: { x: 18, y: 90 },
    bottomCenter: { x: 50, y: 90 },
    bottomRight: { x: 82, y: 90 },
  },
  lounge: {
    plantLeft: { x: 10, y: 82 },
    plantRight: { x: 90, y: 82 },
    bookshelf: { x: 82, y: 18 },
    water: { x: 52, y: 20 },
  },
};

export const AGENT_VISIT_ROUTES = {
  director: ["copy", "design", "admin"],
  copy: ["director", "archive", "design"],
  design: ["copy", "director", "music"],
  music: ["admin", "archive", "copy"],
  admin: ["director", "music", "archive"],
  archive: ["copy", "admin", "design"],
};

export const AGENT_BEHAVIOR_PRESETS = {
  officeRoaming: {
    enabled: true,
    intervalMs: 12000,
    minStayMs: 5500,
    maxStayMs: 14000,
    moveProbability: 0.72,
    visitOtherDeskProbability: 0.42,
    hallwayProbability: 0.28,
    loungeProbability: 0.18,
    returnHomeProbability: 0.12,
    maxAgentsPerTick: 2,
  },
  collaboration: {
    durationMs: 9000,
    bubbleIntervalMs: 2400,
  },
};

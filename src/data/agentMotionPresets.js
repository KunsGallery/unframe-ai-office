export const MOTION_POINTS = {
  desks: {
    director: { x: 50, y: 45 },
    copy: { x: 25, y: 45 },
    design: { x: 75, y: 45 },
    music: { x: 25, y: 79 },
    admin: { x: 50, y: 79 },
    archive: { x: 75, y: 79 },
  },
  collaborationTable: {
    center: { x: 50, y: 56 },
    left: { x: 42, y: 56 },
    right: { x: 58, y: 56 },
    topLeft: { x: 45, y: 51 },
    topRight: { x: 55, y: 51 },
    bottomLeft: { x: 45, y: 61 },
    bottomRight: { x: 55, y: 61 },
  },
  lounge: {
    left: { x: 17, y: 55 },
    right: { x: 83, y: 55 },
  },
};

export const AGENT_BEHAVIOR_PRESETS = {
  idleWander: {
    enabled: true,
    intervalMs: 9000,
    radius: 6,
    lingerMs: 2200,
  },
  collaboration: {
    durationMs: 8000,
    bubbleIntervalMs: 2200,
  },
};

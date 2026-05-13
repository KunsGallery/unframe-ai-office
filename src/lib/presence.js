import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { getSafeUserKey } from "./chatMemory";
import { getUserDisplayLabel } from "../data/userToneProfiles";

const PRESENCE_COLLECTION = "unframePresence";
const HEARTBEAT_INTERVAL_MS = 25000;
const STALE_AFTER_MS = 90000;
const MIN_WRITE_INTERVAL_MS = 700;
const FILTER_REFRESH_INTERVAL_MS = 15000;

const DEFAULT_ROOM_POSITIONS = {
  general: { x: 16, y: 84 },
  exhibition: { x: 18, y: 80 },
  up: { x: 18, y: 84 },
  "u-sharp": { x: 16, y: 78 },
  join: { x: 18, y: 86 },
  "virtual-gallery": { x: 14, y: 80 },
};

const activePresenceState = {
  userEmail: "",
  roomId: "",
  roomName: "",
  lastWriteAt: 0,
  lastPosition: null,
  pendingPayload: null,
  flushTimerId: null,
  heartbeatTimerId: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPresenceDoc(userEmail) {
  return doc(db, PRESENCE_COLLECTION, getSafeUserKey(userEmail));
}

function getRoomFallbackPosition(roomId) {
  return DEFAULT_ROOM_POSITIONS[roomId] || DEFAULT_ROOM_POSITIONS.general;
}

export function getPresenceStartPosition(roomId) {
  const fallback = getRoomFallbackPosition(roomId);

  return {
    x: clamp(fallback.x, 8, 92),
    y: clamp(fallback.y, 10, 90),
  };
}

function normalizePosition(roomId, position) {
  const fallback = getPresenceStartPosition(roomId);

  return {
    x: clamp(position?.x ?? fallback.x, 8, 92),
    y: clamp(position?.y ?? fallback.y, 10, 90),
  };
}

function buildPresencePayload({ user, room, position, status = "online" }) {
  const userEmail = user?.email || "";

  if (!userEmail) {
    return null;
  }

  const roomId = room?.id || "general";
  const roomName = room?.name || "General Office";
  const normalizedPosition = normalizePosition(roomId, position);

  return {
    userEmail,
    displayName: user?.displayName || "",
    roomId,
    roomName,
    status,
    avatarLabel: getUserDisplayLabel(user),
    x: normalizedPosition.x,
    y: normalizedPosition.y,
  };
}

function positionsAreClose(previous, next) {
  if (!previous || !next) {
    return false;
  }

  return (
    Math.abs(previous.x - next.x) < 0.5 &&
    Math.abs(previous.y - next.y) < 0.5
  );
}

function clearActiveTimers() {
  if (activePresenceState.heartbeatTimerId) {
    window.clearInterval(activePresenceState.heartbeatTimerId);
    activePresenceState.heartbeatTimerId = null;
  }

  if (activePresenceState.flushTimerId) {
    window.clearTimeout(activePresenceState.flushTimerId);
    activePresenceState.flushTimerId = null;
  }

  activePresenceState.pendingPayload = null;
}

function clearFlushTimer() {
  if (!activePresenceState.flushTimerId) {
    activePresenceState.pendingPayload = null;
    return;
  }

  window.clearTimeout(activePresenceState.flushTimerId);
  activePresenceState.flushTimerId = null;
  activePresenceState.pendingPayload = null;
}

async function persistPresence(payload) {
  if (!payload?.userEmail) {
    return;
  }

  await setDoc(
    getPresenceDoc(payload.userEmail),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  activePresenceState.lastWriteAt = Date.now();
  activePresenceState.lastPosition = { x: payload.x, y: payload.y };
}

function scheduleFlush(delayMs) {
  if (activePresenceState.flushTimerId) {
    return;
  }

  activePresenceState.flushTimerId = window.setTimeout(() => {
    const payload = activePresenceState.pendingPayload;
    activePresenceState.pendingPayload = null;
    activePresenceState.flushTimerId = null;

    if (!payload) {
      return;
    }

    void persistPresence(payload).catch((error) => {
      console.error("Failed to flush presence update", error);
    });
  }, Math.max(0, delayMs));
}

function queuePresenceWrite(payload, { force = false } = {}) {
  if (!payload?.userEmail) {
    return;
  }

  const now = Date.now();
  const elapsed = now - activePresenceState.lastWriteAt;
  const isFreshSession =
    activePresenceState.userEmail !== payload.userEmail ||
    activePresenceState.roomId !== payload.roomId;

  if (!force && !isFreshSession && positionsAreClose(activePresenceState.lastPosition, payload)) {
    return;
  }

  if (isFreshSession || elapsed >= MIN_WRITE_INTERVAL_MS) {
    clearFlushTimer();

    void persistPresence(payload).catch((error) => {
      console.error("Failed to write presence update", error);
    });

    return;
  }

  activePresenceState.pendingPayload = payload;
  scheduleFlush(MIN_WRITE_INTERVAL_MS - elapsed);
}

function startHeartbeat(user, room, position) {
  if (activePresenceState.heartbeatTimerId) {
    window.clearInterval(activePresenceState.heartbeatTimerId);
  }

  activePresenceState.heartbeatTimerId = window.setInterval(() => {
    const payload = buildPresencePayload({
      user,
      room,
      position: activePresenceState.lastPosition || position,
    });

    if (!payload) {
      return;
    }

    queuePresenceWrite(payload, { force: true });
  }, HEARTBEAT_INTERVAL_MS);
}

export async function startPresence({ user, room, position }) {
  const payload = buildPresencePayload({ user, room, position });

  if (!payload) {
    return;
  }

  clearActiveTimers();
  activePresenceState.userEmail = payload.userEmail;
  activePresenceState.roomId = payload.roomId;
  activePresenceState.roomName = payload.roomName;

  startHeartbeat(user, room, position);

  await persistPresence(payload);
}

export function updatePresencePosition({ user, room, position }) {
  const payload = buildPresencePayload({ user, room, position });

  if (!payload) {
    return;
  }

  if (
    activePresenceState.userEmail !== payload.userEmail ||
    activePresenceState.roomId !== payload.roomId
  ) {
    void startPresence({ user, room, position });
    return;
  }

  queuePresenceWrite(payload);
}

export async function stopPresence({ user }) {
  const userEmail = user?.email || activePresenceState.userEmail;

  clearActiveTimers();

  if (!userEmail) {
    activePresenceState.userEmail = "";
    activePresenceState.roomId = "";
    activePresenceState.roomName = "";
    activePresenceState.lastWriteAt = 0;
    activePresenceState.lastPosition = null;
    return;
  }

  activePresenceState.userEmail = "";
  activePresenceState.roomId = "";
  activePresenceState.roomName = "";
  activePresenceState.lastWriteAt = 0;
  activePresenceState.lastPosition = null;

  await deleteDoc(getPresenceDoc(userEmail));
}

function getFreshUsers(snapshotDocs, currentUserEmail) {
  const now = Date.now();
  const safeCurrentUserEmail =
    typeof currentUserEmail === "string" ? currentUserEmail.toLowerCase() : "";

  return snapshotDocs
    .map((snapshot) => {
      const data = snapshot.data();
      const updatedAtMs =
        data.updatedAt?.toMillis?.() ||
        (typeof data.updatedAt?.seconds === "number"
          ? data.updatedAt.seconds * 1000
          : 0);

      return {
        id: snapshot.id,
        ...data,
        updatedAtMs,
      };
    })
    .filter((user) => {
      const email =
        typeof user.userEmail === "string" ? user.userEmail.toLowerCase() : "";

      return (
        user.status === "online" &&
        email &&
        email !== safeCurrentUserEmail &&
        now - user.updatedAtMs <= STALE_AFTER_MS
      );
    })
    .sort((a, b) => {
      if (a.y !== b.y) {
        return a.y - b.y;
      }

      if (a.x !== b.x) {
        return a.x - b.x;
      }

      return a.id.localeCompare(b.id);
    });
}

export function subscribeOnlineUsers({ roomId, currentUserEmail, onChange }) {
  if (!roomId) {
    onChange?.([]);
    return () => {};
  }

  let latestDocs = [];

  const emit = () => {
    onChange?.(getFreshUsers(latestDocs, currentUserEmail));
  };

  const usersQuery = query(
    collection(db, PRESENCE_COLLECTION),
    where("roomId", "==", roomId),
  );

  const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
    latestDocs = snapshot.docs;
    emit();
  });

  const freshnessInterval = window.setInterval(emit, FILTER_REFRESH_INTERVAL_MS);

  return () => {
    unsubscribe();
    window.clearInterval(freshnessInterval);
  };
}

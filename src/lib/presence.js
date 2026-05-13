import {
  collection,
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
  intervalId: null,
  userEmail: "",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPresenceDoc(userEmail) {
  return doc(db, PRESENCE_COLLECTION, getSafeUserKey(userEmail));
}

function getBasePresencePosition(roomId, position) {
  const fallback = DEFAULT_ROOM_POSITIONS[roomId] || DEFAULT_ROOM_POSITIONS.general;

  return {
    x: clamp(position?.x ?? fallback.x, 8, 92),
    y: clamp(position?.y ?? fallback.y, 10, 90),
  };
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
    });
}

async function writePresence({ user, room, position, status = "online" }) {
  const userEmail = user?.email || "";

  if (!userEmail) {
    return;
  }

  const basePosition = getBasePresencePosition(room?.id, position);

  await setDoc(
    getPresenceDoc(userEmail),
    {
      userEmail,
      displayName: user?.displayName || "",
      roomId: room?.id || "general",
      roomName: room?.name || "General Office",
      status,
      avatarLabel: getUserDisplayLabel(user),
      x: basePosition.x,
      y: basePosition.y,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function startPresence({ user, room, position }) {
  const userEmail = user?.email || "";

  if (!userEmail) {
    return;
  }

  if (activePresenceState.intervalId) {
    window.clearInterval(activePresenceState.intervalId);
    activePresenceState.intervalId = null;
  }

  activePresenceState.userEmail = userEmail;
  await writePresence({ user, room, position, status: "online" });

  activePresenceState.intervalId = window.setInterval(() => {
    void writePresence({ user, room, position, status: "online" });
  }, HEARTBEAT_INTERVAL_MS);
}

export async function stopPresence({ user }) {
  const userEmail = user?.email || activePresenceState.userEmail;

  if (activePresenceState.intervalId) {
    window.clearInterval(activePresenceState.intervalId);
    activePresenceState.intervalId = null;
  }

  activePresenceState.userEmail = "";

  if (!userEmail) {
    return;
  }

  await setDoc(
    getPresenceDoc(userEmail),
    {
      status: "offline",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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

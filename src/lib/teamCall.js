import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "unframeTeamChats";

export function subscribeTeamCallSignals({ roomId = "general", onChange, onError }) {
  const signalsQuery = query(
    collection(db, ROOT_COLLECTION, roomId, "signals"),
    orderBy("createdAt", "asc"),
    limit(100),
  );

  return onSnapshot(
    signalsQuery,
    (snapshot) => onChange(snapshot.docs.map((signalDoc) => ({ id: signalDoc.id, ...signalDoc.data() }))),
    (error) => {
      console.error("Failed to subscribe to team call signals", error);
      onError?.(error);
    },
  );
}

export async function sendTeamCallSignal({ roomId = "general", user, type, payload = {} }) {
  if (!user?.email) throw new Error("화면공유 계정을 확인할 수 없습니다.");

  await addDoc(collection(db, ROOT_COLLECTION, roomId, "signals"), {
    senderEmail: user.email,
    type,
    payload,
    createdAt: serverTimestamp(),
  });
}

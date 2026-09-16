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
const MAX_MESSAGES = 100;

function getSafeDisplayName(user) {
  const name = user?.displayName?.trim();
  return name || user?.email?.split("@")[0] || "직원";
}

export function subscribeTeamMessages({ roomId = "general", onChange, onError }) {
  const messagesQuery = query(
    collection(db, ROOT_COLLECTION, roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(MAX_MESSAGES),
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      onChange(
        snapshot.docs.map((messageDoc) => {
          const data = messageDoc.data();
          return {
            id: messageDoc.id,
            content: data.content || "",
            senderEmail: data.senderEmail || "",
            senderName: data.senderName || "직원",
            createdAt: data.createdAt || null,
          };
        }).reverse(),
      );
    },
    (error) => {
      console.error("Failed to subscribe to team chat", error);
      onError?.(error);
    },
  );
}

export async function sendTeamMessage({ roomId = "general", user, content }) {
  const trimmed = content.trim();
  if (!trimmed) return;
  if (!user?.email) {
    throw new Error("메시지를 보낼 계정을 확인할 수 없습니다.");
  }

  await addDoc(collection(db, ROOT_COLLECTION, roomId, "messages"), {
    content: trimmed.slice(0, 2000),
    senderEmail: user.email,
    senderName: getSafeDisplayName(user).slice(0, 80),
    createdAt: serverTimestamp(),
  });
}

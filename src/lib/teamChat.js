import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "unframeTeamChats";
const TYPING_COLLECTION = "typingUsers";
const MAX_MESSAGES = 100;

export function getSafeUserKey(email) {
  return (email || "anonymous").toLowerCase().replace(/[^a-z0-9]/g, "_");
}

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
            reactions: data.reactions || {},
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
    reactions: {},
  });
}

export async function toggleTeamReaction({ roomId = "general", messageId, user, emoji }) {
  if (!user?.email || !messageId || !emoji) return;
  const messageRef = doc(db, ROOT_COLLECTION, roomId, "messages", messageId);
  const reactionKey = getSafeUserKey(user.email);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(messageRef);
    if (!snapshot.exists()) return;

    const reactions = { ...(snapshot.data().reactions || {}) };
    if (reactions[reactionKey] === emoji) {
      delete reactions[reactionKey];
    } else {
      reactions[reactionKey] = emoji;
    }
    transaction.update(messageRef, { reactions });
  });
}

export function subscribeTeamTyping({ roomId = "general", onChange, onError }) {
  const typingQuery = query(
    collection(db, ROOT_COLLECTION, roomId, TYPING_COLLECTION),
    where("typing", "==", true),
  );

  return onSnapshot(
    typingQuery,
    (snapshot) => {
      onChange(snapshot.docs.map((typingDoc) => typingDoc.data()));
    },
    (error) => {
      console.error("Failed to subscribe to team typing", error);
      onError?.(error);
    },
  );
}

export async function setTeamTyping({ roomId = "general", user, typing }) {
  if (!user?.email) return;
  const typingRef = doc(db, ROOT_COLLECTION, roomId, TYPING_COLLECTION, getSafeUserKey(user.email));

  if (!typing) {
    await deleteDoc(typingRef);
    return;
  }

  await setDoc(typingRef, {
    senderEmail: user.email,
    typing: true,
    updatedAt: serverTimestamp(),
  });
}

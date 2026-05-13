import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "unframeChatRooms";

export function getSafeUserKey(email) {
  if (!email) {
    return "anonymous";
  }

  return email.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export function getChatDocRef({ roomId = "general", agentId, userEmail }) {
  const safeUserKey = getSafeUserKey(userEmail);
  const chatId = `${agentId}_${safeUserKey}`;

  return doc(db, ROOT_COLLECTION, roomId, "chats", chatId);
}

export async function loadChatMemory({ roomId = "general", agentId, userEmail }) {
  const chatDocRef = getChatDocRef({ roomId, agentId, userEmail });
  const messagesQuery = query(
    collection(chatDocRef, "messages"),
    orderBy("createdAt", "asc"),
  );
  const [chatDocSnapshot, messageSnapshots] = await Promise.all([
    getDoc(chatDocRef),
    getDocs(messagesQuery),
  ]);

  const summary = chatDocSnapshot.exists()
    ? chatDocSnapshot.data().summary || ""
    : "";

  const messages = messageSnapshots.docs.map((messageDoc) => {
    const data = messageDoc.data();

    return {
      id: messageDoc.id,
      role: data.role,
      content: data.content,
      usage: data.usage || null,
      mode: data.mode || null,
      createdAt: data.createdAt || null,
    };
  });

  return {
    summary,
    messages,
  };
}

export async function saveMessage({
  roomId = "general",
  agentId,
  userEmail,
  message,
}) {
  const chatDocRef = getChatDocRef({ roomId, agentId, userEmail });
  const messagesCollectionRef = collection(chatDocRef, "messages");

  await setDoc(
    chatDocRef,
    {
      agentId,
      userEmail,
      roomId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await addDoc(messagesCollectionRef, {
    role: message.role,
    content: message.content,
    createdAt: serverTimestamp(),
    usage: message.usage || null,
    mode: message.mode || null,
  });
}

export async function saveSummary({
  roomId = "general",
  agentId,
  userEmail,
  summary,
}) {
  const chatDocRef = getChatDocRef({ roomId, agentId, userEmail });

  await setDoc(
    chatDocRef,
    {
      agentId,
      userEmail,
      roomId,
      summary,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearChatMemory({
  roomId = "general",
  agentId,
  userEmail,
}) {
  const chatDocRef = getChatDocRef({ roomId, agentId, userEmail });
  const messagesSnapshot = await getDocs(collection(chatDocRef, "messages"));
  const batch = writeBatch(db);

  messagesSnapshot.forEach((messageDoc) => {
    batch.delete(messageDoc.ref);
  });

  await batch.commit();

  await setDoc(
    chatDocRef,
    {
      agentId,
      userEmail,
      roomId,
      summary: "",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

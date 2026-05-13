import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const ROOT_COLLECTION = "unframeOutputRooms";

function getOutputsCollection({ roomId = "general" }) {
  return collection(db, ROOT_COLLECTION, roomId, "outputs");
}

function mapOutputDoc(outputDoc) {
  return {
    id: outputDoc.id,
    ...outputDoc.data(),
  };
}

export async function saveOutput({ roomId = "general", userEmail, output }) {
  const outputDocRef = doc(getOutputsCollection({ roomId }));
  const nextOutput = {
    title: typeof output?.title === "string" ? output.title.trim() : "",
    type: typeof output?.type === "string" ? output.type : "general",
    content: typeof output?.content === "string" ? output.content : "",
    sourceTaskId:
      typeof output?.sourceTaskId === "string" ? output.sourceTaskId : "",
    sourceTaskTitle:
      typeof output?.sourceTaskTitle === "string" ? output.sourceTaskTitle : "",
    assignedAgentId:
      typeof output?.assignedAgentId === "string"
        ? output.assignedAgentId
        : "director",
    roomId,
    userEmail: userEmail || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(outputDocRef, nextOutput);

    return {
      id: outputDocRef.id,
      ...nextOutput,
    };
  } catch (error) {
    console.error("Failed to save output archive", error);
    throw error;
  }
}

export async function loadOutputs({ roomId = "general", userEmail }) {
  try {
    const outputsSnapshot = await getDocs(
      query(
        getOutputsCollection({ roomId }),
        where("userEmail", "==", userEmail || ""),
      ),
    );

    return outputsSnapshot.docs
      .map(mapOutputDoc)
      .sort((a, b) => {
        const aTime =
          a.updatedAt?.toMillis?.() ||
          a.updatedAt?.seconds * 1000 ||
          a.createdAt?.toMillis?.() ||
          a.createdAt?.seconds * 1000 ||
          0;
        const bTime =
          b.updatedAt?.toMillis?.() ||
          b.updatedAt?.seconds * 1000 ||
          b.createdAt?.toMillis?.() ||
          b.createdAt?.seconds * 1000 ||
          0;

        return bTime - aTime;
      });
  } catch (error) {
    console.error("Failed to load output archive", error);
    return [];
  }
}

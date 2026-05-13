import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { getSafeUserKey } from "./chatMemory";

const ROOT_COLLECTION = "unframeTaskRooms";

function getTaskQueueDoc({ roomId = "general", userEmail }) {
  return doc(
    db,
    ROOT_COLLECTION,
    roomId,
    "queues",
    getSafeUserKey(userEmail),
  );
}

function getTasksCollection({ roomId = "general", userEmail }) {
  return collection(getTaskQueueDoc({ roomId, userEmail }), "tasks");
}

function mapTaskDoc(taskDoc) {
  const data = taskDoc.data();

  return {
    id: taskDoc.id,
    ...data,
  };
}

async function touchQueueMeta({ roomId = "general", userEmail }) {
  const queueRef = getTaskQueueDoc({ roomId, userEmail });

  await setDoc(
    queueRef,
    {
      ownerEmail: userEmail || "",
      userEmail: userEmail || "",
      roomId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function getTaskQueueRef({ roomId = "general", userEmail }) {
  return getTaskQueueDoc({ roomId, userEmail });
}

export async function loadTasks({ roomId = "general", userEmail }) {
  try {
    const tasksSnapshot = await getDocs(
      query(
        getTasksCollection({ roomId, userEmail }),
        where("userEmail", "==", userEmail || ""),
      ),
    );

    return tasksSnapshot.docs
      .map(mapTaskDoc)
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
    console.error("Failed to load tasks", error);
    return [];
  }
}

export async function saveTasksFromPlan({
  roomId = "general",
  userEmail,
  goal,
  tasks,
}) {
  const queueRef = getTaskQueueDoc({ roomId, userEmail });
  const tasksCollectionRef = collection(queueRef, "tasks");
  const batch = writeBatch(db);
  const planId = `plan_${Date.now()}`;
  const safeTasks = Array.isArray(tasks) ? tasks : [];

  batch.set(
    queueRef,
    {
      ownerEmail: userEmail || "",
      userEmail: userEmail || "",
      roomId,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  const createdTasks = safeTasks.map((task, index) => {
    const taskDocRef = doc(tasksCollectionRef);
    const nextTask = {
      title: typeof task?.title === "string" ? task.title.trim() : "",
      description:
        typeof task?.description === "string" ? task.description.trim() : "",
      assignedAgentId:
        typeof task?.assignedAgentId === "string"
          ? task.assignedAgentId
          : "director",
      status: "planned",
      priority:
        task?.priority === "low" || task?.priority === "high"
          ? task.priority
          : "normal",
      goal: typeof goal === "string" ? goal.trim() : "",
      planId,
      roomId,
      userEmail: userEmail || "",
      ownerEmail: userEmail || "",
      expectedOutput:
        typeof task?.expectedOutput === "string"
          ? task.expectedOutput.trim()
          : "",
      result: "",
      errorMessage: "",
      usage: null,
      mode: "economy",
      sortOrder: index,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(taskDocRef, nextTask);

    return {
      id: taskDocRef.id,
      ...nextTask,
    };
  });

  try {
    await batch.commit();
    return createdTasks;
  } catch (error) {
    console.error("Failed to save plan tasks", error);
    throw error;
  }
}

export async function createTask({ roomId = "general", userEmail, task }) {
  const queueRef = getTaskQueueDoc({ roomId, userEmail });
  const taskDocRef = doc(collection(queueRef, "tasks"));
  const nextTask = {
    title: typeof task?.title === "string" ? task.title.trim() : "",
    description: typeof task?.description === "string" ? task.description.trim() : "",
    assignedAgentId:
      typeof task?.assignedAgentId === "string" ? task.assignedAgentId : "director",
    status: task?.status || "planned",
    priority: task?.priority || "normal",
    goal: typeof task?.goal === "string" ? task.goal.trim() : "",
    planId:
      typeof task?.planId === "string" && task.planId.trim()
        ? task.planId.trim()
        : `plan_${Date.now()}`,
    roomId,
    userEmail: userEmail || "",
    ownerEmail: userEmail || "",
    expectedOutput:
      typeof task?.expectedOutput === "string" ? task.expectedOutput.trim() : "",
    result: typeof task?.result === "string" ? task.result : "",
    errorMessage: typeof task?.errorMessage === "string" ? task.errorMessage : "",
    usage: task?.usage || null,
    mode: task?.mode || "economy",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(
      queueRef,
      {
        ownerEmail: userEmail || "",
        userEmail: userEmail || "",
        roomId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await setDoc(taskDocRef, nextTask);

    return {
      id: taskDocRef.id,
      ...nextTask,
    };
  } catch (error) {
    console.error("Failed to create task", error);
    throw error;
  }
}

export async function updateTask({
  roomId = "general",
  userEmail,
  taskId,
  updates,
}) {
  try {
    await touchQueueMeta({ roomId, userEmail });
    await setDoc(
      doc(getTasksCollection({ roomId, userEmail }), taskId),
      {
        ...updates,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Failed to update task", error);
    throw error;
  }
}

export async function archiveTask({ roomId = "general", userEmail, taskId }) {
  return updateTask({
    roomId,
    userEmail,
    taskId,
    updates: {
      status: "archived",
    },
  });
}

export async function clearCompletedTasks({ roomId = "general", userEmail }) {
  try {
    const tasksSnapshot = await getDocs(
      query(
        getTasksCollection({ roomId, userEmail }),
        where("userEmail", "==", userEmail || ""),
      ),
    );
    const batch = writeBatch(db);

    tasksSnapshot.docs.forEach((taskDoc) => {
      const taskData = taskDoc.data();

      if (taskData.status === "completed") {
        batch.set(
          taskDoc.ref,
          {
            status: "archived",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    });

    await batch.commit();
  } catch (error) {
    console.error("Failed to archive completed tasks", error);
    throw error;
  }
}

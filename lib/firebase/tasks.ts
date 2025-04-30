import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  type QueryConstraint,
  Timestamp,
  where,
} from "firebase/firestore"
import { db } from "./config"
import { auth } from "./config"
import { addLog } from "./firestore"

// Task priority types
export type TaskPriority = "low" | "medium" | "high" | "urgent"

// Task status types
export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed" | "canceled"

// Task category types (can be expanded based on your needs)
export type TaskCategory = "administrative" | "technical" | "client_related" | "internal" | "other"

// Task data interface
export interface Task {
  id?: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  category: TaskCategory
  assignedTo: string[]
  createdBy: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  dueDate: Timestamp | null
  completedAt?: Timestamp | null
  relatedWorkOrderId?: string
  relatedClientId?: string
  attachments?: string[]
  comments?: TaskComment[]
}

// Task comment interface
export interface TaskComment {
  id: string
  content: string
  createdBy: string
  createdAt: Timestamp
  updatedAt?: Timestamp
}

// Helper function to get task priority display name
export const getTaskPriorityDisplay = (priority: TaskPriority): string => {
  switch (priority) {
    case "low":
      return "Scăzută"
    case "medium":
      return "Medie"
    case "high":
      return "Ridicată"
    case "urgent":
      return "Urgentă"
    default:
      return "Necunoscută"
  }
}

// Helper function to get task status display name
export const getTaskStatusDisplay = (status: TaskStatus): string => {
  switch (status) {
    case "not_started":
      return "Neîncepută"
    case "in_progress":
      return "În progres"
    case "on_hold":
      return "În așteptare"
    case "completed":
      return "Finalizată"
    case "canceled":
      return "Anulată"
    default:
      return "Necunoscută"
  }
}

// Helper function to get task category display name
export const getTaskCategoryDisplay = (category: TaskCategory): string => {
  switch (category) {
    case "administrative":
      return "Administrativă"
    case "technical":
      return "Tehnică"
    case "client_related":
      return "Relații cu clienții"
    case "internal":
      return "Internă"
    case "other":
      return "Altele"
    default:
      return "Necunoscută"
  }
}

// Get all tasks with optional constraints
export const getTasks = async (constraints: QueryConstraint[] = []): Promise<Task[]> => {
  try {
    const q = query(collection(db, "tasks"), ...constraints)
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Task[]
  } catch (error) {
    console.error("Eroare la obținerea sarcinilor:", error)
    throw error
  }
}

// Get task by ID
export const getTaskById = async (id: string): Promise<Task | null> => {
  try {
    const docRef = doc(db, "tasks", id)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as Task
    }

    return null
  } catch (error) {
    console.error(`Eroare la obținerea sarcinii cu ID ${id}:`, error)
    throw error
  }
}

// Get tasks for a specific user
export const getUserTasks = async (userId: string): Promise<Task[]> => {
  try {
    const q = query(collection(db, "tasks"), where("assignedTo", "array-contains", userId), orderBy("dueDate", "asc"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Task[]
  } catch (error) {
    console.error(`Eroare la obținerea sarcinilor pentru utilizatorul ${userId}:`, error)
    throw error
  }
}

// Get tasks related to a specific work order
export const getWorkOrderTasks = async (workOrderId: string): Promise<Task[]> => {
  try {
    const q = query(
      collection(db, "tasks"),
      where("relatedWorkOrderId", "==", workOrderId),
      orderBy("createdAt", "desc"),
    )
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Task[]
  } catch (error) {
    console.error(`Eroare la obținerea sarcinilor pentru lucrarea ${workOrderId}:`, error)
    throw error
  }
}

// Add a new task
export const addTask = async (task: Omit<Task, "id">): Promise<string> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    const taskData = {
      ...task,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user?.uid || "system",
    }

    const docRef = await addDoc(collection(db, "tasks"), taskData)

    // Add log entry
    await addLog(
      "Adăugare",
      `Utilizatorul ${userName} a adăugat o nouă sarcină: "${task.title}"`,
      "Informație",
      "Sarcini",
    )

    return docRef.id
  } catch (error) {
    console.error("Eroare la adăugarea sarcinii:", error)
    throw error
  }
}

// Update a task
export const updateTask = async (id: string, data: Partial<Task>): Promise<void> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    const docRef = doc(db, "tasks", id)

    // Get current task data for logging
    const taskSnap = await getDoc(docRef)
    const currentTask = taskSnap.exists() ? taskSnap.data() : null

    // Update task
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    })

    // Generate log message based on changes
    let logDetails = `Utilizatorul ${userName} a actualizat sarcina "${currentTask?.title || id}"`

    // Add status change info if status was changed
    if (data.status && data.status !== currentTask?.status) {
      const oldStatus = currentTask?.status ? getTaskStatusDisplay(currentTask.status as TaskStatus) : "necunoscut"
      const newStatus = getTaskStatusDisplay(data.status)
      logDetails += ` - statusul a fost schimbat din "${oldStatus}" în "${newStatus}"`

      // Add completion info if task was marked as completed
      if (data.status === "completed") {
        logDetails += " (sarcina a fost marcată ca finalizată)"
      }
    }

    // Add log entry
    await addLog("Actualizare", logDetails, "Informație", "Sarcini")
  } catch (error) {
    console.error(`Eroare la actualizarea sarcinii ${id}:`, error)
    throw error
  }
}

// Delete a task
export const deleteTask = async (id: string): Promise<void> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    // Get task details before deletion for logging
    const taskRef = doc(db, "tasks", id)
    const taskSnap = await getDoc(taskRef)
    const taskTitle = taskSnap.exists() ? taskSnap.data().title : id

    // Delete the task
    await deleteDoc(taskRef)

    // Add log entry
    await addLog("Ștergere", `Utilizatorul ${userName} a șters sarcina "${taskTitle}"`, "Avertisment", "Sarcini")
  } catch (error) {
    console.error(`Eroare la ștergerea sarcinii ${id}:`, error)
    throw error
  }
}

// Add a comment to a task
export const addTaskComment = async (taskId: string, content: string): Promise<string> => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("Utilizatorul nu este autentificat")

    const taskRef = doc(db, "tasks", taskId)
    const taskSnap = await getDoc(taskRef)

    if (!taskSnap.exists()) {
      throw new Error(`Sarcina cu ID-ul ${taskId} nu există`)
    }

    const taskData = taskSnap.data()
    const comments = taskData.comments || []

    const newComment: TaskComment = {
      id: `comment_${Date.now()}`,
      content,
      createdBy: user.uid,
      createdAt: Timestamp.now(),
    }

    // Add comment to the task
    await updateDoc(taskRef, {
      comments: [...comments, newComment],
      updatedAt: serverTimestamp(),
    })

    // Add log entry
    await addLog(
      "Comentariu",
      `Utilizatorul ${user.displayName || user.email} a adăugat un comentariu la sarcina "${taskData.title}"`,
      "Informație",
      "Sarcini",
    )

    return newComment.id
  } catch (error) {
    console.error(`Eroare la adăugarea comentariului la sarcina ${taskId}:`, error)
    throw error
  }
}

// Update a task comment
export const updateTaskComment = async (taskId: string, commentId: string, content: string): Promise<void> => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("Utilizatorul nu este autentificat")

    const taskRef = doc(db, "tasks", taskId)
    const taskSnap = await getDoc(taskRef)

    if (!taskSnap.exists()) {
      throw new Error(`Sarcina cu ID-ul ${taskId} nu există`)
    }

    const taskData = taskSnap.data()
    const comments = taskData.comments || []

    // Find comment index
    const commentIndex = comments.findIndex((c: TaskComment) => c.id === commentId)

    if (commentIndex === -1) {
      throw new Error(`Comentariul cu ID-ul ${commentId} nu există`)
    }

    // Verify comment ownership
    if (comments[commentIndex].createdBy !== user.uid) {
      throw new Error("Nu aveți permisiunea de a edita acest comentariu")
    }

    // Update comment
    comments[commentIndex] = {
      ...comments[commentIndex],
      content,
      updatedAt: Timestamp.now(),
    }

    // Save updated comments
    await updateDoc(taskRef, {
      comments,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error(`Eroare la actualizarea comentariului ${commentId} pentru sarcina ${taskId}:`, error)
    throw error
  }
}

// Delete a task comment
export const deleteTaskComment = async (taskId: string, commentId: string): Promise<void> => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("Utilizatorul nu este autentificat")

    const taskRef = doc(db, "tasks", taskId)
    const taskSnap = await getDoc(taskRef)

    if (!taskSnap.exists()) {
      throw new Error(`Sarcina cu ID-ul ${taskId} nu există`)
    }

    const taskData = taskSnap.data()
    const comments = taskData.comments || []

    // Find comment
    const comment = comments.find((c: TaskComment) => c.id === commentId)

    if (!comment) {
      throw new Error(`Comentariul cu ID-ul ${commentId} nu există`)
    }

    // Verify comment ownership or admin rights
    const isOwner = comment.createdBy === user.uid
    const isAdmin = user.uid === taskData.createdBy // Task creator can delete any comment

    if (!isOwner && !isAdmin) {
      throw new Error("Nu aveți permisiunea de a șterge acest comentariu")
    }

    // Remove comment
    const updatedComments = comments.filter((c: TaskComment) => c.id !== commentId)

    // Save updated comments
    await updateDoc(taskRef, {
      comments: updatedComments,
      updatedAt: serverTimestamp(),
    })

    // Add log entry
    await addLog(
      "Ștergere comentariu",
      `Utilizatorul ${user.displayName || user.email} a șters un comentariu de la sarcina "${taskData.title}"`,
      "Informație",
      "Sarcini",
    )
  } catch (error) {
    console.error(`Eroare la ștergerea comentariului ${commentId} pentru sarcina ${taskId}:`, error)
    throw error
  }
}

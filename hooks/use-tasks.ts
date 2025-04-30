"use client"

import { useState, useEffect } from "react"
import { orderBy, where } from "firebase/firestore"
import {
  type Task,
  getTasks,
  addTask as firebaseAddTask,
  updateTask as firebaseUpdateTask,
  deleteTask as firebaseDeleteTask,
} from "@/lib/firebase/tasks"
import { useAuth } from "@/contexts/AuthContext"

interface UseTasksOptions {
  userId?: string
  workOrderId?: string
  clientId?: string
  includeCompleted?: boolean
}

export function useTasks(options: UseTasksOptions = {}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const { userData } = useAuth()

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const constraints = []

      // Filter by user if specified
      if (options.userId) {
        constraints.push(where("assignedTo", "array-contains", options.userId))
      }

      // Filter by work order if specified
      if (options.workOrderId) {
        constraints.push(where("relatedWorkOrderId", "==", options.workOrderId))
      }

      // Filter by client if specified
      if (options.clientId) {
        constraints.push(where("relatedClientId", "==", options.clientId))
      }

      // Exclude completed tasks unless specifically included
      if (!options.includeCompleted) {
        constraints.push(where("status", "!=", "completed"))
      }

      // Add sorting
      constraints.push(orderBy("dueDate", "asc"))

      const fetchedTasks = await getTasks(constraints)
      setTasks(fetchedTasks)
      setError(null)
    } catch (err) {
      console.error("Eroare la încărcarea sarcinilor:", err)
      setError(err instanceof Error ? err : new Error("Eroare la încărcarea sarcinilor"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userData) {
      fetchTasks()
    }
  }, [userData, options.userId, options.workOrderId, options.clientId, options.includeCompleted])

  const addTask = async (taskData: Omit<Task, "id" | "createdBy" | "createdAt" | "updatedAt">) => {
    try {
      if (!userData?.uid) throw new Error("User not authenticated")

      const newTask = {
        ...taskData,
        createdBy: userData.uid,
      }

      await firebaseAddTask(newTask as Omit<Task, "id">)
      fetchTasks()
    } catch (err) {
      console.error("Eroare la adăugarea sarcinii:", err)
      throw err
    }
  }

  const updateTask = async (id: string, data: Partial<Task>) => {
    try {
      await firebaseUpdateTask(id, data)
      fetchTasks()
    } catch (err) {
      console.error(`Eroare la actualizarea sarcinii ${id}:`, err)
      throw err
    }
  }

  const deleteTask = async (id: string) => {
    try {
      await firebaseDeleteTask(id)
      fetchTasks()
    } catch (err) {
      console.error(`Eroare la ștergerea sarcinii ${id}:`, err)
      throw err
    }
  }

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    addTask,
    updateTask,
    deleteTask,
  }
}

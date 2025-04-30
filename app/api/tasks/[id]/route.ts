import { type NextRequest, NextResponse } from "next/server"
import { getTaskById, updateTask, deleteTask } from "@/lib/firebase/tasks"
import { auth } from "@/lib/firebase/admin"

// GET a specific task
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verify auth token
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1]
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let decodedToken
    try {
      decodedToken = await auth.verifyIdToken(idToken)
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Get task
    const task = await getTaskById(params.id)

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    return NextResponse.json(task)
  } catch (error) {
    console.error(`Error getting task ${params.id}:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// PUT update a task
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verify auth token
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1]
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let decodedToken
    try {
      decodedToken = await auth.verifyIdToken(idToken)
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Get task data from request
    const taskData = await req.json()

    // Check if task exists
    const existingTask = await getTaskById(params.id)
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Update task
    await updateTask(params.id, taskData)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Error updating task ${params.id}:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// DELETE a task
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verify auth token
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1]
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let decodedToken
    try {
      decodedToken = await auth.verifyIdToken(idToken)
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Check if task exists
    const existingTask = await getTaskById(params.id)
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    // Delete task
    await deleteTask(params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Error deleting task ${params.id}:`, error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

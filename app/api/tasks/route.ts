import { type NextRequest, NextResponse } from "next/server"
import { addTask, getTasks } from "@/lib/firebase/tasks"
import { auth } from "@/lib/firebase/admin"

// GET all tasks
export async function GET(req: NextRequest) {
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

    // Get tasks
    const tasks = await getTasks()
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error("Error getting tasks:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

// POST create a new task
export async function POST(req: NextRequest) {
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

    // Add user ID as creator if not present
    if (!taskData.createdBy) {
      taskData.createdBy = decodedToken.uid
    }

    // Create task
    const taskId = await addTask(taskData)

    return NextResponse.json({ id: taskId }, { status: 201 })
  } catch (error) {
    console.error("Error creating task:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase/admin"

export async function POST(request: Request) {
  try {
    // Parse the request body
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { uid } = body

    if (!uid) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    try {
      // Generate a custom token for the user
      const customToken = await adminAuth.createCustomToken(uid)
      return NextResponse.json({ token: customToken })
    } catch (error: any) {
      console.error("Error generating custom token:", error)
      return NextResponse.json({ error: "Failed to generate custom token", details: error.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error("Unexpected error:", error)
    return NextResponse.json({ error: "An unexpected error occurred", details: error.message }, { status: 500 })
  }
}

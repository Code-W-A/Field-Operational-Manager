import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase/admin"

/** 5 zile (Firebase permite până la 14 zile pentru session cookie). */
const SESSION_COOKIE_MAX_MS = 5 * 24 * 60 * 60 * 1000

/**
 * Schimbă ID token-ul Firebase din client într-un cookie httpOnly `__session`,
 * verificat pe server cu `adminAuth.verifySessionCookie` (vezi `requireRole`).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { idToken?: string } | null
    const idToken = typeof body?.idToken === "string" ? body.idToken.trim() : ""
    if (!idToken) {
      return NextResponse.json({ error: "idToken lipsă" }, { status: 400 })
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_MS,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set("__session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_COOKIE_MAX_MS / 1000),
    })
    return res
  } catch (e) {
    console.error("[api/auth/session POST]", e)
    return NextResponse.json({ error: "Nu s-a putut crea sesiunea server" }, { status: 401 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set("__session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return res
}

"use client"

import type { User } from "firebase/auth"

/**
 * Creează cookie-ul httpOnly `__session` pe domeniul aplicației, astfel încât
 * rutele `/api/*` să fie autentificate fără `Authorization` pe fiecare fetch.
 */
export async function syncServerSessionCookie(user: User): Promise<boolean> {
  try {
    const idToken = await user.getIdToken()
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      credentials: "same-origin",
    })
    return res.ok
  } catch (e) {
    console.warn("[syncServerSessionCookie]", e)
    return false
  }
}

export async function clearServerSessionCookie(): Promise<void> {
  try {
    await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    })
  } catch {
    // ignore
  }
}

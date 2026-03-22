import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export class RequireRoleError extends Error {
  status: number

  constructor(message: string, status = 403) {
    super(message)
    this.status = status
  }
}

async function resolveRoleForUid(uid: string, allowedRoles: string[]) {
  const userDoc = await adminDb.collection("users").doc(uid).get()
  const role = String(userDoc.data()?.role || "")
  if (!role || !allowedRoles.includes(role)) {
    throw new RequireRoleError("Nu ai permisiune pentru această acțiune.", 403)
  }
  return { uid, role }
}

/**
 * Server-side auth for API routes. Supports (in order):
 * 1. `__session` — cookie creat la login prin `POST /api/auth/session` (fluxul principal).
 * 2. `Authorization: Bearer <ID token>` — rezervă dacă cookie-ul lipsește încă sau e expirat.
 * 3. `userRole` — slab; `uid` poate fi null (inutil pentru rute care cer `session.uid`).
 */
export async function requireRole(allowedRoles: string[], request?: NextRequest) {
  const cookieStore = await cookies()
  const roleCookie = cookieStore.get("userRole")?.value
  const sessionCookie = cookieStore.get("__session")?.value

  const authHeader = request?.headers.get("authorization") ?? request?.headers.get("Authorization") ?? ""
  const bearer =
    typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : ""

  if (sessionCookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      return await resolveRoleForUid(decoded.uid, allowedRoles)
    } catch (e) {
      if (e instanceof RequireRoleError) throw e
      // cookie expirat / invalid — încearcă Bearer
    }
  }

  if (bearer) {
    try {
      const decoded = await adminAuth.verifyIdToken(bearer)
      return await resolveRoleForUid(decoded.uid, allowedRoles)
    } catch (e) {
      if (e instanceof RequireRoleError) throw e
      throw new RequireRoleError("Sesiune invalidă sau expirată.", 401)
    }
  }

  if (roleCookie && allowedRoles.includes(decodeURIComponent(roleCookie))) {
    return { uid: null as string | null, role: decodeURIComponent(roleCookie) }
  }

  throw new RequireRoleError("Nu ai permisiune pentru această acțiune.", 403)
}

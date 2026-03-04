import { cookies } from "next/headers"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export class RequireRoleError extends Error {
  status: number

  constructor(message: string, status = 403) {
    super(message)
    this.status = status
  }
}

export async function requireRole(allowedRoles: string[]) {
  const cookieStore = await cookies()
  const roleCookie = cookieStore.get("userRole")?.value
  const sessionCookie = cookieStore.get("__session")?.value

  if (sessionCookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      const userDoc = await adminDb.collection("users").doc(decoded.uid).get()
      const role = String(userDoc.data()?.role || "")

      if (!role || !allowedRoles.includes(role)) {
        throw new RequireRoleError("Nu ai permisiune pentru această acțiune.", 403)
      }

      return { uid: decoded.uid, role }
    } catch {
      throw new RequireRoleError("Sesiune invalidă sau expirată.", 401)
    }
  }

  if (roleCookie && allowedRoles.includes(decodeURIComponent(roleCookie))) {
    return { uid: null, role: decodeURIComponent(roleCookie) }
  }

  throw new RequireRoleError("Nu ai permisiune pentru această acțiune.", 403)
}

"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, orderBy, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { KioskCheckIn, type KioskUser } from "@/components/attendance/kiosk-check-in"
import { Loader2 } from "lucide-react"
import type { OfficeLocation } from "@/lib/firebase/auth"
import { getEmployeeFullName, type Employee } from "@/lib/hr/types"

// Default office location (can be configured per deployment)
const DEFAULT_OFFICE_LOCATION: OfficeLocation = {
  lat: 44.4268,
  lng: 26.1025,
  address: "București, România",
}

export default function KioskOnlyPage() {
  const [users, setUsers] = useState<KioskUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTechnicians()
  }, [])

  const loadTechnicians = async () => {
    try {
      setLoading(true)

      // Load employees (Salariați) first, then join to tehnician users by employee.userUid.
      // We avoid composite index requirements by ordering and filtering client-side.
      const employeesSnap = await getDocs(query(collection(db, "hrEmployees"), orderBy("nume", "asc")))
      const employees: Employee[] = employeesSnap.docs.map((d) => {
        const data = d.data() as any
        return {
          id: d.id,
          nume: data.nume ?? "",
          prenume: data.prenume ?? "",
          active: Boolean(data.active),
          userUid: data.userUid ?? undefined,
          photoURL: data.photoURL ?? undefined,
          fullName: data.fullName ?? undefined,
          // other fields omitted (not needed on kiosk)
        } as Employee
      })

      // Load tehnician users to fetch email for password verification.
      const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "tehnician")))
      const usersByUid = new Map<string, { uid: string; email?: string; role?: string; displayName?: string }>()
      for (const d of usersSnap.docs) {
        const data = d.data() as any
        usersByUid.set(d.id, {
          uid: d.id,
          email: data.email ? String(data.email) : undefined,
          role: data.role ? String(data.role) : undefined,
          displayName: data.displayName ? String(data.displayName) : undefined,
        })
      }

      const loadedUsers: KioskUser[] = employees
        .filter((e) => e.active)
        .map((e) => {
          const fullName = getEmployeeFullName(e) || "Salariat"
          const userUid = e.userUid ? String(e.userUid) : ""
          const matched = userUid ? usersByUid.get(userUid) : undefined

          // Show ONLY employees linked to a valid tehnician user with email.
          if (!matched?.uid || !matched.email) return null
          return {
            uid: matched.uid,
            displayName: fullName,
            role: "tehnician",
            email: matched.email,
            photoURL: e.photoURL,
          } satisfies KioskUser
        })
        .filter((u): u is KioskUser => Boolean(u))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))

      setUsers(loadedUsers)
      setError(null)
    } catch (err) {
      console.error("Failed to load users:", err)
      setError("Nu s-au putut încărca salariații / utilizatorii. Verifică conexiunea.")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Se încarcă...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-400 text-xl font-semibold">{error}</div>
          <button
            onClick={loadTechnicians}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Încearcă din nou
          </button>
        </div>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-xl">Nu sunt tehnicieni disponibili.</p>
        </div>
      </div>
    )
  }

  return <KioskCheckIn users={users} officeLocation={DEFAULT_OFFICE_LOCATION} />
}


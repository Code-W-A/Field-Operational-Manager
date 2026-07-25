"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, orderBy, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { KioskCheckIn, type KioskUser } from "@/components/attendance/kiosk-check-in"
import { Loader2 } from "lucide-react"
import type { OfficeLocation } from "@/lib/firebase/auth"
import type { Employee } from "@/lib/hr/types"
import { loadKioskEligibleRoster } from "@/lib/attendance/kiosk-roster-loader"

// Default office location (can be configured per deployment)
const DEFAULT_OFFICE_LOCATION: OfficeLocation = {
  lat: 44.4268,
  lng: 26.1025,
  address: "București, România",
}

const KIOSK_ROSTER_QUERY_TIMEOUT_MS = 10_000

function withKioskRosterQueryTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Kiosk roster query timed out")), KIOSK_ROSTER_QUERY_TIMEOUT_MS)
  })
  return Promise.race([request, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export default function KioskOnlyPage() {
  const [users, setUsers] = useState<KioskUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEligibleUsers()
  }, [])

  const loadEligibleUsers = async () => {
    try {
      setLoading(true)

      // Load employees (Salariați) first, then join to eligible users by employee.userUid.
      // We avoid composite index requirements by ordering and filtering client-side.
      const loadedUsers: KioskUser[] = await loadKioskEligibleRoster({
        loadEmployees: async () => {
          const employeesSnap = await withKioskRosterQueryTimeout(
            getDocs(query(collection(db, "hrEmployees"), orderBy("nume", "asc"))),
          )
          return employeesSnap.docs.map((d) => {
            const data = d.data() as any
            return {
              id: d.id,
              nume: data.nume ?? "",
              prenume: data.prenume ?? "",
              active: Boolean(data.active),
              userUid: data.userUid ?? undefined,
              photoURL: data.photoURL ?? undefined,
              fullName: data.fullName ?? undefined,
            } as Employee
          })
        },
        loadUsersForRole: async (role) => {
          const snapshot = await withKioskRosterQueryTimeout(
            getDocs(query(collection(db, "users"), where("role", "==", role))),
          )
          return snapshot.docs.map((d) => {
            const data = d.data() as any
            const pin = data.kioskPin ? String(data.kioskPin).trim() : ""
            return {
              uid: d.id,
              email: data.email ? String(data.email) : undefined,
              role: data.role ? String(data.role) : undefined,
              displayName: data.displayName ? String(data.displayName) : undefined,
              ...(pin ? { kioskPin: pin } : {}),
            }
          })
        },
      })

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
      <main data-testid="kiosk-roster-loading" className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Se încarcă...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main data-testid="kiosk-roster-error" className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-400 text-xl font-semibold">{error}</div>
          <button
            data-testid="kiosk-roster-retry"
            onClick={loadEligibleUsers}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Încearcă din nou
          </button>
        </div>
      </main>
    )
  }

  if (users.length === 0) {
    return (
      <main data-testid="kiosk-roster-empty" className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-xl">Nu sunt utilizatori eligibili disponibili.</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <KioskCheckIn users={users} officeLocation={DEFAULT_OFFICE_LOCATION} />
    </main>
  )
}

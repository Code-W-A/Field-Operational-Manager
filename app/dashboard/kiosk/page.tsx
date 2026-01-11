"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { KioskCheckIn, KioskUser } from "@/components/attendance/kiosk-check-in"
import { Loader2 } from "lucide-react"
import type { OfficeLocation } from "@/lib/firebase/auth"

// Default office location (can be configured per deployment)
const DEFAULT_OFFICE_LOCATION: OfficeLocation = {
  lat: 44.4268,
  lng: 26.1025,
  address: "București, România",
}

export default function KioskPage() {
  const [users, setUsers] = useState<KioskUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTechnicians()
  }, [])

  const loadTechnicians = async () => {
    try {
      setLoading(true)
      
      // Load all users with role "tehnician" or "admin" (who can use the kiosk)
      const usersRef = collection(db, "users")
      const q = query(usersRef, where("role", "in", ["tehnician", "admin"]))
      const snapshot = await getDocs(q)

      const loadedUsers: KioskUser[] = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          uid: doc.id,
          displayName: data.displayName || data.email || "Unknown User",
          role: data.role || "tehnician",
        }
      })

      // Sort by display name
      loadedUsers.sort((a, b) => a.displayName.localeCompare(b.displayName))

      setUsers(loadedUsers)
      setError(null)
    } catch (err) {
      console.error("Failed to load users:", err)
      setError("Nu s-au putut încărca utilizatorii. Verifică conexiunea.")
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

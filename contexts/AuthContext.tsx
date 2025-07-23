"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { type User, onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/config"
import type { UserData } from "@/lib/firebase/auth"
import { useMockData } from "./MockDataContext"

interface AuthContextType {
  user: User | null
  userData: UserData | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const { isPreview, currentUser } = useMockData()

  useEffect(() => {
    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
      // Simulăm un timp de încărcare
      const timer = setTimeout(() => {
        setUserData(currentUser as UserData)
        console.log("Preview mode: Setting mock user data", currentUser)
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }

    // Altfel, utilizăm Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)

      if (user) {
        try {
          console.log("Fetching user data for:", user.uid)
          const docRef = doc(db, "users", user.uid)
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            const data = docSnap.data() as UserData
            console.log("User data loaded:", data)
            setUserData(data)
          } else {
            console.log("No user data found in Firestore")
          }
        } catch (error) {
          console.error("Eroare la obținerea datelor utilizatorului:", error)
        }
      } else {
        setUserData(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [isPreview, currentUser])

  return <AuthContext.Provider value={{ user, userData, loading }}>{children}</AuthContext.Provider>
}

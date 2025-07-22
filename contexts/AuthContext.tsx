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

  console.log("🔒🚀 AuthProvider MOUNTED")
  console.log("🔒📊 AuthProvider initial state:", { hasUser: !!user, hasUserData: !!userData, loading, isPreview })

  useEffect(() => {
    console.log("🔒🔄 AuthProvider useEffect TRIGGERED:", { isPreview, hasCurrentUser: !!currentUser })
    
    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
      console.log("🔒🎭 PREVIEW MODE - setting mock user:", currentUser)
      // Simulăm un timp de încărcare
      const timer = setTimeout(() => {
        setUserData(currentUser as UserData)
        console.log("🔒✅ Preview mode: Mock user data SET:", currentUser)
        setLoading(false)
      }, 1000)

      return () => {
        console.log("🔒🧹 Preview timer cleanup")
        clearTimeout(timer)
      }
    }

    // Altfel, utilizăm Firebase Auth
    console.log("🔒🚀 Setting up Firebase Auth listener")
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("🔒💥 AUTH STATE CHANGED EVENT:", {
        hasUser: !!user,
        uid: user?.uid,
        email: user?.email,
        timestamp: new Date().toISOString()
      })
      
      setUser(user)

      if (user) {
        console.log("🔒👤 User detected, fetching user data...")
        try {
          console.log("🔒📝 Fetching user data for UID:", user.uid)
          
          // Verificăm dacă token-ul este valid înainte de a face query-uri
          console.log("🔒🎟️ Checking token validity...")
          const idToken = await user.getIdToken(false) // false = nu forța refresh
          console.log("🔒✅ Token verificat:", !!idToken, "Length:", idToken?.length)
          
          console.log("🔒📊 Querying Firestore for user data...")
          const docRef = doc(db, "users", user.uid)
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            const data = docSnap.data() as UserData
            console.log("🔒✅ User data loaded successfully:", {
              displayName: data.displayName,
              email: data.email,
              role: data.role,
              hasPhone: !!data.telefon
            })
            setUserData(data)
          } else {
            console.log("🔒⚠️ No user data found in Firestore for UID:", user.uid)
            // Nu forțăm logout dacă nu găsim datele user-ului în Firestore
            // setUserData({} as UserData) // fallback
          }
        } catch (error) {
          console.error("❌🔒 CRITICAL ERROR fetching user data:", {
            error: error,
            uid: user.uid,
            errorCode: (error as any).code,
            errorMessage: (error as any).message,
            stack: (error as any).stack,
            timestamp: new Date().toISOString()
          })
          
          // Nu setăm user-ul ca null aici pentru că poate fi doar o problemă temporară
          // În schimb, re-try după o pauză scurtă
          console.log("⏳🔒 RETRY: Attempting to get user data again in 2 seconds...")
          setTimeout(async () => {
            try {
              console.log("🔒🔄 RETRY: Fetching user data...")
              const docRef = doc(db, "users", user.uid)
              const docSnap = await getDoc(docRef)
              if (docSnap.exists()) {
                const data = docSnap.data() as UserData
                setUserData(data)
                console.log("✅🔒 RETRY SUCCESS: User data loaded:", data.displayName)
              } else {
                console.log("❌🔒 RETRY: Still no user data found")
              }
            } catch (retryError) {
              console.error("❌🔒 RETRY FAILED:", retryError)
            }
          }, 2000)
        }
      } else {
        console.log("🚪🔒 USER LOGGED OUT - clearing user data")
        setUserData(null)
      }

      console.log("🔒📊 Setting loading to false")
      setLoading(false)
    })

    console.log("🔒👂 Firebase Auth listener attached")
    return () => {
      console.log("🔒🧹 Firebase Auth listener cleanup")
      unsubscribe()
    }
  }, [isPreview, currentUser])

  console.log("🔒🎨 AuthProvider rendering with state:", { hasUser: !!user, hasUserData: !!userData, loading })
  return <AuthContext.Provider value={{ user, userData, loading }}>{children}</AuthContext.Provider>
}

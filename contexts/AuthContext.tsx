"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { type User, onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/config"
import type { UserData } from "@/lib/firebase/auth"
import { clearServerSessionCookie, syncServerSessionCookie } from "@/lib/auth/sync-server-session"
import { reportToSentry } from "@/lib/sentry/report-error"
import { useSentryUserSync } from "@/lib/sentry/use-sentry-user-sync"
import { useMockData } from "./MockDataContext"
import { toast } from "@/hooks/use-toast"

interface AuthContextType {
  user: User | null
  userData: UserData | null
  loading: boolean
  showWelcomeDialog: boolean
  hideWelcomeDialog: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  showWelcomeDialog: false,
  hideWelcomeDialog: () => {},
})

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dailyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasShownWelcomeThisSessionRef = useRef(false)
  const { isPreview, currentUser } = useMockData()

  useSentryUserSync({
    firebaseUser: user,
    userData,
    isPreview,
    mockUser: currentUser,
  })

  const hideWelcomeDialog = () => {
    setShowWelcomeDialog(false)
    hasShownWelcomeThisSessionRef.current = true
  }

  // Auto logout at 02:00 function
  const scheduleAutoLogout = (userDataToCheck?: UserData | null) => {
    const dataToCheck = userDataToCheck || userData
    
    // Don't schedule auto-logout for kiosk mode users
    if (dataToCheck?.isKioskMode) {
      if (process.env.NODE_ENV === 'development') {
        console.log("🏢 Kiosk mode: Auto logout disabled")
      }
      return
    }

    // Clear any existing timer first
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }

    const now = new Date()
    const twoAM = new Date()
    twoAM.setHours(2, 0, 0, 0)
    
    // If it's already past 2 AM today, schedule for tomorrow
    if (now > twoAM) {
      twoAM.setDate(twoAM.getDate() + 1)
    }
    
    const timeUntilLogout = twoAM.getTime() - now.getTime()
    
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🕐 Auto logout programat în ${Math.round(timeUntilLogout / 1000 / 60 / 60)} ore`)
    }
    
    logoutTimerRef.current = setTimeout(async () => {
      try {
        // Show toast BEFORE logout to ensure context exists
        toast({
          title: "Sesiune închisă automat",
          description: "Pentru securitate, sesiunea a fost închisă automat la ora 02:00.",
          variant: "default",
        })

        // Wait a bit for toast to appear
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (!isPreview && auth.currentUser) {
          if (process.env.NODE_ENV === 'development') {
            console.log("🚪 Executing auto logout at 02:00")
          }
          await signOut(auth)
        } else if (isPreview) {
          if (process.env.NODE_ENV === 'development') {
            console.log("🚪 Preview mode: Simulating auto logout at 02:00")
          }
          // In preview mode, just show the toast, don't actually logout
        }
      } catch (error) {
        console.error("Eroare la logout automat:", error)
        reportToSentry(error, { tags: { area: "auth", op: "auto-logout" } })
      }
      
      // Clear the timer reference
      logoutTimerRef.current = null
      
      // DON'T call scheduleAutoLogout() again here to avoid infinite recursion
      // The new login will trigger it via onAuthStateChanged
    }, timeUntilLogout)
  }

  // Function to setup daily check for rescheduling logout
  const setupDailyLogoutCheck = () => {
    // Clear any existing interval
    if (dailyCheckIntervalRef.current) {
      clearInterval(dailyCheckIntervalRef.current)
      dailyCheckIntervalRef.current = null
    }

    // Check every hour if we need to reschedule logout for tomorrow
    dailyCheckIntervalRef.current = setInterval(() => {
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      
      // At 00:01 (just after midnight), schedule logout for the new day
      if (currentHour === 0 && currentMinute <= 5) { // 5 minute window instead of exact minute
        if (process.env.NODE_ENV === 'development') {
          console.log("🔄 Reprogramez logout automat pentru noua zi")
        }
        if ((auth.currentUser && !isPreview) || (isPreview && userData)) {
          scheduleAutoLogout()
        }
      }
    }, 3600000) // Check every hour (3600000 ms) NOT every minute
  }

  // Cleanup function for all timers
  const cleanupTimers = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
    if (dailyCheckIntervalRef.current) {
      clearInterval(dailyCheckIntervalRef.current)
      dailyCheckIntervalRef.current = null
    }
  }

  useEffect(() => {
    // Dacă suntem în mediul de preview, utilizăm datele mock
    if (isPreview) {
      // Simulăm un timp de încărcare
      const timer = setTimeout(() => {
        setUserData(currentUser as UserData)
        console.log("Preview mode: Setting mock user data", currentUser)
        setLoading(false)
        
        // Show welcome dialog for admin/dispatcher roles only
        if (currentUser && 
            (currentUser.role === 'admin' || currentUser.role === 'dispecer') &&
            !hasShownWelcomeThisSessionRef.current) {
          setShowWelcomeDialog(true)
        }

        // Schedule auto logout even in preview mode for testing
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'dispecer')) {
          scheduleAutoLogout()
          setupDailyLogoutCheck()
        }
      }, 1000)

      return () => {
        clearTimeout(timer)
        cleanupTimers()
      }
    }

    // Altfel, utilizăm Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)

      if (user) {
        if (!isPreview) {
          try {
            await syncServerSessionCookie(user)
          } catch (err) {
            reportToSentry(err, { tags: { area: "auth", op: "sync-server-session-cookie" } })
          }
        }
        try {
          console.log("Fetching user data for:", user.uid)
          const docRef = doc(db, "users", user.uid)
          const docSnap = await getDoc(docRef)

          if (docSnap.exists()) {
            const data = docSnap.data() as UserData
            console.log("User data loaded:", data)
            setUserData(data)
            
            // Show welcome dialog for admin/dispatcher roles only
            if ((data.role === 'admin' || data.role === 'dispecer') &&
                !hasShownWelcomeThisSessionRef.current) {
              setShowWelcomeDialog(true)
            }
            
            // Schedule auto logout for authenticated users (except kiosk mode)
            scheduleAutoLogout(data)
            setupDailyLogoutCheck()
          } else {
            console.log("No user data found in Firestore")
          }
        } catch (error) {
          console.error("Eroare la obținerea datelor utilizatorului:", error)
          reportToSentry(error, { tags: { area: "auth", op: "firestore-user-doc" } })
        }
      } else {
        if (!isPreview) {
          void clearServerSessionCookie()
        }
        setUserData(null)
        // Clear all timers when user logs out
        cleanupTimers()
        hasShownWelcomeThisSessionRef.current = false
      }

      setLoading(false)
    })

    return () => {
      unsubscribe()
      cleanupTimers()
    }
  }, [isPreview, currentUser])

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        userData, 
        loading, 
        showWelcomeDialog, 
        hideWelcomeDialog 
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

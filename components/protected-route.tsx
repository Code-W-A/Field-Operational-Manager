"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/lib/firebase/auth"

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, userData, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isClient = userData?.role === "client"
  const isTechnician = userData?.role === "tehnician"
  const isKiosk = userData?.role === "kiosk"
  const isDashboard = pathname?.startsWith("/dashboard")
  const isAllowedLucrari = pathname === "/dashboard/lucrari" || pathname?.startsWith("/dashboard/lucrari/")
  const isAllowedHistory = pathname === "/dashboard/istoric-interventii" || pathname?.startsWith("/dashboard/istoric-interventii/")

  const shouldRedirectClientToPortal = !!user && isClient && isDashboard && !isAllowedLucrari && !isAllowedHistory
  const shouldRedirectTechnicianToLucrari = !!user && isTechnician && pathname === "/dashboard"
  const shouldRedirectKioskToKiosk = !!user && isKiosk && pathname !== "/kiosk" && !pathname?.startsWith("/kiosk/")
  const shouldBlockUntilRoleKnown = !!user && !loading && !userData

  useEffect(() => {
    if (!loading) {
      // Keep a lightweight role cookie for middleware-based redirects (non-sensitive).
      // This avoids flashing protected pages before client-side redirect runs.
      try {
        if (user && userData?.role) {
          document.cookie = `userRole=${encodeURIComponent(String(userData.role))}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
        } else if (!user) {
          document.cookie = "userRole=; Path=/; Max-Age=0; SameSite=Lax"
        }
      } catch {}

      // Adăugăm logging pentru debugging
      console.log("ProtectedRoute check:", {
        user: !!user,
        userData: userData,
        allowedRoles,
        hasRole: userData && allowedRoles ? allowedRoles.includes(userData.role) : false,
        pathname,
      })

      if (!user) {
        router.push("/login")
      } else if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
        console.log("User does not have required role, redirecting to dashboard")
        router.push("/dashboard")
      } else if (userData?.role === "kiosk" && pathname !== "/kiosk" && !pathname?.startsWith("/kiosk/")) {
        // Kiosk accounts must stay on the dedicated kiosk page.
        router.replace("/kiosk")
      } else if (userData?.role === "tehnician" && pathname === "/dashboard") {
        // Redirect technicians from /dashboard to /dashboard/lucrari
        console.log("Technician accessing dashboard, redirecting to tichete")
        router.push("/dashboard/lucrari")
      } else if (userData?.role === "tehnician" && pathname?.includes("/dashboard/clienti")) {
        // Prevent technicians from accessing the Clients page
        console.log("Technician attempting to access Clients page, redirecting to dashboard/tichete")
        router.push("/dashboard/lucrari")
      } else if (userData?.role === "client") {
        // Clients: allow only /dashboard/lucrari and its subroutes; redirect others to /portal
        if (isDashboard && !isAllowedLucrari && !isAllowedHistory) {
          router.push("/portal")
        }
      }
    }
  }, [user, userData, loading, router, allowedRoles, pathname])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  // Prevent UI flashes before role-based redirects.
  if (shouldBlockUntilRoleKnown || shouldRedirectClientToPortal || shouldRedirectTechnicianToLucrari || shouldRedirectKioskToKiosk) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
    return null
  }

  return <>{children}</>
}

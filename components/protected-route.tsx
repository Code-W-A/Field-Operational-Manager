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

  useEffect(() => {
    if (!loading) {
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
      } else if (userData?.role === "tehnician" && pathname === "/dashboard") {
        // Redirect technicians from /dashboard to /dashboard/lucrari
        console.log("Technician accessing dashboard, redirecting to lucrari")
        router.push("/dashboard/lucrari")
      } else if (userData?.role === "tehnician" && pathname?.includes("/dashboard/clienti")) {
        // Prevent technicians from accessing the Clients page
        console.log("Technician attempting to access Clients page, redirecting to dashboard/lucrari")
        router.push("/dashboard/lucrari")
      } else if (userData?.role === "client") {
        // Clients: allow only /dashboard/lucrari and its subroutes; redirect others to /portal
        const isDashboard = pathname?.startsWith("/dashboard")
        const isAllowedLucrari = pathname === "/dashboard/lucrari" || pathname?.startsWith("/dashboard/lucrari/")
        if (isDashboard && !isAllowedLucrari) {
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

  if (!user) {
    return null
  }

  if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
    return null
  }

  return <>{children}</>
}

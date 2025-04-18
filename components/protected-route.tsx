"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/lib/firebase/auth"

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, userData, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      // Adăugăm logging pentru debugging
      console.log("ProtectedRoute check:", {
        user: !!user,
        userData: userData,
        allowedRoles,
        hasRole: userData && allowedRoles ? allowedRoles.includes(userData.role) : false,
      })

      if (!user) {
        router.push("/login")
      } else if (allowedRoles && userData && !allowedRoles.includes(userData.role)) {
        console.log("User does not have required role, redirecting to dashboard")
        router.push("/dashboard")
      }
    }
  }, [user, userData, loading, router, allowedRoles])

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

"use client"

import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { setupGlobalModalCleanup } from "@/lib/utils/modal-cleanup"
import { useEffect } from "react"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  useEffect(() => {
    // Setup global modal cleanup to prevent interaction issues
    setupGlobalModalCleanup()
  }, [])

  return (
    <ProtectedRoute>
      <div className="h-full w-full overflow-auto">{children}</div>
    </ProtectedRoute>
  )
}

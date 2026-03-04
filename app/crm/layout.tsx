"use client"

import type { ReactNode } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { DashboardShell } from "@/components/dashboard-shell"

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["admin", "dispecer"]}>
      <DashboardShell>{children}</DashboardShell>
    </ProtectedRoute>
  )
}

"use client"

import type { ReactNode } from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function CrmDashboardLayout({ children }: { children: ReactNode }) {
  return <ProtectedRoute allowedRoles={["admin", "dispecer"]}>{children}</ProtectedRoute>
}

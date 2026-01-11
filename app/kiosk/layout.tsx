"use client"

import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={["kiosk"]}>{children}</ProtectedRoute>
}


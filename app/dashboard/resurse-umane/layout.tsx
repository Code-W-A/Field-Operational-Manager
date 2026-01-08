import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function ResurseUmaneLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={["admin", "dispecer"]}>{children}</ProtectedRoute>
}



import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function ContracteLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute allowedRoles={["admin"]}>{children}</ProtectedRoute>
}

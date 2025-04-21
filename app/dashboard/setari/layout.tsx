import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function SetariLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <ProtectedRoute allowedRoles={["admin"]}>{children}</ProtectedRoute>
}

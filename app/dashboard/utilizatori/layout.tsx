import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function UtilizatoriLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Adăugăm un console.log pentru debugging
  console.log("Rendering UtilizatoriLayout")

  return <ProtectedRoute allowedRoles={["admin"]}>{children}</ProtectedRoute>
}

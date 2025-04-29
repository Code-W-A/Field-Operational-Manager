import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ProtectedRoute>
      <div className="h-full w-full overflow-auto">{children}</div>
    </ProtectedRoute>
  )
}

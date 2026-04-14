"use client"

import type React from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { SentryErrorBoundary } from "@/components/sentry-error-boundary"

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={["kiosk"]}>
      <SentryErrorBoundary fallbackTitle="Eroare în modul kiosk">{children}</SentryErrorBoundary>
    </ProtectedRoute>
  )
}


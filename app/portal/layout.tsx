"use client"

import type { ReactNode } from "react"
import { SentryErrorBoundary } from "@/components/sentry-error-boundary"

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <SentryErrorBoundary fallbackTitle="Eroare în portalul client">
      {children}
    </SentryErrorBoundary>
  )
}

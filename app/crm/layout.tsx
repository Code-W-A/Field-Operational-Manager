"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { DashboardShell } from "@/components/dashboard-shell"
import { cn } from "@/lib/utils"

export default function CrmLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isOpportunitiesRoute = pathname === "/crm/opportunities" || pathname.startsWith("/crm/opportunities/")
  const isInterneRoute = pathname === "/crm/interne" || pathname.startsWith("/crm/interne/")
  const isFullHeightRoute = isOpportunitiesRoute || isInterneRoute

  return (
    <ProtectedRoute allowedRoles={["admin", "dispecer", "tehnician"]}>
      <DashboardShell>
        <div
          className={cn(
            "-mx-3 flex flex-1 min-h-0 flex-col sm:-mx-6 lg:-mx-10",
            isFullHeightRoute && "-mb-24 min-h-[calc(100%+6rem)] xl:-mt-4 xl:-mb-24 xl:min-h-[calc(100%+7rem)]"
          )}
        >
          {children}
        </div>
      </DashboardShell>
    </ProtectedRoute>
  )
}

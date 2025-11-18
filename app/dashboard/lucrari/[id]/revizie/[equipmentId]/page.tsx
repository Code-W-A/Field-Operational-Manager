"use client"

import { useParams } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { RevisionOperationsSheet } from "@/components/revision-operations-sheet"

export default function RevisionEquipmentPage() {
  const params = useParams<{ id: string; equipmentId: string }>()
  const workId = params?.id as string
  const equipmentId = params?.equipmentId as string

  return (
    <DashboardShell>
      <DashboardHeader heading="Fișă revizie" text="Completează fișa de operațiuni pentru echipament." />
      <div className="grid gap-4">
        <RevisionOperationsSheet workId={workId} equipmentId={equipmentId} />
      </div>
    </DashboardShell>
  )
}



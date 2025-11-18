"use client"

import { useParams, useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { RevisionOperationsSheet } from "@/components/revision-operations-sheet"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export default function RevisionEquipmentPage() {
  const params = useParams<{ id: string; equipmentId: string }>()
  const router = useRouter()
  const workId = params?.id as string
  const equipmentId = params?.equipmentId as string

  return (
    <DashboardShell>
      {/* Buton Back elegant */}
      <div className="mb-2">
        <Button 
          variant="ghost" 
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Înapoi la lucrare
        </Button>
      </div>
      
      <DashboardHeader heading="Fișă revizie" text="Completează fișa de operațiuni pentru echipament." />
      <div className="grid gap-4">
        <RevisionOperationsSheet workId={workId} equipmentId={equipmentId} />
      </div>
    </DashboardShell>
  )
}



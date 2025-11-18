"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { RevisionOperationsSheet } from "@/components/revision-operations-sheet"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function RevisionEquipmentPage() {
  const params = useParams<{ id: string; equipmentId: string }>()
  const router = useRouter()
  const workId = params?.id as string
  const equipmentId = params?.equipmentId as string
  
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const hasUnsavedChangesRef = useRef(false)
  const saveDraftRef = useRef<(() => Promise<boolean>) | null>(null)

  const handleBack = () => {
    if (hasUnsavedChangesRef.current) {
      setShowUnsavedDialog(true)
    } else {
      router.back()
    }
  }

  const handleSaveAndBack = async () => {
    if (saveDraftRef.current) {
      const saved = await saveDraftRef.current()
      if (saved) {
        router.back()
      }
    }
  }

  const handleDiscardAndBack = () => {
    router.back()
  }

  return (
    <DashboardShell>
      {/* Buton Back elegant */}
      <div className="mb-2">
        <Button 
          variant="ghost" 
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground -ml-2"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Înapoi la lucrare
        </Button>
      </div>
      
      <DashboardHeader heading="Fișă revizie" text="Completează fișa de operațiuni pentru echipament." />
      <div className="grid gap-4">
        <RevisionOperationsSheet 
          workId={workId} 
          equipmentId={equipmentId}
          onUnsavedChanges={(hasChanges) => {
            hasUnsavedChangesRef.current = hasChanges
          }}
          onSaveDraftRef={(saveFn) => {
            saveDraftRef.current = saveFn
          }}
        />
      </div>

      {/* Dialog pentru modificări nesalvate */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modificări nesalvate</AlertDialogTitle>
            <AlertDialogDescription>
              Ai modificări nesalvate în fișa de operațiuni. Vrei să le salvezi înainte de a pleca?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={handleDiscardAndBack} className="sm:order-1">
              Nu salva
            </AlertDialogCancel>
            <AlertDialogCancel onClick={() => setShowUnsavedDialog(false)} className="sm:order-2">
              Rămâi aici
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndBack} className="sm:order-3">
              Salvează și ieși
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}



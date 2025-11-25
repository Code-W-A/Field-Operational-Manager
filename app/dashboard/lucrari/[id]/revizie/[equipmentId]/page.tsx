"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { RevisionOperationsSheet } from "@/components/revision-operations-sheet"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Loader2 } from "lucide-react"
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
import { getLucrareById, getClienti } from "@/lib/firebase/firestore"

export default function RevisionEquipmentPage() {
  const params = useParams<{ id: string; equipmentId: string }>()
  const router = useRouter()
  const workId = params?.id as string
  const equipmentId = params?.equipmentId as string
  
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const hasUnsavedChangesRef = useRef(false)
  const saveDraftRef = useRef<(() => Promise<boolean>) | null>(null)
  const [equipmentName, setEquipmentName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [checklistRootId, setChecklistRootId] = useState<string | undefined>(undefined)

  // Fetch equipment name and per‑equipment checklist template from work order and client data
  useEffect(() => {
    const fetchEquipmentName = async () => {
      try {
        const work = await getLucrareById(workId)
        if (work) {
          // 1) Încercăm mai întâi din metadata de revizie (are deja nume/cod)
          const revList = Array.isArray((work as any)?.revision?.equipment)
            ? (work as any).revision.equipment
            : []
          const byId = revList.find((r: any) => String(r.equipmentId) === String(equipmentId))
          const byCode = revList.find((r: any) => String(r.equipmentCode) === String(equipmentId))
          const revMatch = byId || byCode
          if (revMatch?.equipmentName) {
            setEquipmentName(revMatch.equipmentName)
            // Per‑equipment template selection (saved alongside the mapped equipment in work.revision.equipment)
            if (revMatch?.revisionChecklistTemplateId) {
              setChecklistRootId(String(revMatch.revisionChecklistTemplateId))
            }
            return
          }

          // 2) Căutăm în client/locație după id sau cod
          const clients = await getClienti()
          const client = clients.find((c: any) => c.nume === work.client)
          const location = client?.locatii?.find((l: any) => l.nume === work.locatie)
          const eqById = location?.echipamente?.find(
            (e: any) => String(e.id) === String(equipmentId)
          )
          const eqByCode = location?.echipamente?.find(
            (e: any) => String(e.cod) === String(equipmentId)
          )
          const eq = eqById || eqByCode
          const name = eq?.denumire || eq?.nume || eq?.name
          if (name) setEquipmentName(name)
          // Per‑equipment template selection saved on equipment object
          if (eq?.revisionChecklistTemplateId) {
            setChecklistRootId(String(eq.revisionChecklistTemplateId))
          } else if (eq?.revisionChecklistTemplate?.id) {
            // legacy/alternate shape
            setChecklistRootId(String(eq.revisionChecklistTemplate.id))
          } else if (eq?.dynamicSettings?.["revision.checklistParentId"]) {
            // Highest priority: explicit selected category/section
            const useForSheet = eq?.dynamicSettings?.["revision.useChecklistForSheet"]
            if (useForSheet === undefined || !!useForSheet) {
              setChecklistRootId(String(eq.dynamicSettings["revision.checklistParentId"]))
            }
          } else if (eq?.dynamicSettings?.["revision.checklistTemplateId"]) {
            // stored in dynamicSettings
            const useForSheet = eq?.dynamicSettings?.["revision.useChecklistForSheet"]
            if (useForSheet === undefined || !!useForSheet) {
              setChecklistRootId(String(eq.dynamicSettings["revision.checklistTemplateId"]))
            }
          }
        }
      } catch (error) {
        console.error("Error fetching equipment name:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchEquipmentName()
  }, [workId, equipmentId])

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
    // Allow actual back navigation: temporarily remove popstate handler to avoid re-blocking
    try {
      if (popstateHandlerRef.current) {
        window.removeEventListener("popstate", popstateHandlerRef.current as any)
      }
    } catch {}
    router.back()
  }

  // Trap device/browser back when there are unsaved changes
  const popstateHandlerRef = useRef<((e: PopStateEvent) => void) | null>(null)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (hasUnsavedChangesRef.current) {
        // Re-push the current state to cancel the back and show confirm dialog
        try {
          history.pushState(null, "", location.href)
        } catch {}
        setShowUnsavedDialog(true)
      }
    }
    popstateHandlerRef.current = handlePopState
    window.addEventListener("popstate", handlePopState)
    // Push a state so the first back triggers popstate instead of leaving immediately
    try {
      history.pushState(null, "", location.href)
    } catch {}
    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [])

  // Warn on tab close/refresh if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChangesRef.current) return
      e.preventDefault()
      e.returnValue = ""
      return ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă...
        </div>
      </DashboardShell>
    )
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
          equipmentName={equipmentName}
          checklistRootId={checklistRootId}
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



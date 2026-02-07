"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, Image as ImageIcon, Plus, X, Trash2, MessageSquare } from "lucide-react"
import { subscribeRevisionChecklist } from "@/lib/revisions/checklist"
import { getRevisionDoc, subscribeRevisionDoc, upsertRevisionDoc, uploadRevisionPhoto } from "@/lib/firebase/revisions"
import type { RevisionPhotoMeta } from "@/lib/firebase/revisions"
import type { RevisionChecklistSection, RevisionChecklistItem } from "@/types/revision"
import { useAuth } from "@/contexts/AuthContext"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { getLucrareById, getClienti, updateLucrare } from "@/lib/firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { formatUiDate, formatTime } from "@/lib/utils/time-format"

type Props = {
  workId: string
  equipmentId: string
  equipmentName?: string
  checklistRootId?: string
  onUnsavedChanges?: (hasChanges: boolean) => void
  onSaveDraftRef?: (saveFn: () => Promise<boolean>) => void
}

type ItemState = "functional" | "nefunctional"

export function RevisionOperationsSheet({ workId, equipmentId, equipmentName, checklistRootId, onUnsavedChanges, onSaveDraftRef }: Props) {
  const { userData } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<RevisionChecklistSection[]>([])
  const [values, setValues] = useState<Record<string, ItemState | undefined>>({})
  const [obs, setObs] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [existingPhotos, setExistingPhotos] = useState<RevisionPhotoMeta[]>([])
  // QR validation gating
  const [expectedCode, setExpectedCode] = useState<string | undefined>(undefined)
  const [expectedClient, setExpectedClient] = useState<string | undefined>(undefined)
  const [expectedLocation, setExpectedLocation] = useState<string | undefined>(undefined)
  const [verified, setVerified] = useState(false)
  const [loadingGate, setLoadingGate] = useState(true)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [initialValues, setInitialValues] = useState<Record<string, ItemState | undefined>>({})
  const [initialObs, setInitialObs] = useState<Record<string, string>>({})
  const [equipmentTimes, setEquipmentTimes] = useState<Record<
    string,
    { startIso?: string; endIso?: string; durationMinutes?: number; durationText?: string }
  >>({})
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [obsDialogOpen, setObsDialogOpen] = useState(false)
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null)
  const [dialogItemId, setDialogItemId] = useState<string | null>(null)
  const [dialogItemLabel, setDialogItemLabel] = useState("")
  const [dialogItemObs, setDialogItemObs] = useState("")

  // Load checklist and existing doc with real-time updates
  useEffect(() => {
    let checklistUnsub: (() => void) | null = null
    let revisionUnsub: (() => void) | null = null
    
    // Subscribe to checklist changes (global or per‑equipment custom root)
    const subscribeChecklist = (cb: (c: RevisionChecklist) => void) => {
      if (checklistRootId) {
        // Per‑equipment selected template
        const { subscribeRevisionChecklistFromRoot } = require("@/lib/revisions/checklist")
        return subscribeRevisionChecklistFromRoot(checklistRootId, cb)
      }
      return subscribeRevisionChecklist(cb)
    }

    checklistUnsub = subscribeChecklist((checklist) => {
      // Subscribe to revision doc changes
      revisionUnsub = subscribeRevisionDoc(workId, equipmentId, (existing) => {
        try {
          let baseSections = (existing?.sections?.length ? existing.sections : checklist.sections) || []
          
          // Dacă nu există secțiuni, creăm o secțiune default goală pentru a permite adăugarea manuală
          if (baseSections.length === 0) {
            baseSections = [{
              id: "default-section",
              name: "Puncte de control generale",
              title: "Puncte de control generale",
              items: [],
              order: 0,
            }]
          }
          
          setSections(baseSections)
          if (existing?.sections?.length) {
            // Restore state/obs
            const v: Record<string, ItemState> = {}
            const o: Record<string, string> = {}
            for (const s of existing.sections) {
              for (const it of s.items) {
                // @ts-ignore state may be on item as any
                if ((it as any).state) v[it.id] = (it as any).state
                // @ts-ignore obs may be on item as any
                if ((it as any).obs) o[it.id] = (it as any).obs
              }
            }
            setValues(v)
            setObs(o)
            setInitialValues(v)
            setInitialObs(o)
          }
          
          // Check if QR was already verified for this equipment (real-time)
          if (existing?.qrVerified) {
            setVerified(true)
          }
          
          // Sync existing photos from doc (real-time)
          setExistingPhotos(Array.isArray(existing?.photos) ? existing.photos : [])
          
          setLoading(false)
        } catch (e: any) {
          setError(e?.message || "Eroare la încărcarea fișei")
          setLoading(false)
        }
      })
    })
    
    return () => {
      checklistUnsub?.()
      revisionUnsub?.()
    }
  }, [workId, equipmentId, checklistRootId])

  // Resolve expected QR metadata (client, location, equipment code) for gating
  useEffect(() => {
    const loadGate = async () => {
      try {
        setLoadingGate(true)
        const work = await getLucrareById(workId)
        if (work) {
          setExpectedClient(work.client)
          setExpectedLocation(work.locatie)
          setEquipmentTimes((work as any)?.revisionEquipmentTimes || {})
          try {
            const clients = await getClienti()
            const client = clients.find((c: any) => c.nume === work.client)
            const loc = client?.locatii?.find((l: any) => l.nume === work.locatie)
            const eq =
              loc?.echipamente?.find((e: any) => String(e.id) === String(equipmentId)) ||
              loc?.echipamente?.find((e: any) => String(e.cod) === String(equipmentId))
            if (eq?.cod) setExpectedCode(eq.cod)
            // If the revision doc already captured equipmentName and no code, still allow scan to check only client/location
          } catch {}
        }
      } finally {
        setLoadingGate(false)
      }
    }
    loadGate()
  }, [workId, equipmentId])

  const allCompleted = useMemo(() => {
    const allIds = sections.flatMap((s) => s.items.map((i) => i.id))
    return allIds.length > 0 && allIds.every((id) => values[id])
  }, [sections, values])

  // Detect unsaved changes
  useEffect(() => {
    const valuesChanged = JSON.stringify(values) !== JSON.stringify(initialValues)
    const obsChanged = JSON.stringify(obs) !== JSON.stringify(initialObs)
    const hasChanges = valuesChanged || obsChanged
    setHasUnsavedChanges(hasChanges)
    onUnsavedChanges?.(hasChanges)
  }, [values, obs, initialValues, initialObs, onUnsavedChanges])

  // Provide save draft function to parent
  useEffect(() => {
    onSaveDraftRef?.(handleSaveDraft)
  }, [onSaveDraftRef])

  const overallState: ItemState | undefined = useMemo(() => {
    if (!allCompleted) return undefined
    return Object.values(values).every((v) => v === "functional") ? "functional" : "nefunctional"
  }, [allCompleted, values])

  // Set end time and duration when all items completed (first time)
  useEffect(() => {
    const persistEndIfNeeded = async () => {
      if (!verified || !allCompleted) return
      try {
        const work = await getLucrareById(workId)
        if (work?.tipLucrare !== "Revizie") return
        const times = { ...((work as any)?.revisionEquipmentTimes || {}) }
        const existing = times[equipmentId] || {}
        if (existing.endIso || !existing.startIso) {
          setEquipmentTimes(times)
          return
        }
        const end = new Date()
        const start = new Date(existing.startIso)
        const ms = Math.max(0, end.getTime() - start.getTime())
        const minutes = Math.floor(ms / 60000)
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        times[equipmentId] = {
          ...existing,
          endIso: end.toISOString(),
          durationMinutes: minutes,
          durationText: `${hours}h ${mins}m`,
        }
        await updateLucrare(workId, { revisionEquipmentTimes: times })
        setEquipmentTimes(times)
        console.log("✅ Durată echipament salvată", { equipmentId, ...times[equipmentId] })
      } catch (e) {
        console.error("Eroare la salvarea duratei pe echipament:", e)
      }
    }
    void persistEndIfNeeded()
  }, [verified, allCompleted, workId, equipmentId])

  // Handle photo selection with preview (limit: max 4 photos)
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || [])
    if (incoming.length === 0) return
    setSelectedPhotos((prev) => {
      const availableSlots = Math.max(0, 4 - prev.length)
      const toAdd = incoming.slice(0, availableSlots)
      if (incoming.length > availableSlots) {
        toast({
          title: "Limită depășită",
          description: "Puteți adăuga maximum 4 fotografii la fișa de operațiuni.",
          variant: "destructive",
        })
      }
      // Create previews only for accepted files
      toAdd.forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPhotoPreviewUrls((p) => [...p, reader.result as string])
        }
        reader.readAsDataURL(file)
      })
      return [...prev, ...toAdd]
    })
    // clear input to allow re-selecting the same files next time
    e.currentTarget.value = ""
  }

  // Remove photo from selection
  const handleRemovePhoto = (index: number) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index))
    setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== index))
  }

  // Open add dialog
  const openAddDialog = (sectionId: string) => {
    setDialogSectionId(sectionId)
    setDialogItemLabel("")
    setAddDialogOpen(true)
  }

  // Open observation dialog
  const openObsDialog = (itemId: string) => {
    setDialogItemId(itemId)
    
    // Find item label
    const section = sections.find((s) => s.items.some((i) => i.id === itemId))
    const item = section?.items.find((i) => i.id === itemId)
    
    setDialogItemLabel(item?.label || item?.name || "")
    setDialogItemObs(obs[itemId] || "")
    setObsDialogOpen(true)
  }

  // Handle checkbox change
  const handleCheckboxChange = (itemId: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [itemId]: checked ? "functional" : "nefunctional" }))
  }

  // Save from add dialog
  const handleSaveAddDialog = () => {
    if (!dialogItemLabel.trim() || !dialogSectionId) return
    
    const newItem: RevisionChecklistItem = {
      id: `manual-${Date.now()}-${Math.random()}`,
      name: dialogItemLabel.trim(),
      label: dialogItemLabel.trim(),
      order: 999,
    }
    
    setSections((prev) =>
      prev.map((s) =>
        s.id === dialogSectionId
          ? { ...s, items: [...s.items, newItem] }
          : s
      )
    )
    
    setAddDialogOpen(false)
    setDialogItemLabel("")
    setDialogSectionId(null)
  }

  // Save from observation dialog
  const handleSaveObsDialog = () => {
    if (!dialogItemId) return
    
    setObs((prev) => ({ ...prev, [dialogItemId]: dialogItemObs.trim() }))
    
    setObsDialogOpen(false)
    setDialogItemId(null)
    setDialogItemLabel("")
    setDialogItemObs("")
  }

  // Remove manual item
  const handleRemoveItem = (itemId: string) => {
    if (!window.confirm("Ștergi acest punct de control?")) return
    
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.filter((i) => i.id !== itemId),
      }))
    )
    // Clean up state
    setValues((prev) => {
      const newValues = { ...prev }
      delete newValues[itemId]
      return newValues
    })
    setObs((prev) => {
      const newObs = { ...prev }
      delete newObs[itemId]
      return newObs
    })
  }

  const handleSave = async () => {
    if (!allCompleted) {
      setError("Completați starea pentru toate punctele de control.")
      toast({
        title: "⚠️ Formular incomplet",
        description: "Completați starea pentru toate punctele de control înainte de a salva.",
        variant: "destructive",
        duration: 6000, // 6 secunde
      })
      return
    }
    setError(null)
    setSaving(true)
    try {
      console.log("🔄 Începe salvarea reviziei pentru:", { workId, equipmentId, equipmentName })
      
      // Map back states/obs into sections
      const payloadSections = sections.map((s) => ({
        ...s,
        items: s.items.map((it) => ({
          ...it,
          state: values[it.id]!,
          obs: obs[it.id] || "",
        })),
      }))
      
      console.log("📝 Pas 1: Salvare document revizie...")
      await upsertRevisionDoc(workId, equipmentId, {
        equipmentId,
        equipmentName,
        sections: payloadSections,
        overallState,
        completedAt: new Date().toISOString(),
        completedBy: userData?.uid || "unknown",
        qrVerified: verified,
      })
      console.log("✅ Pas 1 completat: Document revizie salvat")
      
      // Mark equipment as done in lucrare (update nested path to avoid overwriting other statuses)
      console.log("📝 Pas 2: Marcare echipament ca done în tichet...")
      await updateLucrare(
        workId,
        {
          [`revision.equipmentStatus.${equipmentId}`]: "done",
        } as any,
        userData?.uid,
        userData?.displayName || userData?.email || "Utilizator"
      )
      console.log("✅ Pas 2 completat: Echipament marcat ca done")
      
      // Upload ALL photos (no limit)
      console.log(`📝 Pas 3: Încărcare ${selectedPhotos.length} fotografii...`)
      for (const f of selectedPhotos) {
        console.log(`  📸 Încărcare: ${f.name}`)
        await uploadRevisionPhoto(workId, equipmentId, f, userData?.uid || "unknown")
      }
      console.log("✅ Pas 3 completat: Fotografii încărcate")
      
      setSelectedPhotos([])
      setPhotoPreviewUrls([])
      
      // Reset unsaved changes flag
      setInitialValues({...values})
      setInitialObs({...obs})
      setHasUnsavedChanges(false)
      
      // Success toast
      toast({
        title: "✅ Revizie salvată cu succes!",
        description: `Fișa de operațiuni pentru ${equipmentName || "echipament"} a fost completată.`,
      })
      
      // Navigate back to work order after a short delay
      setTimeout(() => {
        router.back()
      }, 1500)
    } catch (error: any) {
      console.error("❌ Eroare la salvarea reviziei:", error)
      console.error("Stack trace:", error?.stack)
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        name: error?.name,
        toString: error?.toString?.(),
      })
      
      const errorMessage = error?.message || error?.code || error?.toString() || "Eroare necunoscută"
      toast({
        title: "❌ Eroare la salvare",
        description: `Nu s-a putut salva fișa de operațiuni.\n\nDetalii: ${errorMessage}`,
        variant: "destructive",
        duration: 8000, // 8 secunde
      })
    } finally {
      setSaving(false)
    }
  }

  // Save draft (partial save without completion)
  const handleSaveDraft = async () => {
    setError(null)
    setSaving(true)
    try {
      const payloadSections = sections.map((s) => ({
        ...s,
        items: s.items.map((it) => ({
          ...it,
          state: values[it.id],
          obs: obs[it.id] || "",
        })),
      }))
      await upsertRevisionDoc(workId, equipmentId, {
        equipmentId,
        equipmentName,
        sections: payloadSections,
        qrVerified: verified,
      })
      
      // Reset unsaved changes flag
      setInitialValues({...values})
      setInitialObs({...obs})
      setHasUnsavedChanges(false)
      
      toast({
        title: "💾 Progres salvat",
        description: "Modificările au fost salvate. Poți continua mai târziu.",
        duration: 3000,
      })
      
      return true
    } catch (e: any) {
      console.error("Error saving draft:", e)
      const errorMessage = e?.message || e?.toString() || "Eroare necunoscută"
      toast({
        title: "❌ Eroare la salvare progres",
        description: `Nu s-a putut salva progresul.\n\nDetalii: ${errorMessage}`,
        variant: "destructive",
        duration: 8000, // 8 secunde
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Se încarcă fișa de operațiuni…
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Fișa de operațiuni – {equipmentName || "Echipament"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        {/* QR validation gate */}
        {!verified && (
          <Alert className="bg-slate-50 border-slate-300">
            <div className="space-y-4">
              {loadingGate ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Pregătim validarea QR…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base text-slate-900">
                      🔒 Scanare QR necesară
                    </h3>
                    <p className="text-sm text-slate-700">
                      Pentru a putea completa fișa de operațiuni, trebuie mai întâi să scanați codul QR al echipamentului. 
                      Acest pas asigură că lucrați pe echipamentul corect.
                    </p>
                  </div>
                  
                  <div className="p-3 bg-white rounded-md border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-600 space-y-1">
                      <div><strong>Client:</strong> {expectedClient || "—"}</div>
                      <div><strong>Locație:</strong> {expectedLocation || "—"}</div>
                    </div>
                  </div>

                  <QRCodeScanner
                    expectedEquipmentCode={expectedCode}
                    expectedLocationName={expectedLocation}
                    expectedClientName={expectedClient}
                    workId={workId}
                    onVerificationComplete={async (ok) => {
                      if (ok) {
                        setVerified(true)
                        // Save QR verification status to revision doc
                        try {
                          await upsertRevisionDoc(workId, equipmentId, {
                            equipmentId,
                            equipmentName,
                            qrVerified: true,
                            qrVerifiedAt: new Date().toISOString(),
                            qrVerifiedBy: userData?.uid || "unknown",
                          })
                        } catch (e) {
                          console.error("Error saving QR verification:", e)
                        }

                        // Set timpSosire for Revizie works if absent (use first QR scan as arrival)
                        try {
                          const work = await getLucrareById(workId)
                          if (work?.tipLucrare === "Revizie") {
                            const now = new Date()

                            // Per-echipament start
                            const times = { ...((work as any)?.revisionEquipmentTimes || {}) }
                            const existing = times[equipmentId] || {}
                            if (!existing.startIso) {
                              times[equipmentId] = {
                                ...existing,
                                startIso: now.toISOString(),
                              }
                              await updateLucrare(workId, { revisionEquipmentTimes: times })
                              setEquipmentTimes(times)
                            }

                            // Global timpSosire (dacă lipsește)
                            if (!work?.timpSosire) {
                              const payload: any = {
                                timpSosire: now.toISOString(),
                                dataSosire: formatUiDate(now),
                                oraSosire: formatTime(now),
                              }
                              await updateLucrare(workId, payload)
                              console.log("✅ timpSosire set from first QR scan (revizie)", payload)
                            }
                          }
                        } catch (e) {
                          console.error("Eroare la setarea timpSosire pentru revizie:", e)
                        }
                      }
                    }}
                  />
                </>
              )}
            </div>
          </Alert>
        )}
        
        {/* Mesaj de confirmare după scanare */}
        {verified && (
          <Alert className="bg-green-50 border-green-300">
            <div className="flex items-center gap-2 text-green-800">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-semibold">Echipament verificat!</span>
              <span className="text-sm text-green-700">Puteți completa fișa de operațiuni.</span>
            </div>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabel puncte de control - optimizat mobile */}
        <div className={`${!verified ? "pointer-events-none opacity-60" : ""}`}>
          {sections.map((section) => (
            <div key={section.id} className="mb-3">
              {/* Header secțiune cu buton adaugă */}
              <div className="flex items-center justify-between bg-slate-100 px-2 py-1.5 rounded-t-lg border border-slate-300">
                <h3 className="font-bold text-sm">{section.title || section.name}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openAddDialog(section.id)}
                  className="h-7 w-7 p-0 hover:bg-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              {/* Tabel items */}
              {section.items.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground border border-t-0 border-slate-300 rounded-b-lg">
                  Apasă + pentru a adăuga puncte de control
                </div>
              ) : (
                <div className="border border-t-0 border-slate-300 rounded-b-lg overflow-hidden">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left p-2 font-semibold text-xs">Puncte de control</th>
                        <th className="text-center p-2 font-semibold text-xs w-20">Verificat</th>
                        <th className="text-center p-2 font-semibold text-xs w-16">Obs.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {section.items.map((item) => {
                        const itemState = values[item.id]
                        const hasObs = obs[item.id]?.trim()
                        const isChecked = itemState === "functional"
                        
                        return (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="p-2 align-middle">
                              <div className="flex items-start gap-2">
                                <span className="text-xs break-words leading-tight max-w-full">
                                  {item.label || item.name}
                                </span>
                                {item.id.startsWith('manual-') && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRemoveItem(item.id)}
                                    className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-center align-middle">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => handleCheckboxChange(item.id, checked === true)}
                                  className="h-5 w-5"
                                />
                              </div>
                            </td>
                            <td className="p-2 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => openObsDialog(item.id)}
                                className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                                  hasObs 
                                    ? "text-green-700 hover:bg-green-50" 
                                    : "text-gray-700 hover:bg-gray-100"
                                }`}
                              >
                                Obs.
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Galerie fotografii - max 4 */}
        <div className={`space-y-2 ${!verified ? "pointer-events-none opacity-60" : ""}`}>
          <div className="flex items-center gap-2 text-xs font-medium">
            <ImageIcon className="h-4 w-4" />
            <span>
              Fotografii: {existingPhotos.length} existente, {selectedPhotos.length} noi (max 4)
            </span>
          </div>

          {/* Galerie fotografii existente (salvate) */}
          {existingPhotos.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Fotografii existente</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {existingPhotos.map((p, index) => (
                  <div key={p.path || index} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50">
                    <img 
                      src={p.url} 
                      alt={p.fileName || `Foto ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.fileName || "fotografie"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grid cu preview-uri pentru fotografiile noi și buton adaugă */}
          <div className="space-y-1">
            {photoPreviewUrls.length > 0 && (
              <div className="text-xs text-muted-foreground">Fotografii noi (nesalvate încă)</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {photoPreviewUrls.map((url, index) => (
                <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-gray-200 bg-gray-50">
                  <img 
                    src={url} 
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {selectedPhotos[index]?.name}
                  </div>
                </div>
              ))}
              
              {/* Buton adaugă poză */}
              <label className="relative aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-gray-700">
                <Plus className="h-6 w-6" />
                <span className="text-xs font-medium px-1 text-center">Adaugă</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
            </div>
            
            {selectedPhotos.length > 0 && (
              <div className="text-xs text-muted-foreground">
                💡 Tip: Click pe poză pentru a o șterge
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-muted-foreground">
            {allCompleted ? (
              <span>✓ Toate completate</span>
            ) : (
              <span>Completați toate punctele</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!verified || !allCompleted || saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvează
          </Button>
        </div>
      </CardContent>

      {/* Dialog pentru adăugare punct de control */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adaugă punct de control</DialogTitle>
            <DialogDescription>
              Adaugă un nou punct de control în această secțiune.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Nume punct de control</Label>
              <Input
                id="item-name"
                placeholder="ex: Verificare senzor..."
                value={dialogItemLabel}
                onChange={(e) => setDialogItemLabel(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSaveAddDialog()
                  }
                }}
                autoFocus
                className="text-base"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
              Anulează
            </Button>
            <Button type="button" onClick={handleSaveAddDialog} disabled={!dialogItemLabel.trim()}>
              Adaugă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru observații */}
      <Dialog open={obsDialogOpen} onOpenChange={setObsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Observații
            </DialogTitle>
            <DialogDescription>
              {dialogItemLabel}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              id="obs-text"
              placeholder="Adaugă observații despre acest punct de control..."
              value={dialogItemObs}
              onChange={(e) => setDialogItemObs(e.target.value)}
              className="min-h-[120px] text-base resize-none"
              rows={5}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              Observațiile nu sunt afișate în tabel pentru a economisi spațiu. Textul "Obs." devine verde dacă există observații salvate.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setObsDialogOpen(false)}
              className="flex-1 sm:flex-initial"
            >
              Anulează
            </Button>
            <Button 
              type="button" 
              onClick={handleSaveObsDialog}
              className="flex-1 sm:flex-initial"
            >
              <Save className="h-4 w-4 mr-2" />
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}



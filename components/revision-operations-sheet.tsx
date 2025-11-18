"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, Image as ImageIcon, Plus, X, Trash2, Edit2, Check } from "lucide-react"
import { subscribeRevisionChecklist } from "@/lib/revisions/checklist"
import { getRevisionDoc, subscribeRevisionDoc, upsertRevisionDoc, uploadRevisionPhoto } from "@/lib/firebase/revisions"
import type { RevisionChecklistSection, RevisionChecklistItem } from "@/types/revision"
import { useAuth } from "@/contexts/AuthContext"
import { updateLucrare } from "@/lib/firebase/firestore"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { getLucrareById, getClienti } from "@/lib/firebase/firestore"
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

type Props = {
  workId: string
  equipmentId: string
  equipmentName?: string
  onUnsavedChanges?: (hasChanges: boolean) => void
  onSaveDraftRef?: (saveFn: () => Promise<boolean>) => void
}

type ItemState = "functional" | "nefunctional"

export function RevisionOperationsSheet({ workId, equipmentId, equipmentName, onUnsavedChanges, onSaveDraftRef }: Props) {
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
  // QR validation gating
  const [expectedCode, setExpectedCode] = useState<string | undefined>(undefined)
  const [expectedClient, setExpectedClient] = useState<string | undefined>(undefined)
  const [expectedLocation, setExpectedLocation] = useState<string | undefined>(undefined)
  const [verified, setVerified] = useState(false)
  const [loadingGate, setLoadingGate] = useState(true)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [initialValues, setInitialValues] = useState<Record<string, ItemState | undefined>>({})
  const [initialObs, setInitialObs] = useState<Record<string, string>>({})
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [dialogSectionId, setDialogSectionId] = useState<string | null>(null)
  const [dialogItemId, setDialogItemId] = useState<string | null>(null)
  const [dialogItemLabel, setDialogItemLabel] = useState("")
  const [dialogItemState, setDialogItemState] = useState<ItemState | undefined>(undefined)
  const [dialogItemObs, setDialogItemObs] = useState("")

  // Load checklist and existing doc with real-time updates
  useEffect(() => {
    let checklistUnsub: (() => void) | null = null
    let revisionUnsub: (() => void) | null = null
    
    // Subscribe to checklist changes
    checklistUnsub = subscribeRevisionChecklist((checklist) => {
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
  }, [workId, equipmentId])

  // Resolve expected QR metadata (client, location, equipment code) for gating
  useEffect(() => {
    const loadGate = async () => {
      try {
        setLoadingGate(true)
        const work = await getLucrareById(workId)
        if (work) {
          setExpectedClient(work.client)
          setExpectedLocation(work.locatie)
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

  // Handle photo selection with preview
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedPhotos((prev) => [...prev, ...files])
    
    // Create preview URLs
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPhotoPreviewUrls((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
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

  // Open edit dialog
  const openEditDialog = (sectionId: string, itemId: string) => {
    setDialogSectionId(sectionId)
    setDialogItemId(itemId)
    
    // Find item label
    const section = sections.find((s) => s.id === sectionId)
    const item = section?.items.find((i) => i.id === itemId)
    
    setDialogItemLabel(item?.label || item?.name || "")
    setDialogItemState(values[itemId])
    setDialogItemObs(obs[itemId] || "")
    setEditDialogOpen(true)
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

  // Save from edit dialog
  const handleSaveEditDialog = () => {
    if (!dialogItemId) return
    
    // Update state and obs
    if (dialogItemState) {
      setValues((prev) => ({ ...prev, [dialogItemId]: dialogItemState }))
    }
    setObs((prev) => ({ ...prev, [dialogItemId]: dialogItemObs }))
    
    setEditDialogOpen(false)
    setDialogItemId(null)
    setDialogItemLabel("")
    setDialogItemState(undefined)
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
        title: "Formular incomplet",
        description: "Completați starea pentru toate punctele de control înainte de a salva.",
        variant: "destructive",
      })
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Map back states/obs into sections
      const payloadSections = sections.map((s) => ({
        ...s,
        items: s.items.map((it) => ({
          ...it,
          state: values[it.id]!,
          obs: obs[it.id] || "",
        })),
      }))
      await upsertRevisionDoc(workId, equipmentId, {
        equipmentId,
        equipmentName,
        sections: payloadSections,
        overallState,
        completedAt: new Date().toISOString(),
        completedBy: userData?.uid || "unknown",
        qrVerified: verified,
      })
      // Mark equipment as done in lucrare
      await updateLucrare(workId, {
        revision: {
          equipmentStatus: { [equipmentId]: "done" },
        } as any,
      } as any, userData?.uid, userData?.displayName || userData?.email || "Utilizator")
      // Upload ALL photos (no limit)
      for (const f of selectedPhotos) {
        await uploadRevisionPhoto(workId, equipmentId, f, userData?.uid || "unknown")
      }
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
    } catch (error) {
      console.error("Eroare la salvarea reviziei:", error)
      toast({
        title: "Eroare la salvare",
        description: "Nu s-a putut salva fișa de operațiuni. Încearcă din nou.",
        variant: "destructive",
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
      })
      
      return true
    } catch (e) {
      console.error("Error saving draft:", e)
      toast({
        title: "Eroare la salvare",
        description: "Nu s-a putut salva progresul. Încearcă din nou.",
        variant: "destructive",
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
      <CardHeader>
        <CardTitle>Fișa de operațiuni – {equipmentName || equipmentId}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                      <div><strong>Cod echipament așteptat:</strong> {expectedCode || "—"}</div>
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

        {/* Lista puncte de control - optimizată mobile */}
        <div className={`space-y-2 ${!verified ? "pointer-events-none opacity-60" : ""}`}>
          {sections.map((section) => (
            <div key={section.id} className="border rounded-lg overflow-hidden">
              {/* Header secțiune */}
              <div className="flex items-center justify-between bg-slate-100 p-3 border-b">
                <h3 className="font-semibold text-sm">{section.title || section.name}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openAddDialog(section.id)}
                  className="h-8 w-8 p-0 hover:bg-slate-200"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Lista items */}
              <div className="divide-y">
                {section.items.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Apasă + pentru a adăuga puncte de control
                  </div>
                )}
                {section.items.map((item) => {
                  const itemState = values[item.id]
                  const hasObs = obs[item.id]?.trim()
                  const isComplete = Boolean(itemState)
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => openEditDialog(section.id, item.id)}
                      className="p-3 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{item.label || item.name}</span>
                            {isComplete && (
                              <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-2 text-xs">
                            {itemState && (
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                itemState === "functional" 
                                  ? "bg-green-100 text-green-700" 
                                  : "bg-red-100 text-red-700"
                              }`}>
                                {itemState === "functional" ? "✓ Funcțional" : "✗ Nefuncțional"}
                              </span>
                            )}
                            {!itemState && (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                Necompletat
                              </span>
                            )}
                            {hasObs && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                💬 Are observații
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {item.id.startsWith('manual-') && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveItem(item.id)
                              }}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Galerie fotografii - fără limită */}
        <div className={`space-y-3 ${!verified ? "pointer-events-none opacity-60" : ""}`}>
          <label className="text-sm font-medium flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Fotografii ({selectedPhotos.length} atașate)
          </label>
          
          {/* Grid cu preview-uri și buton adaugă */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
            <label className="relative aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-700">
              <Plus className="h-8 w-8" />
              <span className="text-xs font-medium">Adaugă poze</span>
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

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {allCompleted ? (
              <span>Toate punctele sunt completate. Stare generală: {overallState === "functional" ? "Functional" : "Nefunctional"}.</span>
            ) : (
              <span>Completați starea pentru toate punctele înainte de a salva.</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={!verified || !allCompleted || saving}>
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

      {/* Dialog pentru editare punct de control */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-base">{dialogItemLabel}</DialogTitle>
            <DialogDescription>
              Completează starea și observațiile pentru acest punct de control.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Stare */}
            <div className="grid gap-2">
              <Label htmlFor="item-state" className="text-base font-semibold">
                Stare <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={dialogItemState === "functional" ? "default" : "outline"}
                  onClick={() => setDialogItemState("functional")}
                  className={`h-14 text-base ${
                    dialogItemState === "functional" 
                      ? "bg-green-600 hover:bg-green-700" 
                      : "hover:bg-green-50 hover:border-green-300"
                  }`}
                >
                  <Check className="h-5 w-5 mr-2" />
                  Funcțional
                </Button>
                <Button
                  type="button"
                  variant={dialogItemState === "nefunctional" ? "default" : "outline"}
                  onClick={() => setDialogItemState("nefunctional")}
                  className={`h-14 text-base ${
                    dialogItemState === "nefunctional" 
                      ? "bg-red-600 hover:bg-red-700" 
                      : "hover:bg-red-50 hover:border-red-300"
                  }`}
                >
                  <X className="h-5 w-5 mr-2" />
                  Nefuncțional
                </Button>
              </div>
            </div>

            {/* Observații */}
            <div className="grid gap-2">
              <Label htmlFor="item-obs" className="text-base font-semibold">
                Observații
              </Label>
              <Textarea
                id="item-obs"
                placeholder="Adaugă observații despre acest punct de control..."
                value={dialogItemObs}
                onChange={(e) => setDialogItemObs(e.target.value)}
                className="min-h-[100px] text-base resize-none"
                rows={4}
              />
              <span className="text-xs text-muted-foreground">
                Opțional - adaugă detalii dacă este cazul
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setEditDialogOpen(false)}
              className="flex-1 sm:flex-initial"
            >
              Anulează
            </Button>
            <Button 
              type="button" 
              onClick={handleSaveEditDialog} 
              disabled={!dialogItemState}
              className="flex-1 sm:flex-initial"
            >
              <Check className="h-4 w-4 mr-2" />
              Salvează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}



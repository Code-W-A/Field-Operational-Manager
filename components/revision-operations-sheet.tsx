"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, Image as ImageIcon, Plus, X, Trash2 } from "lucide-react"
import { subscribeRevisionChecklist } from "@/lib/revisions/checklist"
import { getRevisionDoc, upsertRevisionDoc, uploadRevisionPhoto } from "@/lib/firebase/revisions"
import type { RevisionChecklistSection, RevisionChecklistItem } from "@/types/revision"
import { useAuth } from "@/contexts/AuthContext"
import { updateLucrare } from "@/lib/firebase/firestore"
import { QRCodeScanner } from "@/components/qr-code-scanner"
import { getLucrareById, getClienti } from "@/lib/firebase/firestore"

type Props = {
  workId: string
  equipmentId: string
  equipmentName?: string
}

type ItemState = "functional" | "nefunctional"

export function RevisionOperationsSheet({ workId, equipmentId, equipmentName }: Props) {
  const { userData } = useAuth()
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
  // Manual item addition
  const [newItemLabel, setNewItemLabel] = useState("")
  const [addingToSection, setAddingToSection] = useState<string | null>(null)

  // Load checklist and existing doc
  useEffect(() => {
    const unsub = subscribeRevisionChecklist(async (checklist) => {
      try {
        const existing = await getRevisionDoc(workId, equipmentId)
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
        }
        setLoading(false)
      } catch (e: any) {
        setError(e?.message || "Eroare la încărcarea fișei")
        setLoading(false)
      }
    })
    return () => unsub()
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

  // Add manual item to section
  const handleAddManualItem = (sectionId: string) => {
    if (!newItemLabel.trim()) return
    
    const newItem: RevisionChecklistItem = {
      id: `manual-${Date.now()}-${Math.random()}`,
      name: newItemLabel.trim(),
      order: 999,
    }
    
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: [...s.items, newItem] }
          : s
      )
    )
    
    setNewItemLabel("")
    setAddingToSection(null)
  }

  // Remove manual item
  const handleRemoveItem = (sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
          : s
      )
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
          <Alert className="bg-yellow-50 border-yellow-300">
            <div className="space-y-4">
              {loadingGate ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Pregătim validarea QR…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base text-yellow-900">
                      🔒 Scanare QR necesară
                    </h3>
                    <p className="text-sm text-yellow-800">
                      Pentru a putea completa fișa de operațiuni, trebuie mai întâi să scanați codul QR al echipamentului. 
                      Acest pas asigură că lucrați pe echipamentul corect.
                    </p>
                  </div>
                  
                  <div className="p-3 bg-white/60 rounded-md border border-yellow-200">
                    <div className="text-xs text-muted-foreground space-y-1">
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
                    onVerificationComplete={(ok) => setVerified(Boolean(ok))}
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

        {/* Disable the sheet UI until verified */}
        <div className={`overflow-x-auto border rounded-md ${!verified ? "pointer-events-none opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 w-2/3">Punct de control</th>
                <th className="text-left p-2 w-1/6">Stare</th>
                <th className="text-left p-2 w-1/6">Obs.</th>
                <th className="text-center p-2 w-12">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <>
                  <tr key={section.id} className="border-t bg-muted/30">
                    <td colSpan={3} className="p-2 font-semibold">
                      {section.title || section.name}
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddingToSection(section.id)}
                        className="h-7 w-7 p-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  {section.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">{item.label || item.name}</td>
                      <td className="p-2">
                        <Select
                          value={values[item.id] || undefined}
                          onValueChange={(v: ItemState) =>
                            setValues((prev) => ({ ...prev, [item.id]: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Alege" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="functional">Functional</SelectItem>
                            <SelectItem value="nefunctional">Nefunctional</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Textarea
                          placeholder="Observații"
                          value={obs[item.id] || ""}
                          onChange={(e) => setObs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="min-h-[38px]"
                        />
                      </td>
                      <td className="p-2 text-center">
                        {item.id.startsWith('manual-') && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(section.id, item.id)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {addingToSection === section.id && (
                    <tr className="border-t bg-blue-50">
                      <td className="p-2">
                        <Input
                          placeholder="Nume punct de control"
                          value={newItemLabel}
                          onChange={(e) => setNewItemLabel(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddManualItem(section.id)
                            }
                          }}
                          autoFocus
                        />
                      </td>
                      <td colSpan={2} className="p-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddManualItem(section.id)}
                          >
                            Adaugă
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddingToSection(null)
                              setNewItemLabel("")
                            }}
                          >
                            Anulează
                          </Button>
                        </div>
                      </td>
                      <td></td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
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
    </Card>
  )
}



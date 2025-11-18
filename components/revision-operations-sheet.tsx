"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, Image as ImageIcon } from "lucide-react"
import { subscribeRevisionChecklist } from "@/lib/revisions/checklist"
import { getRevisionDoc, upsertRevisionDoc, uploadRevisionPhoto } from "@/lib/firebase/revisions"
import type { RevisionChecklistSection } from "@/types/revision"
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
  // QR validation gating
  const [expectedCode, setExpectedCode] = useState<string | undefined>(undefined)
  const [expectedClient, setExpectedClient] = useState<string | undefined>(undefined)
  const [expectedLocation, setExpectedLocation] = useState<string | undefined>(undefined)
  const [verified, setVerified] = useState(false)
  const [loadingGate, setLoadingGate] = useState(true)

  // Load checklist and existing doc
  useEffect(() => {
    const unsub = subscribeRevisionChecklist(async (checklist) => {
      try {
        const existing = await getRevisionDoc(workId, equipmentId)
        const baseSections = (existing?.sections?.length ? existing.sections : checklist.sections) || []
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
      // Upload photos if any
      for (const f of selectedPhotos.slice(0, 4)) {
        await uploadRevisionPhoto(workId, equipmentId, f, userData?.uid || "unknown")
      }
      setSelectedPhotos([])
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
          <div className="space-y-3 p-3 border rounded-md bg-muted/30">
            {loadingGate ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Pregătim validarea QR…
              </div>
            ) : (
              <>
                <div className="text-sm">
                  Scanați QR-ul echipamentului pentru a debloca editarea fișei.
                </div>
                <div className="text-xs text-muted-foreground">
                  {expectedClient && <span>Client: {expectedClient} • </span>}
                  {expectedLocation && <span>Locație: {expectedLocation} • </span>}
                  {expectedCode && <span>Cod așteptat: {expectedCode}</span>}
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
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <tr key={section.id} className="border-t">
                  <td colSpan={3} className="p-2 font-semibold">
                    {section.title}
                  </td>
                </tr>
              )).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-3 text-muted-foreground">
                    Nu există secțiuni configurate în Setări pentru revizie.
                  </td>
                </tr>
              )}
              {sections.flatMap((section) =>
                section.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-2">{item.label}</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Fotografii (max 4) */}
        <div className={`space-y-2 ${!verified ? "pointer-events-none opacity-60" : ""}`}>
          <label className="text-sm font-medium flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Fotografii (maxim 4)
          </label>
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setSelectedPhotos(Array.from(e.target.files || []).slice(0, 4))}
          />
          {selectedPhotos.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {selectedPhotos.length} fișiere selectate
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



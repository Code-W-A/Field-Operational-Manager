"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ClientSearchSelect } from "@/components/client-search-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { ArrowRightLeft, ChevronLeft, History, Loader2 } from "lucide-react"

type ClientRow = { id: string; nume: string }

type LucrarePreview = { affectedLucrareIds?: string[]; equipmentCount?: number; willUpdateLucrari?: boolean }

export type EquipmentMigrateWizardDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceClientId: string
  sourceClientName: string
  sourceLocationId: string
  sourceLocationName: string
  equipmentId: string
  equipmentCod: string
  equipmentNume: string
  onSuccess?: () => void
}

async function postMigrateEquipment(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/migrate-equipment", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : "Migrarea a eșuat."
    throw new Error(msg)
  }
  return data
}

export function EquipmentMigrateWizardDialog({
  open,
  onOpenChange,
  sourceClientId,
  sourceClientName,
  sourceLocationId,
  sourceLocationName,
  equipmentId,
  equipmentCod,
  equipmentNume,
  onSuccess,
}: EquipmentMigrateWizardDialogProps) {
  const idempotencyKeyRef = useRef<string>("")
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [targetClientId, setTargetClientId] = useState("")
  const [targetLocatii, setTargetLocatii] = useState<Array<{ id?: string; nume?: string }>>([])
  const [targetContracte, setTargetContracte] = useState<Array<{ id?: string; number?: string; numar?: string; name?: string }>>([])
  const [targetLocationId, setTargetLocationId] = useState("")
  /** Folosit când locația nu are `id` în Firestore */
  const [targetLocationNameApi, setTargetLocationNameApi] = useState("")
  const [targetContractId, setTargetContractId] = useState<string>("")
  const [targetClientLoading, setTargetClientLoading] = useState(false)
  const [previewMove, setPreviewMove] = useState<LucrarePreview | null>(null)
  const [previewCopy, setPreviewCopy] = useState<LucrarePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [confirmMode, setConfirmMode] = useState<"move" | "copy" | null>(null)

  const reset = useCallback(() => {
    setStep(1)
    setTargetClientId("")
    setTargetLocatii([])
    setTargetContracte([])
    setTargetLocationId("")
    setTargetLocationNameApi("")
    setTargetContractId("")
    setPreviewMove(null)
    setPreviewCopy(null)
    setConfirmMode(null)
    idempotencyKeyRef.current = ""
  }, [])

  useEffect(() => {
    if (!open) {
      reset()
      return
    }
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `mig-${Date.now()}`
  }, [open, reset])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setClientsLoading(true)
      try {
        const snap = await getDocs(collection(db, "clienti"))
        if (cancelled) return
        const rows: ClientRow[] = snap.docs
          .map((d) => ({ id: d.id, nume: String((d.data() as any)?.nume || "").trim() || d.id }))
          .filter((c) => c.id !== sourceClientId)
          .sort((a, b) => a.nume.localeCompare(b.nume, "ro"))
        setClients(rows)
      } catch {
        if (!cancelled) toast({ title: "Eroare", description: "Nu s-a putut încărca lista de clienți.", variant: "destructive" })
      } finally {
        if (!cancelled) setClientsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, sourceClientId])

  useEffect(() => {
    if (!open || !targetClientId) {
      setTargetLocatii([])
      setTargetContracte([])
      setTargetLocationId("")
      setTargetLocationNameApi("")
      return
    }
    let cancelled = false
    ;(async () => {
      setTargetClientLoading(true)
      try {
        const ref = doc(db, "clienti", targetClientId)
        const snap = await getDoc(ref)
        if (cancelled || !snap.exists()) return
        const data = snap.data() as any
        const locs = Array.isArray(data?.locatii) ? data.locatii : []
        setTargetLocatii(locs)
        const contracts = Array.isArray(data?.contracte) ? data.contracte : []
        setTargetContracte(contracts.filter((c: any) => normId(c?.id)))
        setTargetLocationId("")
        setTargetLocationNameApi("")
      } catch {
        if (!cancelled) toast({ title: "Eroare", description: "Nu s-a putut încărca clientul destinație.", variant: "destructive" })
      } finally {
        if (!cancelled) setTargetClientLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, targetClientId])

  const targetClientLabel = useMemo(() => clients.find((c) => c.id === targetClientId)?.nume || "", [clients, targetClientId])
  const targetLocationLabel = useMemo(() => {
    const loc = targetLocatii.find((l) => normId(l?.id) === targetLocationId)
    if (loc) return String(loc?.nume || "").trim() || "—"
    if (targetLocationNameApi) return targetLocationNameApi
    return "—"
  }, [targetLocatii, targetLocationId, targetLocationNameApi])

  const targetContractLabel = useMemo(() => {
    if (!targetContractId) return "—"
    const c = targetContracte.find((x) => normId(x?.id) === targetContractId)
    if (!c) return "—"
    return String(c.number || c.numar || c.name || c.id || "").trim() || "—"
  }, [targetContracte, targetContractId])

  const canGoStep2 = Boolean(targetClientId && (targetLocationId || targetLocationNameApi))
  const istoricHref = useMemo(() => {
    const cod = encodeURIComponent(String(equipmentCod || "").trim().toUpperCase())
    return `/dashboard/istoric-interventii/echipament?cod=${cod}`
  }, [equipmentCod])

  const loadPreviews = useCallback(async () => {
    if (!idempotencyKeyRef.current) return
    setPreviewLoading(true)
    setPreviewMove(null)
    setPreviewCopy(null)
    try {
      const base = {
        sourceClientId,
        targetClientId,
        targetLocationId: targetLocationId || undefined,
        targetLocationName: targetLocationId ? undefined : targetLocationNameApi || undefined,
        equipmentIds: [equipmentId],
        targetContractId: targetContractId || undefined,
        dryRun: true,
        idempotencyKey: idempotencyKeyRef.current,
      }
      const [m, c] = await Promise.all([
        postMigrateEquipment({ ...base, mode: "move" }),
        postMigrateEquipment({ ...base, mode: "copy" }),
      ])
      setPreviewMove({
        affectedLucrareIds: Array.isArray((m as any).affectedLucrareIds) ? (m as any).affectedLucrareIds : [],
        equipmentCount: Number((m as any).equipmentCount) || 1,
        willUpdateLucrari: Boolean((m as any).willUpdateLucrari),
      })
      setPreviewCopy({
        affectedLucrareIds: Array.isArray((c as any).affectedLucrareIds) ? (c as any).affectedLucrareIds : [],
        equipmentCount: Number((c as any).equipmentCount) || 1,
        willUpdateLucrari: Boolean((c as any).willUpdateLucrari),
      })
    } catch (e: any) {
      toast({
        title: "Previzualizare eșuată",
        description: e?.message || "Reîncearcă sau verifică destinația.",
        variant: "destructive",
      })
      setStep(2)
    } finally {
      setPreviewLoading(false)
    }
  }, [sourceClientId, targetClientId, targetLocationId, targetLocationNameApi, targetContractId, equipmentId])

  useEffect(() => {
    if (step !== 3 || !canGoStep2) return
    void loadPreviews()
  }, [step, canGoStep2, loadPreviews])

  const handleCommit = async (mode: "move" | "copy") => {
    if (!idempotencyKeyRef.current) {
      toast({ title: "Eroare", description: "Lipsește cheia de idempotency. Închide și redeschide dialogul.", variant: "destructive" })
      return
    }
    setCommitting(true)
    try {
      await postMigrateEquipment({
        sourceClientId,
        targetClientId,
        targetLocationId: targetLocationId || undefined,
        targetLocationName: targetLocationId ? undefined : targetLocationNameApi || undefined,
        equipmentIds: [equipmentId],
        targetContractId: targetContractId || undefined,
        mode,
        dryRun: false,
        idempotencyKey: idempotencyKeyRef.current,
      })
      toast({
        title: mode === "move" ? "Echipament mutat" : "Echipament copiat",
        description:
          mode === "move"
            ? "Echipamentul a fost scos de la clientul curent și adăugat la destinație."
            : "O copie cu id nou a fost creată pe clientul destinație. Clientul curent este neschimbat.",
      })
      onSuccess?.()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: "Migrare eșuată", description: e?.message || "Eroare necunoscută.", variant: "destructive" })
    } finally {
      setCommitting(false)
      setConfirmMode(null)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (committing) return
          onOpenChange(v)
        }}
      >
        <DialogContent className="max-w-lg sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ArrowRightLeft className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>Migrare echipament</DialogTitle>
                <DialogDescription className="mt-1">
                  Pas {step} din 3 · {equipmentNume || "Echipament"} ({equipmentCod || "—"})
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[min(60vh,520px)] flex-1">
            <div className="px-6 py-4 space-y-4">
              {step === 1 && (
                <>
              

                  <div className="space-y-2">
                    <Label>Client destinație</Label>
                    {clientsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Se încarcă clienții…
                      </div>
                    ) : (
                      <ClientSearchSelect
                        clients={clients}
                        value={targetClientId}
                        onValueChange={(v) => setTargetClientId(v === "UNASSIGNED" ? "" : v)}
                        placeholder="Căutați și selectați clientul destinație"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Locație pe clientul destinație</Label>
                    {!targetClientId ? (
                      <p className="text-sm text-muted-foreground">Selectează mai întâi clientul destinație.</p>
                    ) : targetClientLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Se încarcă locațiile…
                      </div>
                    ) : targetLocatii.length === 0 ? (
                      <p className="text-sm text-destructive">Acest client nu are locații definite.</p>
                    ) : (
                      <Select
                        value={
                          targetLocationId
                            ? targetLocationId
                            : targetLocationNameApi
                              ? `__name:${targetLocationNameApi}`
                              : ""
                        }
                        onValueChange={(v) => {
                          if (v.startsWith("__name:")) {
                            setTargetLocationId("")
                            setTargetLocationNameApi(v.slice("__name:".length))
                            return
                          }
                          setTargetLocationId(v)
                          setTargetLocationNameApi("")
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Alege locația" />
                        </SelectTrigger>
                        <SelectContent>
                          {targetLocatii.map((loc, idx) => {
                            const id = normId(loc?.id)
                            const label = String(loc?.nume || "").trim() || `Locație ${idx + 1}`
                            const value = id || `__name:${label}`
                            return (
                              <SelectItem key={id || `n-${idx}`} value={value}>
                                {label}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Contract destinație (opțional)</Label>
                    <Select value={targetContractId || "__none__"} onValueChange={(v) => setTargetContractId(v === "__none__" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Fără contract" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Fără contract</SelectItem>
                        {targetContracte.map((c) => {
                          const cid = normId(c?.id)
                          if (!cid) return null
                          const label = String(c.number || c.numar || c.name || cid).trim()
                          return (
                            <SelectItem key={cid} value={cid}>
                              {label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {step === 2 && (
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                    <div className="font-medium text-foreground">Sursă</div>
                    <div className="text-muted-foreground">
                      <span className="text-foreground font-medium">{sourceClientName}</span>
                      {" · "}
                      {sourceLocationName}
                    </div>
                    <div className="font-mono text-xs pt-1">
                      {equipmentNume} · {equipmentCod}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="font-medium text-foreground">Destinație</div>
                    <div>
                      <span className="text-muted-foreground">Client: </span>
                      <span className="font-medium">{targetClientLabel}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Locație: </span>
                      <span className="font-medium">{targetLocationLabel}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Contract: </span>
                      <span className="font-medium">{targetContractLabel}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Următorul pas: alege dacă <strong>muți</strong> (elimină de la sursă) sau <strong>copiezi</strong> (păstrează sursa).
                  </p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="text-sm">Se calculează impactul…</span>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border-2 border-destructive/25 bg-destructive/5 p-4 flex flex-col gap-3">
                        <div>
                          <div className="text-sm font-semibold text-destructive">Mută</div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            Echipamentul dispare de la clientul curent. Contractele sursă pierd referința. Lucrările
                            afectate:{" "}
                            <span className="font-mono font-medium text-foreground">
                              {previewMove?.affectedLucrareIds?.length ?? "—"}
                            </span>
                            .
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          className="w-full mt-auto"
                          disabled={committing}
                          onClick={() => setConfirmMode("move")}
                        >
                          Mută definitiv…
                        </Button>
                      </div>
                      <div className="rounded-xl border-2 border-border bg-muted/30 p-4 flex flex-col gap-3">
                        <div>
                          <div className="text-sm font-semibold">Copiază</div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            Clientul curent rămâne neschimbat. Se creează o copie cu <span className="font-medium">id nou</span>
                            . Nu se modifică tichetele existente. Istoricul după cod poate include ambele site-uri.
                          </p>
                          <p className="text-xs mt-2 text-muted-foreground">
                            Lucrări modificate:{" "}
                            <span className="font-mono font-medium text-foreground">
                              {previewCopy?.affectedLucrareIds?.length ?? 0}
                            </span>
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full mt-auto border"
                          disabled={committing}
                          onClick={() => setConfirmMode("copy")}
                        >
                          Copiază definitiv…
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          <DialogFooter className="px-6 py-4 shrink-0 flex flex-row flex-wrap gap-2 sm:justify-between">
            <div className="flex gap-2">
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={committing || previewLoading}
                  onClick={() => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Înapoi
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={committing} onClick={() => onOpenChange(false)}>
                Anulează
              </Button>
              {step === 1 ? (
                <Button type="button" size="sm" disabled={!canGoStep2 || committing} onClick={() => setStep(2)}>
                  Continuă
                </Button>
              ) : step === 2 ? (
                <Button type="button" size="sm" disabled={committing} onClick={() => setStep(3)}>
                  Continuă la confirmare
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmMode !== null} onOpenChange={(o) => !o && !committing && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmMode === "move" ? "Confirmi mutarea?" : "Confirmi copierea?"}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left text-sm">
              {confirmMode === "move" ? (
                <>
                  <span>
                    Echipamentul <strong>{equipmentNume}</strong> ({equipmentCod}) va fi <strong>șters</strong> de la{" "}
                    <strong>{sourceClientName}</strong> și adăugat la <strong>{targetClientLabel}</strong> —{" "}
                    {targetLocationLabel}.
                  </span>
                  <span className="block text-destructive font-medium">
                    Operația nu poate fi anulată automat din acest dialog.
                  </span>
                </>
              ) : (
                <span>
                  Se creează o copie a echipamentului pe <strong>{targetClientLabel}</strong> — {targetLocationLabel}.{" "}
                  <strong>{sourceClientName}</strong> rămâne cu echipamentul original.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={committing}>Renunță</AlertDialogCancel>
            <Button
              type="button"
              disabled={committing}
              className={confirmMode === "move" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={() => {
                if (confirmMode) void handleCommit(confirmMode)
              }}
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmMode === "move" ? "Da, mută" : "Da, copiază"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function normId(v: unknown): string {
  return String(v ?? "").trim()
}

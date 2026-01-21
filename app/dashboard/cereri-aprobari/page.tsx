"use client"

import { useEffect, useMemo, useState } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { ClipboardList, Pencil, Download } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import type { HrRequest, HrRequestKind, HrRequestPayload } from "@/lib/hr/types"
import { decideHrRequest, subscribeDepartments, subscribeHrRequestsForManager, updateHrRequestByManager } from "@/lib/hr/storage"
import { hrRequestDateLabel, hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import { toast } from "@/hooks/use-toast"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"

function canEditPayload(kind: HrRequestKind) {
  // for now allow editing payload fields for all kinds
  return Boolean(kind)
}

function clonePayload(payload: HrRequestPayload): HrRequestPayload {
  return JSON.parse(JSON.stringify(payload)) as HrRequestPayload
}

export default function CereriAprobariPage() {
  const { user } = useAuth()
  const [requests, setRequests] = useState<HrRequest[]>([])
  const [departmentsById, setDepartmentsById] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending")
  const [selected, setSelected] = useState<HrRequest | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [editPayload, setEditPayload] = useState<HrRequestPayload | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState<"approve" | "reject" | "edit" | null>(null)

  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeHrRequestsForManager({
      managerUid: user.uid,
      onChange: setRequests,
    })
    return () => unsub()
  }, [user?.uid])

  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: (deps) => {
        const map: Record<string, string> = {}
        for (const d of deps) map[d.id] = d.name
        setDepartmentsById(map)
      },
    })
    return () => unsub()
  }, [])

  const filtered = useMemo(() => {
    if (activeTab === "pending") return requests.filter((r) => r.status === "pending")
    return requests
  }, [requests, activeTab])

  const openDetail = (r: HrRequest) => {
    setSelected(r)
    setDetailOpen(true)
    setRejectionReason("")
    setRejectOpen(false)
    setEditOpen(false)
    setEditPayload(null)
  }

  const approve = async () => {
    if (!user?.uid || !selected) return
    try {
      setSaving(true)
      setSavingAction("approve")
      await decideHrRequest({ requestId: selected.id, status: "approved", decidedByUid: user.uid })
      toast({ title: "Aprobat", description: "Cererea a fost aprobată." })
      setDetailOpen(false)
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu am putut aproba.", variant: "destructive" })
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  const reject = async () => {
    if (!user?.uid || !selected) return
    if (!rejectionReason.trim()) {
      toast({ title: "Motiv obligatoriu", description: "Completează motivul refuzului.", variant: "destructive" })
      return
    }
    try {
      setSaving(true)
      setSavingAction("reject")
      await decideHrRequest({
        requestId: selected.id,
        status: "rejected",
        decidedByUid: user.uid,
        rejectionReason: rejectionReason.trim(),
      })
      toast({ title: "Respins", description: "Cererea a fost respinsă." })
      setDetailOpen(false)
      setRejectOpen(false)
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu am putut respinge.", variant: "destructive" })
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  const beginEdit = () => {
    if (!selected) return
    setEditPayload(clonePayload(selected.payload))
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!user?.uid || !selected || !editPayload) return
    try {
      setSaving(true)
      setSavingAction("edit")
      await updateHrRequestByManager({
        requestId: selected.id,
        managerUid: user.uid,
        updates: { payload: editPayload },
      })
      toast({ title: "Actualizat", description: "Cererea a fost actualizată." })
      setEditOpen(false)
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu am putut salva.", variant: "destructive" })
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  return (
    <DashboardShell>
      <DashboardHeader
        heading={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Concedii si evenimente
          </span>
        }
        text="Aprobă/respinge/editează cererile primite de la tehnicieni (în funcție de sectoarele alocate)."
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Cererile primite</CardTitle>
        </CardHeader>
        <CardContent>
          {!user?.uid ? (
            <div className="text-sm text-muted-foreground">Trebuie să fii autentificat.</div>
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full max-w-[360px] grid-cols-2">
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="all">Toate</TabsTrigger>
              </TabsList>

              <div className="mt-4">
                <TabsContent value="pending">
                  {filtered.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nu există concedii si evenimente.</div>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openDetail(r)}
                          className="w-full text-left flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {r.employeeName || r.employeeId} • {hrRequestKindLabel(r.kind)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                              <span>{hrRequestDateLabel(r)}</span>
                              <span>Departament: {r.sectorId ? (departmentsById[r.sectorId] || "—") : "—"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <Badge variant="secondary">{hrRequestStatusLabel(r.status)}</Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="all">
                  {filtered.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Nu există cereri.</div>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => openDetail(r)}
                          className="w-full text-left flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {r.employeeName || r.employeeId} • {hrRequestKindLabel(r.kind)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                              <span>{hrRequestDateLabel(r)}</span>
                              <span>Departament: {r.sectorId ? (departmentsById[r.sectorId] || "—") : "—"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <Badge
                              variant={
                                r.status === "approved" ? "default" : r.status === "pending" ? "secondary" : "destructive"
                              }
                            >
                              {hrRequestStatusLabel(r.status)}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(v) => {
          if (saving) return
          setDetailOpen(v)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalii cerere</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/20">
                <div className="text-sm">
                  <span className="text-muted-foreground">Angajat:</span>{" "}
                  <span className="font-semibold">{selected.employeeName || selected.employeeId}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Tip:</span>{" "}
                  <span className="font-semibold">{hrRequestKindLabel(selected.kind)}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Perioadă/zi:</span>{" "}
                  <span className="font-semibold">{hrRequestDateLabel(selected)}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Departament:</span>{" "}
                  <span className="font-semibold">
                    {selected.sectorId ? (departmentsById[selected.sectorId] || "—") : "—"}
                  </span>
                </div>
                <div className="text-sm mt-2">
                  <Badge
                    variant={
                      selected.status === "approved"
                        ? "default"
                        : selected.status === "pending"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {hrRequestStatusLabel(selected.status)}
                  </Badge>
                </div>
              </div>

              {"reason" in (selected.payload as any) && (selected.payload as any).reason ? (
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Motiv</div>
                  <div className="text-sm">{String((selected.payload as any).reason)}</div>
                </div>
              ) : null}

              {selected.status === "rejected" && selected.rejectionReason ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <div className="text-xs text-destructive">Motiv respingere</div>
                  <div className="text-sm">{selected.rejectionReason}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {selected && selected.status === "pending" ? (
              <>
                <Button variant="outline" onClick={() => selected && generateHrRequestPDF(selected)} disabled={saving}>
                  <Download className="h-4 w-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" onClick={beginEdit} disabled={saving || !canEditPayload(selected.kind)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editează
                </Button>
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={saving}>
                  Refuză
                </Button>
                <Button onClick={approve} disabled={saving}>
                  {saving && savingAction === "approve" ? (
                    <>
                      <Spinner className="h-4 w-4 mr-2 border-muted-foreground border-t-transparent" />
                      Se procesează...
                    </>
                  ) : (
                    "Aprobă"
                  )}
                </Button>
              </>
            ) : (
              <>
                {selected ? (
                  <Button variant="outline" onClick={() => generateHrRequestPDF(selected)}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setDetailOpen(false)}>
                  Închide
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(v) => {
          if (saving) return
          setRejectOpen(v)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Refuză cererea</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Motiv refuz *</Label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={reject} disabled={saving || !rejectionReason.trim()}>
              {saving && savingAction === "reject" ? (
                <>
                  <Spinner className="h-4 w-4 mr-2 border-muted-foreground border-t-transparent" />
                  Se procesează...
                </>
              ) : (
                "Confirmă refuz"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          if (saving) return
          setEditOpen(v)
          if (!v) setEditPayload(null)
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează cererea</DialogTitle>
          </DialogHeader>

          {selected && editPayload ? (
            <div className="space-y-4">
              {(selected.kind === "CO" || selected.kind === "CFP" || selected.kind === "CM" || selected.kind === "DEL") &&
              editPayload.kind === selected.kind ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>De la</Label>
                    <Input
                      type="date"
                      value={editPayload.startDate}
                      onChange={(e) => setEditPayload({ ...editPayload, startDate: e.target.value } as any)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Până la</Label>
                    <Input
                      type="date"
                      value={editPayload.endDate}
                      onChange={(e) => setEditPayload({ ...editPayload, endDate: e.target.value } as any)}
                    />
                  </div>
                </div>
              ) : null}

              {selected.kind === "IN" && editPayload.kind === "IN" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Data</Label>
                    <Input type="date" value={editPayload.date} onChange={(e) => setEditPayload({ ...editPayload, date: e.target.value } as any)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ora start</Label>
                    <Input
                      type="time"
                      value={editPayload.startTime}
                      onChange={(e) => setEditPayload({ ...editPayload, startTime: e.target.value } as any)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ora end</Label>
                    <Input
                      type="time"
                      value={editPayload.endTime}
                      onChange={(e) => setEditPayload({ ...editPayload, endTime: e.target.value } as any)}
                    />
                  </div>
                </div>
              ) : null}

              {selected.kind === "ADD_OVERTIME" && editPayload.kind === "ADD_OVERTIME" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Data</Label>
                    <Input type="date" value={editPayload.date} onChange={(e) => setEditPayload({ ...editPayload, date: e.target.value } as any)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ore suplimentare</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.25"
                      value={editPayload.overtimeHours}
                      onChange={(e) => setEditPayload({ ...editPayload, overtimeHours: Number(e.target.value) } as any)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label>Motiv (opțional)</Label>
                <Textarea
                  value={(editPayload as any).reason ?? ""}
                  onChange={(e) => setEditPayload({ ...(editPayload as any), reason: e.target.value } as any)}
                  rows={3}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button onClick={saveEdit} disabled={saving || !editPayload}>
              {saving && savingAction === "edit" ? (
                <>
                  <Spinner className="h-4 w-4 mr-2 border-muted-foreground border-t-transparent" />
                  Se procesează...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}


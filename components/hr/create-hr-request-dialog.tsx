"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, FileText, Trash2 } from "lucide-react"
import type { Department, Employee, HrRequest, HrRequestKind, HrRequestPayload } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { createHrRequest, subscribeDepartments, subscribeHrRequestsForEmployee } from "@/lib/hr/storage"
import { toast } from "@/hooks/use-toast"
import { DateInput } from "@/components/ui/date-input"
import { formatISODate } from "@/lib/utils/date-utils"
import { uploadFile } from "@/lib/firebase/storage"
import { TimeSelector } from "@/components/time-selector"

function asNumber(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const BLOCKED_OVERLAP_KINDS: HrRequestKind[] = ["CO", "CFP", "CM", "DEL", "IN"]

function toRoDate(iso: string): string {
  const s = String(iso || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "N/A"
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`
}

function enumerateDatesInclusiveISO(startDate: string, endDate: string): string[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const dates: string[] = []
  const d = new Date(start)
  while (d <= end) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    dates.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function requestDatesISO(kind: HrRequestKind, payload: any): string[] {
  if (!BLOCKED_OVERLAP_KINDS.includes(kind) || !payload) return []
  if (kind === "IN") {
    const d = String(payload?.date || "")
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? [d] : []
  }
  const start = String(payload?.startDate || "")
  const end = String(payload?.endDate || "")
  return enumerateDatesInclusiveISO(start, end).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
}

export function CreateHrRequestDialog({
  open,
  onOpenChange,
  employee,
  requesterUid,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employee: Employee
  requesterUid: string
}) {
  const sectors = useMemo(() => employee.sectorIds ?? [], [employee.sectorIds])
  const [departments, setDepartments] = useState<Department[]>([])
  const [sectorId, setSectorId] = useState(sectors[0] ?? "")
  const [kind, setKind] = useState<HrRequestKind>("CO")

  // Shared
  const [reason, setReason] = useState("")

  // Range kinds
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [clientName, setClientName] = useState("")
  const [medicalDocumentFile, setMedicalDocumentFile] = useState<File | null>(null)

  // Invoire / single date
  const [date, setDate] = useState("")
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("16:00")

  // Correct hours
  const [entries, setEntries] = useState<Array<{ start: string; end: string; project?: string }>>([
    { start: "08:00", end: "16:00" },
  ])
  const [breaks, setBreaks] = useState<Array<{ start: string; end: string }>>([{ start: "12:00", end: "12:30" }])

  // Overtime
  const [overtimeHours, setOvertimeHours] = useState("1")

  const [submitting, setSubmitting] = useState(false)
  const [existingRequests, setExistingRequests] = useState<HrRequest[]>([])

  const todayIso = useMemo(() => formatISODate(new Date()), [])
  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: setDepartments,
      onError: () => undefined,
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!employee?.id) {
      setExistingRequests([])
      return
    }
    const unsub = subscribeHrRequestsForEmployee({
      employeeId: employee.id,
      onChange: setExistingRequests,
      onError: () => setExistingRequests([]),
    })
    return () => unsub()
  }, [employee?.id])

  const deptNameById = useMemo(() => {
    return Object.fromEntries(departments.map((d) => [d.id, d.name]))
  }, [departments])

  const managerUid = sectorId ? employee.managerUidBySector?.[sectorId] || employee.superiorUid : undefined
  const shouldShowSectorSelect = sectors.length > 1

  useEffect(() => {
    // Când există un singur departament permis, îl setăm automat și ascundem selectorul.
    if (sectors.length === 1) {
      if (sectorId !== sectors[0]) setSectorId(sectors[0])
      return
    }
    // Pentru 2+ departamente, dacă selecția curentă nu mai este validă, revenim la prima opțiune.
    if (sectors.length > 1 && !sectors.includes(sectorId)) {
      setSectorId(sectors[0])
      return
    }
    if (sectors.length === 0 && sectorId) {
      setSectorId("")
    }
  }, [sectors, sectorId])

  const canSubmit = useMemo(() => {
    if (!sectorId) return false
    if (!managerUid) return false
    if (kind === "CO") return !!startDate && !!endDate
    if (kind === "DEL") return !!startDate && !!endDate && !!clientName.trim()
    if (kind === "CFP") return !!startDate && !!endDate
    if (kind === "CM") return !!startDate && !!endDate && !!medicalDocumentFile
    if (kind === "IN") return !!date && !!startTime && !!endTime
    if (kind === "CORRECT_HOURS") return !!date && entries.some((e) => e.start && e.end)
    if (kind === "ADD_OVERTIME") return !!date && asNumber(overtimeHours) > 0
    return false
  }, [
    sectorId,
    managerUid,
    kind,
    startDate,
    endDate,
    clientName,
    date,
    startTime,
    endTime,
    entries,
    overtimeHours,
    medicalDocumentFile,
  ])

  const overlapHint = useMemo(() => {
    if (!BLOCKED_OVERLAP_KINDS.includes(kind)) return null
    const candidatePayload: any =
      kind === "IN"
        ? { date }
        : {
            startDate,
            endDate,
          }
    const candidateDates = requestDatesISO(kind, candidatePayload)
    if (!candidateDates.length) return null
    const candidateSet = new Set(candidateDates)

    const active = existingRequests.filter(
      (r) => (r.status === "pending" || r.status === "approved") && BLOCKED_OVERLAP_KINDS.includes(r.kind),
    )
    for (const req of active) {
      const dates = requestDatesISO(req.kind, req.payload as any)
      const overlapDate = dates.find((d) => candidateSet.has(d))
      if (!overlapDate) continue
      const statusText = req.status === "approved" ? "aprobată" : "în așteptare"
      return `Există deja o cerere ${hrRequestKindLabel(req.kind)} (${statusText}) pe data ${toRoDate(overlapDate)}.`
    }
    return null
  }, [kind, startDate, endDate, date, existingRequests])

  const reset = () => {
    setReason("")
    setStartDate("")
    setEndDate("")
    setClientName("")
    setMedicalDocumentFile(null)
    setDate("")
    setStartTime("08:00")
    setEndTime("16:00")
    setEntries([{ start: "08:00", end: "16:00" }])
    setBreaks([{ start: "12:00", end: "12:30" }])
    setOvertimeHours("1")
  }

  const submit = async () => {
    try {
      if (overlapHint) {
        toast({ title: "Cerere blocată", description: overlapHint, variant: "destructive" })
        return
      }
      if (!sectorId) {
        toast({ title: "Eroare", description: "Selectează departamentul.", variant: "destructive" })
        return
      }
      if (!managerUid) {
        toast({
          title: "Eroare",
          description: "Nu este setat șeful ierarhic pentru acest departament (sau global) în fișa de salariat.",
          variant: "destructive",
        })
        return
      }

      let payload: HrRequestPayload
      if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
        if (!startDate || !endDate) throw new Error("Completează perioada (de la / până la).")
        if (kind === "DEL") {
          if (!clientName.trim()) {
            throw new Error("Completează numele clientului pentru delegație.")
          }
        }

        let medicalDocumentUrl: string | undefined
        let medicalDocumentName: string | undefined
        if (kind === "CM") {
          if (!medicalDocumentFile) {
            throw new Error("Pentru concediu medical trebuie să încarci documentul de la medic.")
          }
          const safeName = medicalDocumentFile.name.replace(/\s+/g, "_")
          const path = `hr/requests/cm/${employee.id}/${Date.now()}_${safeName}`
          const uploaded = await uploadFile(medicalDocumentFile, path)
          medicalDocumentUrl = uploaded.url
          medicalDocumentName = uploaded.fileName
        }

        payload = {
          kind,
          startDate,
          endDate,
          reason: reason.trim() || undefined,
          eventStartTime: undefined,
          eventEndTime: undefined,
          clientName: kind === "DEL" ? clientName.trim() : undefined,
          medicalDocumentUrl,
          medicalDocumentName,
        }
      } else if (kind === "IN") {
        if (!date || !startTime || !endTime) throw new Error("Completează data și intervalul.")
        payload = { kind, date, startTime, endTime, reason: reason.trim() || undefined }
      } else if (kind === "CORRECT_HOURS") {
        if (!date) throw new Error("Completează data.")
        payload = {
          kind,
          date,
          entries: entries.filter((e) => e.start && e.end),
          breaks: breaks.filter((b) => b.start && b.end),
          reason: reason.trim() || undefined,
        }
      } else {
        if (!date) throw new Error("Completează data.")
        payload = { kind, date, overtimeHours: asNumber(overtimeHours), reason: reason.trim() || undefined }
      }

      setSubmitting(true)
      await createHrRequest({
        employeeId: employee.id,
        employeeName: getEmployeeFullName(employee),
        requesterUid,
        sectorId,
        managerUid,
        kind,
        status: "pending",
        payload,
      })

      toast({ title: "Cerere creată", description: "Cererea a fost trimisă către șeful ierarhic." })
      reset()
      onOpenChange(false)
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu am putut crea cererea.", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Cerere nouă
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Angajat:</span>{" "}
                <span className="font-semibold">{getEmployeeFullName(employee)}</span>
              </div>
              {sectors.length === 0 ? (
                <div className="text-xs text-destructive mt-2">
                  Nu ai sectoare configurate în fișa de salariat (necesar pentru aprobator).
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Departament *</Label>
              {shouldShowSectorSelect ? (
                <Select value={sectorId} onValueChange={setSectorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează departament" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map((s) => (
                      <SelectItem key={s} value={s}>
                        {deptNameById[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={deptNameById[sectorId] || sectorId || "—"} readOnly disabled />
              )}
              {sectorId && !managerUid ? (
                <div className="text-xs text-destructive">
                  Nu există șef ierarhic setat pentru acest departament (sau global) în fișa de salariat.
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label>Tip cerere *</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as HrRequestKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    [
                      "CO",
                      "CFP",
                      "CM",
                      "IN",
                      "DEL",
                      "CORRECT_HOURS",
                      "ADD_OVERTIME",
                    ] as HrRequestKind[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {hrRequestKindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>De la *</Label>
                  <DateInput
                    value={startDate}
                    onChange={setStartDate}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Până la *</Label>
                  <DateInput
                    value={endDate}
                    onChange={setEndDate}
                  />
                </div>
              </div>

              {kind === "DEL" ? (
                <div className="grid gap-2">
                  <Label>Nume client (delegație) *</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: ACME Industrial SRL"
                  />
                </div>
              ) : null}

              {kind === "CM" ? (
                <div className="grid gap-2">
                  <Label htmlFor="cm-document">Încarcă document medical *</Label>
                  <Input
                    id="cm-document"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setMedicalDocumentFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Atașează poză sau PDF cu documentul primit de la medic.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {kind === "IN" && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Data *</Label>
                <DateInput value={date} onChange={setDate} />
              </div>
              <div className="grid gap-2">
                <Label>Ora start *</Label>
                <TimeSelector id="in-start-time" label="Ora start" value={startTime} onChange={setStartTime} />
              </div>
              <div className="grid gap-2">
                <Label>Ora end *</Label>
                <TimeSelector id="in-end-time" label="Ora end" value={endTime} onChange={setEndTime} />
              </div>
            </div>
          )}

          {kind === "ADD_OVERTIME" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Data *</Label>
                <DateInput value={date} onChange={setDate} />
              </div>
              <div className="grid gap-2">
                <Label>Ore suplimentare *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(e.target.value)}
                />
              </div>
            </div>
          )}

          {kind === "CORRECT_HOURS" && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>Data *</Label>
                <DateInput value={date} onChange={setDate} />
              </div>

              <div className="grid gap-2">
                <Label>Intervale de lucru (după corectare) *</Label>
                <div className="space-y-2">
                  {entries.map((e, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Start</Label>
                        <TimeSelector
                          id={`correct-hours-entry-start-${idx}`}
                          label={`Interval ${idx + 1} start`}
                          value={e.start}
                          onChange={(value) =>
                            setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, start: value } : x)))
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">End</Label>
                        <TimeSelector
                          id={`correct-hours-entry-end-${idx}`}
                          label={`Interval ${idx + 1} end`}
                          value={e.end}
                          onChange={(value) =>
                            setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, end: value } : x)))
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={entries.length === 1}
                        aria-label="Șterge interval"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => setEntries((prev) => [...prev, { start: "08:00", end: "16:00" }])}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adaugă interval
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Pauze (opțional)</Label>
                <div className="space-y-2">
                  {breaks.map((b, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Start</Label>
                        <TimeSelector
                          id={`correct-hours-break-start-${idx}`}
                          label={`Pauză ${idx + 1} start`}
                          value={b.start}
                          onChange={(value) =>
                            setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, start: value } : x)))
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">End</Label>
                        <TimeSelector
                          id={`correct-hours-break-end-${idx}`}
                          label={`Pauză ${idx + 1} end`}
                          value={b.end}
                          onChange={(value) =>
                            setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, end: value } : x)))
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setBreaks((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={breaks.length === 1}
                        aria-label="Șterge pauză"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={() => setBreaks((prev) => [...prev, { start: "12:00", end: "12:30" }])}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adaugă pauză
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Motiv (opțional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ex: motiv scurt..." />
          </div>

          {overlapHint ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {overlapHint} Nu poți trimite o altă cerere activă în aceeași zi.
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anulează
          </Button>
          <Button onClick={submit} disabled={submitting || !canSubmit || Boolean(overlapHint)}>
            {submitting ? "Se trimite..." : "Trimite cererea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import type { Department, Employee, HrRequestKind, HrRequestPayload } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { createHrRequest, subscribeDepartments } from "@/lib/hr/storage"
import { toast } from "@/hooks/use-toast"

function asNumber(v: string) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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
  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: setDepartments,
      onError: () => undefined,
    })
    return () => unsub()
  }, [])

  const deptNameById = useMemo(() => {
    return Object.fromEntries(departments.map((d) => [d.id, d.name]))
  }, [departments])

  const managerUid = sectorId ? employee.managerUidBySector?.[sectorId] || employee.superiorUid : undefined

  const canSubmit = useMemo(() => {
    if (!sectorId) return false
    if (!managerUid) return false
    if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "SL" || kind === "DEL") return !!startDate && !!endDate
    if (kind === "IN") return !!date && !!startTime && !!endTime
    if (kind === "CORRECT_HOURS") return !!date && entries.some((e) => e.start && e.end)
    if (kind === "ADD_OVERTIME") return !!date && asNumber(overtimeHours) > 0
    return false
  }, [sectorId, managerUid, kind, startDate, endDate, date, startTime, endTime, entries, overtimeHours])

  const reset = () => {
    setReason("")
    setStartDate("")
    setEndDate("")
    setDate("")
    setStartTime("08:00")
    setEndTime("16:00")
    setEntries([{ start: "08:00", end: "16:00" }])
    setBreaks([{ start: "12:00", end: "12:30" }])
    setOvertimeHours("1")
  }

  const submit = async () => {
    try {
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
      if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "SL" || kind === "DEL") {
        if (!startDate || !endDate) throw new Error("Completează perioada (de la / până la).")
        payload = { kind, startDate, endDate, reason: reason.trim() || undefined }
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
                      "SL",
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

          {(kind === "CO" || kind === "CFP" || kind === "CM" || kind === "SL" || kind === "DEL") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>De la *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Până la *</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
              </div>
            </div>
          )}

          {kind === "IN" && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Data *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Ora start *</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Ora end *</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          {kind === "ADD_OVERTIME" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Data *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="grid gap-2">
                <Label>Intervale de lucru (după corectare) *</Label>
                <div className="space-y-2">
                  {entries.map((e, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Start</Label>
                        <Input
                          type="time"
                          value={e.start}
                          onChange={(ev) =>
                            setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">End</Label>
                        <Input
                          type="time"
                          value={e.end}
                          onChange={(ev) =>
                            setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))
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
                        <Input
                          type="time"
                          value={b.start}
                          onChange={(ev) =>
                            setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">End</Label>
                        <Input
                          type="time"
                          value={b.end}
                          onChange={(ev) =>
                            setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anulează
          </Button>
          <Button onClick={submit} disabled={submitting || !canSubmit}>
            {submitting ? "Se trimite..." : "Trimite cererea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


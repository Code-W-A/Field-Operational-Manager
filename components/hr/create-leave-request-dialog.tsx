"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import type { Department, Employee, HrRequestKind } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { createHrRequest } from "@/lib/hr/storage"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { CalendarDays, FileText } from "lucide-react"
import { DateInput } from "@/components/ui/date-input"
import { formatISODate } from "@/lib/utils/date-utils"

function calculateWorkDays(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr)
  let count = 0
  const current = new Date(start)
  
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return count
}

function isTimeRangeValid(start: string, end: string) {
  if (!start || !end) return false
  return start < end
}

export function CreateLeaveRequestDialog({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
  requesterUid,
  departments,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employees: Employee[]
  defaultEmployeeId?: string
  requesterUid: string
  departments?: Department[]
}) {
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => getEmployeeFullName(a).localeCompare(getEmployeeFullName(b))),
    [employees]
  )
  
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId || sortedEmployees[0]?.id || "")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [type, setType] = useState<"CO" | "CFP" | "CM" | "DEL">("CO")
  const [reason, setReason] = useState("")
  const [eventStartTime, setEventStartTime] = useState("08:00")
  const [eventEndTime, setEventEndTime] = useState("16:30")
  const [clientName, setClientName] = useState("")
  const [sectorId, setSectorId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayIso = useMemo(() => formatISODate(new Date()), [])
  const monthStartIso = useMemo(() => formatISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), [])
  
  // Zile disponibile (hardcoded pentru demo - în producție ar veni din baza de date)
  const availableDays = 21
  
  const workDays = useMemo(() => {
    return calculateWorkDays(startDate, endDate)
  }, [startDate, endDate])
  
  const remainingDays = availableDays - workDays
  
  const selectedEmployee = employees.find(e => e.id === employeeId)
  const availableSectors = selectedEmployee?.sectorIds ?? []
  const managerUid = sectorId ? selectedEmployee?.managerUidBySector?.[sectorId] || selectedEmployee?.superiorUid : undefined

  useEffect(() => {
    if (!availableSectors.length) {
      setSectorId("")
      return
    }
    if (availableSectors.includes(sectorId)) return
    setSectorId(availableSectors[0])
  }, [availableSectors, sectorId])

  useEffect(() => {
    if (!selectedEmployee) return
    setEventStartTime(selectedEmployee.programLucruStart || "08:00")
    setEventEndTime(selectedEmployee.programLucruEnd || "16:30")
  }, [selectedEmployee?.id])
  
  const handleSubmit = async () => {
    setError(null)

    if (!requesterUid) {
      setError("Nu există un utilizator autentificat pentru a trimite cererea.")
      return
    }
    if (!employeeId || !startDate || !endDate) {
      setError("Completează toate câmpurile obligatorii")
      return
    }

    if (type === "DEL") {
      const monthKey = todayIso.slice(0, 7)
      if (!startDate.startsWith(monthKey) || !endDate.startsWith(monthKey)) {
        setError("Delegația poate fi introdusă doar în luna în curs.")
        return
      }
      if (startDate > todayIso || endDate > todayIso) {
        setError("Delegația poate fi introdusă doar pentru zile anterioare sau curente.")
        return
      }
      if (!clientName.trim()) {
        setError("Completează numele clientului pentru delegație.")
        return
      }
    }

    if (type === "CO" && !isTimeRangeValid(eventStartTime, eventEndTime)) {
      setError("Intervalul orar pentru eveniment trebuie să fie valid (ora de început < ora de sfârșit).")
      return
    }
    
    if (workDays <= 0) {
      setError("Perioada selectată trebuie să conțină cel puțin o zi lucrătoare")
      return
    }
    
    if (remainingDays < 0) {
      setError(`Nu ai suficiente zile disponibile. Ai doar ${availableDays} zile, dar soliciți ${workDays} zile.`)
      return
    }
    
    try {
      if (!sectorId) {
        setError("Selectează sectorul")
        return
      }
      if (!managerUid) {
        setError("Nu este setat șeful ierarhic pentru acest sector (sau global) în fișa de salariat.")
        return
      }

      setSubmitting(true)
      const rangePayload = {
        kind: type,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
        eventStartTime: type === "CO" ? eventStartTime : undefined,
        eventEndTime: type === "CO" ? eventEndTime : undefined,
        clientName: type === "DEL" ? clientName.trim() : undefined,
      }

      const requestId = await createHrRequest({
        employeeId,
        employeeName: selectedEmployee ? getEmployeeFullName(selectedEmployee) : undefined,
        requesterUid,
        sectorId,
        managerUid,
        kind: type,
        status: "pending",
        payload: rangePayload,
      })

      if (selectedEmployee) {
        generateHrRequestPDF({
          id: requestId,
          employeeId,
          employeeName: getEmployeeFullName(selectedEmployee),
          requesterUid,
          sectorId,
          managerUid,
          kind: type,
          status: "pending",
          payload: rangePayload,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
      
      // Resetare formular
      setStartDate("")
      setEndDate("")
      setType("CO")
      setReason("")
      setEventStartTime(selectedEmployee?.programLucruStart || "08:00")
      setEventEndTime(selectedEmployee?.programLucruEnd || "16:30")
      setClientName("")
      setError(null)
      
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || "Nu am putut crea cererea. Încearcă din nou.")
    } finally {
      setSubmitting(false)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Cerere nouă de concediu
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Info KPI */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Zile disponibile</div>
                  <div className="text-2xl font-bold text-blue-600">{availableDays}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Zile solicitate</div>
                  <div className="text-2xl font-bold text-amber-600">{workDays}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Zile rămase</div>
                  <div className={`text-2xl font-bold ${remainingDays < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {remainingDays}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Formular */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="employee">Angajat *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="employee">
                  <SelectValue placeholder="Selectează angajat" />
                </SelectTrigger>
                <SelectContent>
                  {sortedEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {getEmployeeFullName(e)} {e.title && `• ${e.title}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sector">Sector *</Label>
              <Select value={sectorId} onValueChange={setSectorId}>
                <SelectTrigger id="sector">
                  <SelectValue placeholder="Selectează sector" />
                </SelectTrigger>
                <SelectContent>
                  {availableSectors.map((s) => {
                    const deptName = departments?.find((d) => d.id === s)?.name
                    return (
                      <SelectItem key={s} value={s}>
                        {deptName || s}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {sectorId && !managerUid ? (
                <div className="text-xs text-destructive">
                  Nu există șef ierarhic setat pentru acest sector (sau global) în fișa de salariat.
                </div>
              ) : null}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Data început *</Label>
                <DateInput
                  value={startDate}
                  onChange={setStartDate}
                  min={type === "DEL" ? monthStartIso : undefined}
                  max={type === "DEL" ? todayIso : undefined}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="endDate">Data sfârșit *</Label>
                <DateInput
                  value={endDate}
                  onChange={setEndDate}
                  min={type === "DEL" ? monthStartIso : undefined}
                  max={type === "DEL" ? todayIso : undefined}
                />
              </div>
            </div>

            {type === "CO" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="eventStartTime">Ora început eveniment *</Label>
                  <Input
                    id="eventStartTime"
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="eventEndTime">Ora sfârșit eveniment *</Label>
                  <Input
                    id="eventEndTime"
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {type === "DEL" && (
              <div className="grid gap-2">
                <Label htmlFor="clientName">Nume client (delegație) *</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: ACME Industrial SRL"
                />
              </div>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="type">Tip concediu *</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["CO", "CFP", "CM", "DEL"] as HrRequestKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {hrRequestKindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="reason">Motiv (opțional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Concediu planificat pentru vacanță..."
                rows={3}
              />
            </div>
          </div>
          
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">
            <div className="flex gap-2">
              <CalendarDays className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">Generare automată document</div>
                <div className="text-xs">
                  După crearea cererii, se va descărca automat documentul cu cererea
                  completată conform modelului oficial, gata de semnat și depus la HR.
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anulează
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !employeeId ||
              !startDate ||
              !endDate ||
              (type === "CO" && (!eventStartTime || !eventEndTime)) ||
              (type === "DEL" && !clientName.trim())
            }
          >
            {submitting ? "Se creează..." : "Creează cerere + document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

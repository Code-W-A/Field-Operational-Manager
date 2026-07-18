"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import type { Department, Employee, HrRequest, HrRequestKind } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { createHrRequest, subscribeHrRequestsForEmployee } from "@/lib/hr/storage"
import { generateHrRequestDOCX } from "@/lib/hr/request-docx-generator"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { CalendarDays, FileText } from "lucide-react"
import { DateInput } from "@/components/ui/date-input"
import { formatISODate } from "@/lib/utils/date-utils"
import { uploadFile } from "@/lib/firebase/storage"
import { validateHrRequestPayload, validateMedicalDocumentFile } from "@/lib/hr/request-validation"

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
  if (kind === "IN") {
    const d = String(payload?.date || "")
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? [d] : []
  }
  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    const start = String(payload?.startDate || "")
    const end = String(payload?.endDate || "")
    return enumerateDatesInclusiveISO(start, end).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  }
  return []
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

  useEffect(() => {
    if (!open) return
    if (defaultEmployeeId && sortedEmployees.some((e) => e.id === defaultEmployeeId)) {
      setEmployeeId(defaultEmployeeId)
    } else if (sortedEmployees.length === 1) {
      setEmployeeId(sortedEmployees[0].id)
    }
  }, [open, defaultEmployeeId, sortedEmployees])
  const [endDate, setEndDate] = useState("")
  const [type, setType] = useState<"CO" | "CFP" | "CM" | "DEL">("CO")
  const [reason, setReason] = useState("")
  const [clientName, setClientName] = useState("")
  const [medicalDocumentFile, setMedicalDocumentFile] = useState<File | null>(null)
  const [sectorId, setSectorId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [existingRequests, setExistingRequests] = useState<HrRequest[]>([])

  const todayIso = useMemo(() => formatISODate(new Date()), [])
  
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
    if (!employeeId) {
      setExistingRequests([])
      return
    }
    const unsub = subscribeHrRequestsForEmployee({
      employeeId,
      onChange: setExistingRequests,
      onError: () => setExistingRequests([]),
    })
    return () => unsub()
  }, [employeeId])

  const overlapHint = useMemo(() => {
    const candidateDates = requestDatesISO(type, { startDate, endDate })
    if (!candidateDates.length) return null
    const candidateSet = new Set(candidateDates)
    const active = existingRequests.filter((r) => r.status === "pending" || r.status === "approved")
    for (const req of active) {
      if (!(req.kind === "CO" || req.kind === "CFP" || req.kind === "CM" || req.kind === "DEL" || req.kind === "IN")) continue
      const dates = requestDatesISO(req.kind, req.payload as any)
      const overlapDate = dates.find((d) => candidateSet.has(d))
      if (!overlapDate) continue
      const statusText = req.status === "approved" ? "aprobată" : "în așteptare"
      return `Există deja o cerere ${hrRequestKindLabel(req.kind)} (${statusText}) pe data ${toRoDate(overlapDate)}.`
    }
    return null
  }, [type, startDate, endDate, existingRequests])

  const handleSubmit = async () => {
    if (submittingRef.current) return
    setError(null)

    if (overlapHint) {
      setError(`${overlapHint} Nu poți trimite o altă cerere activă în aceeași zi.`)
      return
    }

    if (!requesterUid) {
      setError("Nu există un utilizator autentificat pentru a trimite cererea.")
      return
    }
    if (!employeeId || !startDate || !endDate) {
      setError("Completează toate câmpurile obligatorii")
      return
    }

    if (type === "DEL") {
      if (!clientName.trim()) {
        setError("Completează numele clientului pentru delegație.")
        return
      }
    }

    if (type === "CM" && !medicalDocumentFile) {
      setError("Pentru concediu medical trebuie să încarci documentul de la medic.")
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

      submittingRef.current = true
      setSubmitting(true)
      let medicalDocumentUrl: string | undefined
      let medicalDocumentName: string | undefined
      if (type === "CM") {
        const file = medicalDocumentFile
        const medicalFileError = validateMedicalDocumentFile(file)
        if (medicalFileError) {
          setError(medicalFileError)
          setSubmitting(false)
          return
        }
        if (!file) return
        const safeName = file.name.replace(/\s+/g, "_")
        const path = `hr/requests/cm/${employeeId}/${Date.now()}_${safeName}`
        const uploaded = await uploadFile(file, path)
        medicalDocumentUrl = uploaded.url
        medicalDocumentName = uploaded.fileName
      }
      const rangePayload = {
        kind: type,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
        eventStartTime: undefined,
        eventEndTime: undefined,
        clientName: type === "DEL" ? clientName.trim() : undefined,
        medicalDocumentUrl,
        medicalDocumentName,
      }

      const validationError = validateHrRequestPayload(type, rangePayload)
      if (validationError) {
        setError(validationError)
        return
      }

      const { id: requestId, documentSerial } = await createHrRequest({
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
        generateHrRequestDOCX({
          id: requestId,
          employeeId,
          employeeName: getEmployeeFullName(selectedEmployee),
          requesterUid,
          sectorId,
          managerUid,
          kind: type,
          status: "pending",
          payload: rangePayload,
          documentSerial,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
      
      // Resetare formular
      setStartDate("")
      setEndDate("")
      setType("CO")
      setReason("")
      setClientName("")
      setMedicalDocumentFile(null)
      setError(null)
      
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || "Nu am putut crea cererea. Încearcă din nou.")
    } finally {
      submittingRef.current = false
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
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="endDate">Data sfârșit *</Label>
                <DateInput
                  value={endDate}
                  onChange={setEndDate}
                />
              </div>
            </div>

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

            {type === "CM" && (
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
                <div className="font-semibold mb-1">Generare automată document DOCX</div>
                <div className="text-xs">
                  După crearea cererii, se va descărca automat documentul DOCX cu cererea
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
              (type === "CM" && !medicalDocumentFile) ||
              Boolean(overlapHint) ||
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

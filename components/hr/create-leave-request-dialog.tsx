"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import type { Employee, LeaveRequest } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { createLeaveRequest } from "@/lib/hr/storage"
import { generateLeaveRequestPDF } from "@/lib/hr/leave-pdf-generator"
import { CalendarDays, FileText } from "lucide-react"

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

export function CreateLeaveRequestDialog({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employees: Employee[]
  defaultEmployeeId?: string
}) {
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees]
  )
  
  const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId || sortedEmployees[0]?.id || "")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [type, setType] = useState<"CO" | "SL" | "DEL">("CO")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Zile disponibile (hardcoded pentru demo - în producție ar veni din baza de date)
  const availableDays = 21
  
  const workDays = useMemo(() => {
    return calculateWorkDays(startDate, endDate)
  }, [startDate, endDate])
  
  const remainingDays = availableDays - workDays
  
  const selectedEmployee = employees.find(e => e.id === employeeId)
  
  const handleSubmit = async () => {
    setError(null)
    
    if (!employeeId || !startDate || !endDate) {
      setError("Completează toate câmpurile obligatorii")
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
      setSubmitting(true)
      
      // Creează cererea în Firestore
      const request: Omit<LeaveRequest, "id" | "createdAt"> = {
        employeeId,
        startDate,
        endDate,
        type,
        status: "pending",
        reason: reason.trim() || undefined,
      }
      
      await createLeaveRequest(request)
      
      // Generează PDF
      if (selectedEmployee) {
        generateLeaveRequestPDF(
          { ...request, id: "temp", createdAt: Date.now() },
          selectedEmployee,
          availableDays,
          remainingDays
        )
      }
      
      // Resetare formular
      setStartDate("")
      setEndDate("")
      setType("CO")
      setReason("")
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
                  {sortedEmployees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {getEmployeeFullName(e)} {e.title && `• ${e.title}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Data început *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="endDate">Data sfârșit *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                />
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="type">Tip concediu *</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CO">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
                      Concediu de odihnă (CO)
                    </div>
                  </SelectItem>
                  <SelectItem value="SL">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
                      Sărbătoare legală (SL)
                    </div>
                  </SelectItem>
                  <SelectItem value="DEL">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded-full bg-violet-500" />
                      Delegație (DEL)
                    </div>
                  </SelectItem>
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
                <div className="font-semibold mb-1">Generare automată PDF</div>
                <div className="text-xs">
                  După crearea cererii, se va descărca automat un document PDF cu cererea de concediu 
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
          <Button onClick={handleSubmit} disabled={submitting || !employeeId || !startDate || !endDate}>
            {submitting ? "Se creează..." : "Creează cerere + PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


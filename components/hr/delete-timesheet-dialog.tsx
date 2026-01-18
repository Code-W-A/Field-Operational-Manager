"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Employee, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { DateInput } from "@/components/ui/date-input"

function parseMonthKeyFromDate(dateStr: string): TimesheetMonthKey | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}` as TimesheetMonthKey
}

export function DeleteTimesheetDialog({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
  defaultStartDate,
  defaultEndDate,
  onSubmitRange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employees: Employee[]
  defaultEmployeeId?: string
  defaultStartDate?: string // yyyy-mm-dd
  defaultEndDate?: string // yyyy-mm-dd
  onSubmitRange: (params: {
    employeeId: string
    startDate: string
    endDate: string
    deleteEntries: boolean
    deleteBreaks: boolean
    monthKey: TimesheetMonthKey
  }) => Promise<void>
}) {
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees]
  )

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined)
  const [startDate, setStartDate] = useState<string>(today)
  const [endDate, setEndDate] = useState<string>(today)
  const [deleteEntries, setDeleteEntries] = useState<boolean>(true)
  const [deleteBreaks, setDeleteBreaks] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset form state each time the dialog opens (and keep it in sync with defaults).
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)

    const fallbackEmployee = sortedEmployees[0]?.id
    setEmployeeId(defaultEmployeeId ?? fallbackEmployee)
    setStartDate(defaultStartDate ?? today)
    setEndDate(defaultEndDate ?? defaultStartDate ?? today)
    setDeleteEntries(true)
    setDeleteBreaks(true)
  }, [open, defaultEmployeeId, defaultStartDate, defaultEndDate, sortedEmployees, today])

  const submit = async () => {
    setError(null)
    if (submitting) return
    if (!employeeId || !startDate || !endDate) {
      setError("Completează toate câmpurile.")
      return
    }
    if (!deleteEntries && !deleteBreaks) {
      setError("Bifează cel puțin o opțiune de ștergere.")
      return
    }
    const mk1 = parseMonthKeyFromDate(startDate)
    const mk2 = parseMonthKeyFromDate(endDate)
    if (!mk1 || !mk2 || mk1 !== mk2) {
      setError("Intervalul selectat trebuie să fie în aceeași lună.")
      return
    }
    try {
      setSubmitting(true)
      await onSubmitRange({ employeeId, startDate, endDate, deleteEntries, deleteBreaks, monthKey: mk1 })
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Nu am putut șterge pontajul. Încearcă din nou.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[calc(100vw-24px)] sm:w-[min(50vw,900px)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Șterge pontajul</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Angajați pentru care ștergi pontajul</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={sortedEmployees.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={sortedEmployees.length ? "Alege angajat" : "Nu există angajați activi"} />
              </SelectTrigger>
              <SelectContent>
                {sortedEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {getEmployeeFullName(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Data de începere</Label>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>

            <div className="grid gap-2">
              <Label>Data de oprire</Label>
              <DateInput value={endDate} onChange={setEndDate} />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center gap-3">
              <Checkbox id="deleteEntries" checked={deleteEntries} onCheckedChange={(v) => setDeleteEntries(Boolean(v))} />
              <Label htmlFor="deleteEntries" className="text-sm font-normal cursor-pointer">
                Șterge intrările de timp înregistrat
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="deleteBreaks" checked={deleteBreaks} onCheckedChange={(v) => setDeleteBreaks(Boolean(v))} />
              <Label htmlFor="deleteBreaks" className="text-sm font-normal cursor-pointer">
                Șterge intrările de pauză înregistrată
              </Label>
            </div>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Închide
          </Button>
          <Button
            onClick={submit}
            disabled={!employeeId || !startDate || !endDate || (!deleteEntries && !deleteBreaks) || submitting}
            variant="destructive"
          >
            {submitting ? "Se șterge..." : "Șterge pontajul"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

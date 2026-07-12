"use client"

import { useMemo, useState, useEffect } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2 } from "lucide-react"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { DateInput } from "@/components/ui/date-input"
import { formatISODate } from "@/lib/utils/date-utils"
import { calcEffectiveMinutes, type HMRange, isValidHMRange } from "@/lib/hr/time-calc"

function parseMonthKeyFromDate(dateStr: string): TimesheetMonthKey | null {
  if (!dateStr) return null
  // dateStr is ISO yyyy-MM-dd; parse without Date() to avoid timezone shifts.
  const parts = String(dateStr).split("-")
  if (parts.length < 2) return null
  const y = parts[0]
  const m = parts[1]
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return null
  return `${y}-${m}` as TimesheetMonthKey
}

function diffMinutes(start: string, end: string) {
  const m1 = /^(\d{1,2}):(\d{2})$/.exec(start.trim())
  const m2 = /^(\d{1,2}):(\d{2})$/.exec(end.trim())
  if (!m1 || !m2) return 0
  const s = Number(m1[1]) * 60 + Number(m1[2])
  const e = Number(m2[1]) * 60 + Number(m2[2])
  return Math.max(0, e - s)
}

function isValidHHMM(value: string) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim())
}

function normalizeHHMM(value: string) {
  const raw = String(value || "").trim()
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(raw)
  if (!m) return raw
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return raw
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return raw
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function TimeInput24({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const invalid = value ? !isValidHHMM(value) : false
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-gray-600">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="HH:mm"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onBlur={() => onChange(normalizeHHMM(value))}
        className={`h-10 bg-white border-gray-300 text-gray-900 font-mono ${invalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
        aria-invalid={invalid}
        autoComplete="off"
      />
    </div>
  )
}

function calcHours(entries: Array<{ start: string; end: string }>, breaks: Array<{ start: string; end: string }>) {
  const work = entries.reduce((acc, it) => acc + diffMinutes(it.start, it.end), 0)
  const br = breaks.reduce((acc, it) => acc + diffMinutes(it.start, it.end), 0)
  return Math.round(((Math.max(0, work - br) / 60) * 100)) / 100
}

export function AddDayEntryDialog({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
  defaultStartDate,
  defaultBreakStart,
  defaultBreakEnd,
  allowedMonthKey,
  onSubmitRange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employees: Employee[]
  defaultEmployeeId?: string
  defaultStartDate?: string // yyyy-mm-dd
  defaultBreakStart?: string
  defaultBreakEnd?: string
  /** The visible Condica month. Manual entries must remain in this document. */
  allowedMonthKey?: TimesheetMonthKey
  onSubmitRange: (params: {
    employeeId: string
    startDate: string
    endDate: string
    project?: string
    entries: Array<{ start: string; end: string; project?: string; methodStart?: string; methodEnd?: string }>
    breaks: Array<{ start: string; end: string }>
    includeConcediu: boolean
    includeEvenimente: boolean
    includeSarbatori: boolean
    includeWeekend: boolean
    hours: number
    monthKey: TimesheetMonthKey
  }) => Promise<void>
}) {
  const sortedEmployees = useMemo(() => {
    const sorted = [...employees].sort((a, b) => {
      const nameA = getEmployeeFullName(a)
      const nameB = getEmployeeFullName(b)
      return nameA.localeCompare(nameB)
    })
    console.log('📋 Sortarea angajaților:', sorted.length, 'angajați găsiți')
    return sorted
  }, [employees])

  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? "")
  const [startDate, setStartDate] = useState(defaultStartDate ?? formatISODate(new Date()))
  const [endDate, setEndDate] = useState(defaultStartDate ?? formatISODate(new Date()))
  const [project, setProject] = useState("")

  const defaultBreak: HMRange | null = useMemo(() => {
    const r = { start: String(defaultBreakStart || "").trim(), end: String(defaultBreakEnd || "").trim() }
    return isValidHMRange(r) ? r : null
  }, [defaultBreakStart, defaultBreakEnd])

  // Auto-selectează primul angajat când se încarcă lista SAU se deschide dialogul
  useEffect(() => {
    if (open && sortedEmployees.length > 0) {
      const targetId = defaultEmployeeId || sortedEmployees[0].id
      console.log('👤 Setez angajatul:', targetId, '(defaultEmployeeId:', defaultEmployeeId, ')')
      setEmployeeId(targetId)
      
      // Setează și datele dacă sunt provide
      if (defaultStartDate) {
        setStartDate(defaultStartDate)
        setEndDate(defaultStartDate)
      }

      // Apply default break when opening, but only if user hasn't already set a break.
      setBreaks((prev) => {
        const hasAny = prev.some((b) => String(b.start || "").trim() && String(b.end || "").trim())
        if (hasAny) return prev
        return defaultBreak ? [{ start: defaultBreak.start, end: defaultBreak.end }] : prev
      })
    }
  }, [open, sortedEmployees, defaultEmployeeId, defaultStartDate, defaultBreak])

  const [entries, setEntries] = useState<Array<{ start: string; end: string; travelToClient?: boolean }>>([
    { start: "08:00", end: "16:00", travelToClient: false },
  ])
  const [breaks, setBreaks] = useState<Array<{ start: string; end: string }>>([{ start: "12:00", end: "12:30" }])

  const [includeConcediu, setIncludeConcediu] = useState(false)
  const [includeEvenimente, setIncludeEvenimente] = useState(false)
  const [includeSarbatori, setIncludeSarbatori] = useState(false)
  const [includeWeekend, setIncludeWeekend] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const hours = useMemo(() => {
    return (
      Math.round(
        (calcEffectiveMinutes({
          entries: entries as any,
          breaks: breaks as any,
          defaultBreak,
        }) /
          60) *
          100,
      ) / 100
    )
  }, [entries, breaks, defaultBreak])

  const monthKey = useMemo(() => parseMonthKeyFromDate(startDate), [startDate])

  const reset = () => {
    setProject("")
    setEntries([{ start: "08:00", end: "16:00", travelToClient: false }])
    setBreaks(defaultBreak ? [{ start: defaultBreak.start, end: defaultBreak.end }] : [{ start: "12:00", end: "12:30" }])
    setIncludeConcediu(false)
    setIncludeEvenimente(false)
    setIncludeSarbatori(false)
    setIncludeWeekend(false)
  }

  const submit = async () => {
    setError(null)
    if (submitting) return
    console.log('🔍 Submit apăsat - verificare validări:', {
      employeeId: employeeId || '❌ LIPSĂ',
      startDate: startDate || '❌ LIPSĂ',
      endDate: endDate || '❌ LIPSĂ',
      monthKey: monthKey || '❌ LIPSĂ',
      entries,
      hasValidEntries: entries.some(e => e.start && e.end),
      employeesCount: employees.length,
      sortedEmployeesCount: sortedEmployees.length
    })
    
    if (!employeeId) {
      setError("Selectează un angajat.")
      return
    }
    if (!startDate) {
      setError("Selectează data de început.")
      return
    }
    if (!endDate) {
      setError("Selectează data de oprire.")
      return
    }
    if (!monthKey) {
      setError("Data de început este invalidă.")
      return
    }
    const endMonthKey = parseMonthKeyFromDate(endDate)
    if (!endMonthKey || endMonthKey !== monthKey) {
      setError("Intervalul selectat trebuie să fie în aceeași lună.")
      return
    }
    if (allowedMonthKey && monthKey !== allowedMonthKey) {
      setError("Alege o dată în luna afișată în condică.")
      return
    }
    if (endDate < startDate) {
      setError("Data de oprire trebuie să fie după data de început.")
      return
    }
    
    const payloadEntries = entries
      .filter((e) => e.start && e.end)
      .map((e) => ({
        start: e.start,
        end: e.end,
        travelToClient: e.travelToClient ? true : undefined,
        project: project || undefined,
        methodStart: "Introdus manual de către manager",
        methodEnd: "Introdus manual de către manager",
      }))
    const payloadBreaks = breaks.filter((b) => b.start && b.end)

    // Validate intervals (avoid 07:03–07:03 or reversed end < start)
    const invalidEntryIdx = payloadEntries.findIndex((e) => diffMinutes(e.start, e.end) <= 0)
    if (invalidEntryIdx !== -1) {
      setError(`Interval invalid la poziția #${invalidEntryIdx + 1}. Ora de sfârșit trebuie să fie după ora de început.`)
      return
    }
    const invalidBreakIdx = payloadBreaks.findIndex((b) => diffMinutes(b.start, b.end) <= 0)
    if (invalidBreakIdx !== -1) {
      setError(`Pauză invalidă la poziția #${invalidBreakIdx + 1}. Ora de sfârșit trebuie să fie după ora de început.`)
      return
    }
    
    if (payloadEntries.length === 0) {
      console.warn('⚠️ Atenție: Nu ai completat ore de lucru (entries)!')
    }
    
    console.log('✅ Validare OK - trimit la Firebase:', {
      employeeId,
      startDate,
      endDate,
      payloadEntries,
      payloadBreaks,
      hours
    })
    
    try {
      setSubmitting(true)
      await onSubmitRange({
        employeeId,
        startDate,
        endDate,
        project: project || undefined,
        entries: payloadEntries,
        breaks: payloadBreaks,
        includeConcediu,
        includeEvenimente,
        includeSarbatori,
        includeWeekend,
        hours,
        monthKey,
      })
      console.log('✅ Salvat cu succes în Firebase!')
      reset()
      onOpenChange(false)
    } catch (error) {
      console.error('❌ Eroare la salvare:', error)
      setError(error instanceof Error ? error.message : "Nu am putut salva condica. Încearcă din nou.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[calc(100vw-24px)] sm:w-[min(50vw,900px)] max-h-[85vh] overflow-y-auto bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Adaugă condică</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label className="text-gray-700 font-medium">Angajați pentru care adaugi condică</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                <SelectValue placeholder="Alege angajat" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {sortedEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="focus:bg-gray-100">
                    {getEmployeeFullName(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-gray-700 font-medium">Data de început</Label>
              <DateInput value={startDate} onChange={setStartDate} testId="condica-add-start-date" />
            </div>
            <div className="grid gap-2">
              <Label className="text-gray-700 font-medium">Data de oprire</Label>
              <DateInput value={endDate} onChange={setEndDate} testId="condica-add-end-date" />
            </div>
          </div>

     

          <div className="grid gap-2">
            <Label className="text-gray-700 font-medium">Timp înregistrat</Label>
            <div className="space-y-2">
              {entries.map((e, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-3 bg-white">
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <TimeInput24
                      id={`entry-start-${idx}`}
                      label="Început"
                      value={e.start}
                      onChange={(v) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, start: v } : x)))}
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <TimeInput24
                          id={`entry-end-${idx}`}
                          label="Sfârșit"
                          value={e.end}
                          onChange={(v) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, end: v } : x)))}
                        />
                      </div>
                      <div className="pt-6">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Șterge interval"
                          disabled={entries.length === 1}
                          className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(e.travelToClient)}
                      onCheckedChange={(v) =>
                        setEntries((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, travelToClient: Boolean(v) } : x)),
                        )
                      }
                      className="border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <span className="text-sm text-gray-700">Traseu la client</span>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() => setEntries((prev) => [...prev, { start: "08:00", end: "16:00", travelToClient: false }])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adaugă interval de lucru
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-gray-700 font-medium">Pauză înregistrată</Label>
            <div className="space-y-2">
              {breaks.map((b, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 items-end">
                  <TimeInput24
                    id={`break-start-${idx}`}
                    label="Început pauză"
                    value={b.start}
                    onChange={(v) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, start: v } : x)))}
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <TimeInput24
                        id={`break-end-${idx}`}
                        label="Sfârșit pauză"
                        value={b.end}
                        onChange={(v) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, end: v } : x)))}
                      />
                    </div>
                    <div className="pt-6">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBreaks((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Șterge pauză"
                      disabled={breaks.length === 1}
                      className="text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setBreaks((prev) => [...prev, { start: "12:00", end: "12:30" }])}>
                <Plus className="h-4 w-4 mr-2" />
                Adaugă pauză
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={includeConcediu} onCheckedChange={(v) => setIncludeConcediu(Boolean(v))} className="border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
              <span className="text-sm text-gray-700">Adaugă intrare în zilele cu concediu</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeEvenimente} onCheckedChange={(v) => setIncludeEvenimente(Boolean(v))} className="border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
              <span className="text-sm text-gray-700">Adaugă intrare în zilele cu evenimente</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeSarbatori} onCheckedChange={(v) => setIncludeSarbatori(Boolean(v))} className="border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
              <span className="text-sm text-gray-700">Adaugă intrare în zilele libere legale</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeWeekend} onCheckedChange={(v) => setIncludeWeekend(Boolean(v))} className="border-gray-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" />
              <span className="text-sm text-gray-700">Adaugă intrare în zilele de weekend</span>
            </div>
          </div>

          <div className="text-sm text-gray-600">Total timp (calculat): {hours.toFixed(2)} ore</div>
          {error ? <div role="alert" className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Închide
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {submitting ? "Se salvează..." : "Adaugă condică"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

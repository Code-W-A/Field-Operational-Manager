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

function parseMonthKeyFromDate(dateStr: string): TimesheetMonthKey | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
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
  onSubmitRange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  employees: Employee[]
  defaultEmployeeId?: string
  defaultStartDate?: string // yyyy-mm-dd
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
  const [startDate, setStartDate] = useState(defaultStartDate ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(defaultStartDate ?? new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState("")

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
    }
  }, [open, sortedEmployees, defaultEmployeeId, defaultStartDate])

  const [entries, setEntries] = useState<Array<{ start: string; end: string }>>([{ start: "08:00", end: "16:00" }])
  const [breaks, setBreaks] = useState<Array<{ start: string; end: string }>>([{ start: "12:00", end: "12:30" }])

  const [includeConcediu, setIncludeConcediu] = useState(false)
  const [includeEvenimente, setIncludeEvenimente] = useState(false)
  const [includeSarbatori, setIncludeSarbatori] = useState(false)
  const [includeWeekend, setIncludeWeekend] = useState(false)

  const hours = useMemo(() => calcHours(entries, breaks), [entries, breaks])

  const monthKey = useMemo(() => parseMonthKeyFromDate(startDate), [startDate])

  const reset = () => {
    setProject("")
    setEntries([{ start: "08:00", end: "16:00" }])
    setBreaks([{ start: "12:00", end: "12:30" }])
    setIncludeConcediu(false)
    setIncludeEvenimente(false)
    setIncludeSarbatori(false)
    setIncludeWeekend(false)
  }

  const submit = async () => {
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
      console.error('❌ Lipsește employeeId - verifică dacă ai angajați în listă!')
      alert('Nu ai selectat un angajat! Verifică dacă există angajați în listă.')
      return
    }
    if (!startDate) {
      console.error('❌ Lipsește startDate')
      alert('Selectează data de început!')
      return
    }
    if (!endDate) {
      console.error('❌ Lipsește endDate')
      alert('Selectează data de sfârșit!')
      return
    }
    if (!monthKey) {
      console.error('❌ monthKey nu s-a putut calcula din startDate:', startDate)
      alert('Data de început este invalidă!')
      return
    }
    
    const payloadEntries = entries
      .filter((e) => e.start && e.end)
      .map((e) => ({ ...e, project: project || undefined, methodStart: "Introdus manual de către manager", methodEnd: "Introdus manual de către manager" }))
    const payloadBreaks = breaks.filter((b) => b.start && b.end)
    
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
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white border-gray-300 text-gray-900" />
            </div>
            <div className="grid gap-2">
              <Label className="text-gray-700 font-medium">Data de oprire</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white border-gray-300 text-gray-900" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-gray-700 font-medium">Proiect (opțional)</Label>
            <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Alege proiect" className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400" />
          </div>

          <div className="grid gap-2">
            <Label className="text-gray-700 font-medium">Timp înregistrat</Label>
            <div className="space-y-2">
              {entries.map((e, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 items-end">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`entry-start-${idx}`} className="text-xs text-gray-600">Început</Label>
                  <Input
                      id={`entry-start-${idx}`}
                      type="time"
                    value={e.start}
                    onChange={(ev) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))}
                      className="h-10 bg-white border-gray-300 text-gray-900"
                  />
                  </div>
                  <div className="flex gap-2">
                    <div className="grid gap-1.5 flex-1">
                      <Label htmlFor={`entry-end-${idx}`} className="text-xs text-gray-600">Sfârșit</Label>
                    <Input
                        id={`entry-end-${idx}`}
                        type="time"
                      value={e.end}
                      onChange={(ev) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))}
                        className="h-10 bg-white border-gray-300 text-gray-900"
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
              ))}
              <Button variant="outline" onClick={() => setEntries((prev) => [...prev, { start: "08:00", end: "16:00" }])}>
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
                  <div className="grid gap-1.5">
                    <Label htmlFor={`break-start-${idx}`} className="text-xs text-gray-600">Început pauză</Label>
                  <Input
                      id={`break-start-${idx}`}
                      type="time"
                    value={b.start}
                    onChange={(ev) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))}
                      className="h-10 bg-white border-gray-300 text-gray-900"
                  />
                  </div>
                  <div className="flex gap-2">
                    <div className="grid gap-1.5 flex-1">
                      <Label htmlFor={`break-end-${idx}`} className="text-xs text-gray-600">Sfârșit pauză</Label>
                    <Input
                        id={`break-end-${idx}`}
                        type="time"
                      value={b.end}
                      onChange={(ev) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))}
                        className="h-10 bg-white border-gray-300 text-gray-900"
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Închide
          </Button>
          <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700 text-white">Adaugă condică</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}



"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2 } from "lucide-react"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"

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
  const sortedEmployees = useMemo(() => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName)), [employees])

  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? (sortedEmployees[0]?.id ?? ""))
  const [startDate, setStartDate] = useState(defaultStartDate ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(defaultStartDate ?? new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState("")

  const [entries, setEntries] = useState<Array<{ start: string; end: string }>>([{ start: "", end: "" }])
  const [breaks, setBreaks] = useState<Array<{ start: string; end: string }>>([{ start: "", end: "" }])

  const [includeConcediu, setIncludeConcediu] = useState(false)
  const [includeEvenimente, setIncludeEvenimente] = useState(false)
  const [includeSarbatori, setIncludeSarbatori] = useState(false)
  const [includeWeekend, setIncludeWeekend] = useState(false)

  const hours = useMemo(() => calcHours(entries, breaks), [entries, breaks])

  const monthKey = useMemo(() => parseMonthKeyFromDate(startDate), [startDate])

  const reset = () => {
    setProject("")
    setEntries([{ start: "", end: "" }])
    setBreaks([{ start: "", end: "" }])
    setIncludeConcediu(false)
    setIncludeEvenimente(false)
    setIncludeSarbatori(false)
    setIncludeWeekend(false)
  }

  const submit = async () => {
    if (!employeeId || !startDate || !endDate || !monthKey) return
    const payloadEntries = entries
      .filter((e) => e.start && e.end)
      .map((e) => ({ ...e, project: project || undefined, methodStart: "Introdus manual de către manager", methodEnd: "Introdus manual de către manager" }))
    const payloadBreaks = breaks.filter((b) => b.start && b.end)
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
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[calc(100vw-24px)] sm:w-[min(50vw,900px)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adaugă condică</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Angajați pentru care adaugi condică</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Alege angajat" />
              </SelectTrigger>
              <SelectContent>
                {sortedEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Data de început</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Data de oprire</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Proiect (opțional)</Label>
            <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Alege proiect" />
          </div>

          <div className="grid gap-2">
            <Label>Timp înregistrat</Label>
            <div className="space-y-2">
              {entries.map((e, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 items-end">
                  <Input
                    value={e.start}
                    onChange={(ev) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))}
                    placeholder="Timp de început (HH:mm)"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={e.end}
                      onChange={(ev) => setEntries((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))}
                      placeholder="Timp de încheiere (HH:mm)"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Șterge interval"
                      disabled={entries.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setEntries((prev) => [...prev, { start: "", end: "" }])}>
                <Plus className="h-4 w-4 mr-2" />
                Adaugă timp
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Pauză înregistrată</Label>
            <div className="space-y-2">
              {breaks.map((b, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-2 items-end">
                  <Input
                    value={b.start}
                    onChange={(ev) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, start: ev.target.value } : x)))}
                    placeholder="Timp de început (HH:mm)"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={b.end}
                      onChange={(ev) => setBreaks((prev) => prev.map((x, i) => (i === idx ? { ...x, end: ev.target.value } : x)))}
                      placeholder="Timp de încheiere (HH:mm)"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBreaks((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Șterge pauză"
                      disabled={breaks.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setBreaks((prev) => [...prev, { start: "", end: "" }])}>
                <Plus className="h-4 w-4 mr-2" />
                Adaugă pauză
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox checked={includeConcediu} onCheckedChange={(v) => setIncludeConcediu(Boolean(v))} />
              <span className="text-sm">Adaugă intrare în zilele cu concediu</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeEvenimente} onCheckedChange={(v) => setIncludeEvenimente(Boolean(v))} />
              <span className="text-sm">Adaugă intrare în zilele cu evenimente</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeSarbatori} onCheckedChange={(v) => setIncludeSarbatori(Boolean(v))} />
              <span className="text-sm">Adaugă intrare în zilele libere legale</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={includeWeekend} onCheckedChange={(v) => setIncludeWeekend(Boolean(v))} />
              <span className="text-sm">Adaugă intrare în zilele de weekend</span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">Total timp (calculat): {hours.toFixed(2)} ore</div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Închide
          </Button>
          <Button onClick={submit}>Adaugă condică</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}



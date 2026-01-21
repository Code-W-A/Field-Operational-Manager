"use client"

import { useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, Pencil, X, Clock, MapPin, Briefcase, Calendar, Copy } from "lucide-react"
import type { TimesheetCell } from "@/lib/hr/types"
import { toast } from "@/hooks/use-toast"

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function findOverlapPair(entries: Array<{ start: string; end: string }>) {
  const ranges = entries
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en, label: `${e.start}–${e.end}` }
    })
    .filter(Boolean) as Array<{ start: number; end: number; label: string }>
  if (ranges.length <= 1) return null
  ranges.sort((a, b) => (a.start - b.start) || (a.end - b.end))
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      return { a: ranges[i - 1].label, b: ranges[i].label }
    }
  }
  return null
}

function isValidInterval(it: { start: string; end: string }) {
  const s = parseHM(it.start)
  const en = parseHM(it.end)
  return s != null && en != null && s < en
}

function sortEntries<T extends { start: string; end: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const sa = parseHM(a.start) ?? 0
    const sb = parseHM(b.start) ?? 0
    const ea = parseHM(a.end) ?? 0
    const eb = parseHM(b.end) ?? 0
    return (sa - sb) || (ea - eb)
  })
}

function minutesToHM(total: number) {
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function calcMinutes(cell: TimesheetCell | undefined) {
  const entries = cell?.entries ?? []
  const breaks = cell?.breaks ?? []
  let work = 0
  for (const e of entries) {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null) continue
    work += Math.max(0, en - s)
  }
  let br = 0
  for (const b of breaks) {
    const s = parseHM(b.start)
    const en = parseHM(b.end)
    if (s == null || en == null) continue
    br += Math.max(0, en - s)
  }
  return Math.max(0, work - br)
}

export function DayEntryPopover({
  open,
  onOpenChange,
  title,
  subtitle,
  cell,
  activeSessionStart,
  anchorRect,
  approvedRequestLabel,
  onOpenEditApprovedRequest,
  onOpenAddDialog,
  onOpenDeleteDialog,
  onSaveCell,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle: string
  cell: TimesheetCell | undefined
  activeSessionStart?: string | null
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null
  approvedRequestLabel?: string | null
  onOpenEditApprovedRequest?: (() => void) | null
  onOpenAddDialog: () => void
  onOpenDeleteDialog: () => void
  onSaveCell: (next: TimesheetCell) => Promise<void>
}) {
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"
  const [verificariOpen, setVerificariOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const minutes = useMemo(() => calcMinutes(cell), [cell])

  const entries = cell?.entries ?? []

  const startEdit = (idx: number) => {
    const e = entries[idx]
    setEditingIdx(idx)
    setStart(e?.start ?? "")
    setEnd(e?.end ?? "")
    setEditDialogOpen(true)
  }

  const resetEdit = () => {
    setEditingIdx(null)
    setStart("")
    setEnd("")
    setEditDialogOpen(false)
  }

  const saveEdit = async () => {
    // Validate the current edited interval (avoid 07:03–07:03 or 07:04–06:37)
    if (!isValidInterval({ start, end })) {
      toast({
        title: "Interval invalid",
        description: "Ora de sfârșit trebuie să fie după ora de început.",
        variant: "destructive",
      })
      return
    }

    const nextEntries = [...entries]
    const item = { start, end }
    if (editingIdx === null) nextEntries.push(item as any)
    else nextEntries[editingIdx] = { ...(nextEntries[editingIdx] as any), ...item }

    // If there are already invalid entries, block save so we don't keep corrupt data.
    const invalidIdx = nextEntries.findIndex((e) => !isValidInterval(e))
    if (invalidIdx !== -1) {
      toast({
        title: "Există intervale invalide",
        description: `Intervalul #${invalidIdx + 1} este invalid. Corectează-l sau folosește „Curăță intervale”.`,
        variant: "destructive",
      })
      return
    }

    const sortedEntries = sortEntries(nextEntries)
    const overlap = findOverlapPair(nextEntries)
    if (overlap) {
      toast({
        title: "Intervale suprapuse",
        description: `Conflict între ${overlap.a} și ${overlap.b}.`,
        variant: "destructive",
      })
      return
    }

    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      code: (cell?.code ?? "WORK") === "EMPTY" ? "WORK" : (cell?.code ?? "WORK"),
      entries: sortedEntries,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: sortedEntries }) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    resetEdit()
  }

  const cleanIntervals = async () => {
    const current = entries
    if (!current.length) return
    const cleaned = sortEntries(current.filter((e) => isValidInterval(e)))
    const removed = current.length - cleaned.length
    if (removed === 0 && cleaned.every((e, i) => e === current[i])) {
      toast({ title: "Nimic de curățat", description: "Intervalele sunt deja valide." })
      return
    }
    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      code: (cell?.code ?? "WORK") === "EMPTY" ? "WORK" : (cell?.code ?? "WORK"),
      entries: cleaned as any,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: cleaned as any }) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    toast({
      title: "Intervale curățate",
      description: removed > 0 ? `Am eliminat ${removed} interval(e) invalid(e).` : "Am ordonat intervalele.",
    })
  }

  const deleteEntry = async (idx: number) => {
    const nextEntries = entries.filter((_, i) => i !== idx)
    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      entries: nextEntries,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: nextEntries }) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    if (editingIdx === idx) resetEdit()
  }

  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null)
  if (anchorRect) {
    virtualRef.current = {
      getBoundingClientRect: () =>
        new DOMRect(anchorRect.left, anchorRect.top, anchorRect.width, anchorRect.height),
    }
  } else {
    virtualRef.current = null
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        {virtualRef.current ? <PopoverAnchor virtualRef={virtualRef as any} /> : null}
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-[400px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-24px)] p-0 overflow-auto border shadow-xl bg-white"
        >
          <div className="rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-start justify-between">
              <div>
                <div className="text-xs text-gray-600">{subtitle}</div>
                <div className="text-base font-semibold text-gray-900">{title}</div>
              </div>
              <div className="flex items-center gap-2">
                {debugEnabled && (
                  <Button
                    variant="secondary"
                    size="icon"
                    title="Copiază JSON (debug)"
                    className="h-8 w-8 [&_svg]:size-4"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(cell ?? null, null, 2))
                        console.log("[CONDICA] cell json copied")
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 [&_svg]:size-4"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="p-3.5 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-600 font-medium">Detalii</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVerificariOpen(true)}
                    className="h-8 text-xs"
                  >
                    Verificări pontaj
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={onOpenAddDialog}
                    title="Adaugă timp"
                    className="h-8 w-8 [&_svg]:size-4"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={onOpenDeleteDialog}
                    title="Șterge pontajul"
                    className="h-8 w-8 [&_svg]:size-4"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {approvedRequestLabel ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-900">Cerere aprobată</div>
                      <div className="text-xs text-amber-900/90 mt-0.5 break-words">{approvedRequestLabel}</div>
                    </div>
                    {onOpenEditApprovedRequest ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-amber-300 bg-white hover:bg-amber-100"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onOpenEditApprovedRequest()
                        }}
                        title="Editează cererea aprobată"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Editează
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-600">Total timp</div>
                    <div className="text-xl font-semibold text-gray-900">{minutesToHM(minutes)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Pauză înregistrată</div>
                    <div className="text-xs text-gray-700">—</div>
                  </div>
                </div>

                <Separator className="my-3 bg-gray-200" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">Timp înregistrat</div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={cleanIntervals} className="h-7 text-xs">
                        Curăță intervale
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingIdx(null)
                          setStart("08:00")
                          setEnd("16:00")
                          setEditDialogOpen(true)
                        }}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Adaugă interval
                      </Button>
                    </div>
                  </div>

                  {entries.length === 0 && activeSessionStart ? (
                    <div className="space-y-2">
                      <div className="rounded-lg bg-emerald-50 border-2 border-emerald-200 px-3 py-2">
                        <div className="text-xs text-emerald-700 font-medium">În lucru</div>
                        <div className="mt-1 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-emerald-600" />
                          <div className="font-mono text-sm font-bold text-emerald-900">
                            {activeSessionStart}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : entries.length === 0 ? (
                    <div className="text-center py-4 px-3 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300">
                      <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <div className="text-xs text-gray-600 font-medium">Nu există intervale înregistrate</div>
                      <div className="text-xs text-gray-500 mt-1">Apasă "Adaugă interval" pentru a începe</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {entries.map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 px-3 py-2 hover:border-blue-400 transition-all">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-600" />
                            <div className="font-mono text-sm font-bold text-gray-900">
                              {e.start} – {e.end}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(idx)}
                              title="Editează intervalul"
                              className="h-8 w-8 hover:bg-blue-100 text-blue-700 hover:text-blue-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteEntry(idx)}
                              title="Șterge intervalul"
                              className="h-8 w-8 hover:bg-red-100 text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <VerificariDialog
        open={verificariOpen}
        onOpenChange={setVerificariOpen}
        subtitle={subtitle}
        title={title}
        cell={cell}
        minutes={minutes}
        entries={entries}
      />
      <EditIntervalDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingIdx={editingIdx}
        start={start}
        end={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        onSave={saveEdit}
        onCancel={resetEdit}
      />
    </>
  )
}

function EditIntervalDialog({
  open,
  onOpenChange,
  editingIdx,
  start,
  end,
  onStartChange,
  onEndChange,
  onSave,
  onCancel,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingIdx: number | null
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Clock className="h-5 w-5 text-blue-600" />
            {editingIdx === null ? "Adaugă interval de lucru" : `Editează interval #${editingIdx + 1}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
            Setează ora de început și ora de încheiere pentru acest interval de lucru.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-sm text-gray-700 font-semibold flex items-center gap-1">
                <span className="text-green-600">▶</span> Început
              </Label>
              <Input
                type="time"
                value={start}
                onChange={(e) => onStartChange(e.target.value)}
                className="bg-white border-gray-300 text-gray-900 text-lg font-mono h-12"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm text-gray-700 font-semibold flex items-center gap-1">
                <span className="text-red-600">■</span> Sfârșit
              </Label>
              <Input
                type="time"
                value={end}
                onChange={(e) => onEndChange(e.target.value)}
                className="bg-white border-gray-300 text-gray-900 text-lg font-mono h-12"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} size="sm">
              Anulează
            </Button>
            <Button onClick={onSave} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Clock className="h-4 w-4 mr-1" />
              Salvează
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VerificariDialog({
  open,
  onOpenChange,
  subtitle,
  title,
  cell,
  minutes,
  entries,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  subtitle: string
  title: string
  cell: TimesheetCell | undefined
  minutes: number
  entries: Array<{ start: string; end: string; methodStart?: string; methodEnd?: string; project?: string }>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Verificări pontaj</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-gray-600" />
              <div className="text-xs font-semibold text-gray-900">Informații generale</div>
            </div>
            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Data</span>
                <span className="text-xs font-medium text-gray-900">{subtitle}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Angajat</span>
                <span className="text-xs font-medium text-gray-900">{title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Status</span>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    cell?.code === "WORK"
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : cell?.code === "CO"
                        ? "bg-yellow-100 text-yellow-900 border border-yellow-300"
                        : cell?.code === "CFP"
                          ? "bg-orange-100 text-orange-700 border border-orange-200"
                          : cell?.code === "CM"
                            ? "bg-rose-100 text-rose-900 border border-rose-300"
                            : cell?.code === "DEL"
                              ? "bg-violet-100 text-violet-700 border border-violet-200"
                              : cell?.code === "IN"
                                ? "bg-gray-100 text-gray-700 border border-gray-200"
                                : cell?.code === "SL"
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                  : cell?.code === "WE"
                                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                    : "bg-gray-100 text-gray-600 border border-gray-200"
                  }`}
                >
                  {cell?.code === "WORK"
                    ? "Lucrat"
                    : cell?.code === "CO"
                      ? "Concediu"
                      : cell?.code === "CFP"
                        ? "Concediu fără plată"
                        : cell?.code === "CM"
                          ? "Concediu medical"
                          : cell?.code === "DEL"
                            ? "Delegație"
                            : cell?.code === "IN"
                              ? "Învoire"
                              : cell?.code === "SL"
                                ? "Sărbătoare legală"
                                : cell?.code === "WE"
                                  ? "Weekend"
                                  : "Necompletat"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Total ore</span>
                <span className="text-xs font-semibold text-gray-900">{minutesToHM(minutes)}</span>
              </div>
            </div>
          </div>

          {entries.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-gray-600" />
                <div className="text-xs font-semibold text-gray-900">Intrări timp înregistrat</div>
              </div>
              <div className="space-y-3">
                {entries.map((entry, idx) => (
                  <div key={idx} className="rounded-md border border-gray-200 bg-white p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Interval #{idx + 1}</span>
                      <span className="font-mono text-xs font-semibold text-gray-900">
                        {entry.start} – {entry.end}
                      </span>
                    </div>

                    {entry.methodStart && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Metodă început</div>
                          <div className="text-xs text-gray-900">{entry.methodStart}</div>
                        </div>
                      </div>
                    )}

                    {entry.methodEnd && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Metodă încheiere</div>
                          <div className="text-xs text-gray-900">{entry.methodEnd}</div>
                        </div>
                      </div>
                    )}

                    {entry.project && (
                      <div className="flex items-start gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Proiect / Client</div>
                          <div className="text-xs text-gray-900">{entry.project}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-center py-6">
                <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <div className="text-xs text-gray-600">Nu există intrări de timp înregistrate</div>
                <div className="text-[11px] text-gray-500 mt-1">Folosește butonul + pentru a adăuga</div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}



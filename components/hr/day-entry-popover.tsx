"use client"

import { useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, Pencil, X, Clock, MapPin, Briefcase, Calendar } from "lucide-react"
import type { TimesheetCell } from "@/lib/hr/types"

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
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
  anchorRect,
  onOpenAddDialog,
  onOpenDeleteDialog,
  onSaveCell,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle: string
  cell: TimesheetCell | undefined
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null
  onOpenAddDialog: () => void
  onOpenDeleteDialog: () => void
  onSaveCell: (next: TimesheetCell) => Promise<void>
}) {
  const [tab, setTab] = useState<"detalii" | "verificari">("detalii")
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const minutes = useMemo(() => calcMinutes(cell), [cell])

  const entries = cell?.entries ?? []

  const startEdit = (idx: number) => {
    const e = entries[idx]
    setEditingIdx(idx)
    setStart(e?.start ?? "")
    setEnd(e?.end ?? "")
    setEditorOpen(true)
  }

  const resetEdit = () => {
    setEditingIdx(null)
    setStart("")
    setEnd("")
    setEditorOpen(false)
  }

  const saveEdit = async () => {
    const nextEntries = [...entries]
    const item = { start, end }
    if (editingIdx === null) nextEntries.push(item as any)
    else nextEntries[editingIdx] = { ...(nextEntries[editingIdx] as any), ...item }

    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      code: (cell?.code ?? "WORK") === "EMPTY" ? "WORK" : (cell?.code ?? "WORK"),
      entries: nextEntries,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: nextEntries }) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    resetEdit()
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
    <Popover open={open} onOpenChange={onOpenChange}>
      {virtualRef.current ? <PopoverAnchor virtualRef={virtualRef as any} /> : null}
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[480px] max-w-[calc(100vw-16px)] p-0 overflow-hidden border-0 shadow-2xl bg-transparent"
      >
        <div className="rounded-xl overflow-hidden">
          <div className="bg-slate-900 text-slate-50 px-5 py-4 flex items-start justify-between">
            <div>
              <div className="text-sm text-slate-200">{subtitle}</div>
              <div className="text-lg font-semibold">{title}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-50 hover:bg-slate-800 h-9 w-9 [&_svg]:size-5"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="p-5 bg-slate-950 text-slate-50">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
              <div className="flex items-center justify-between gap-3">
                <TabsList className="grid w-full grid-cols-2 bg-slate-800/60 h-9 p-1">
                  <TabsTrigger value="detalii">Detalii</TabsTrigger>
                  <TabsTrigger value="verificari">Verificări pontaj</TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={onOpenAddDialog}
                    title="Adaugă timp"
                    className="h-9 w-9 [&_svg]:size-5"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={onOpenDeleteDialog}
                    title="Șterge pontajul"
                    className="h-9 w-9 [&_svg]:size-5"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <TabsContent value="detalii">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-slate-300">Total timp</div>
                  <div className="text-2xl font-semibold">{minutesToHM(minutes)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-300">Pauză înregistrată</div>
                  <div className="text-sm text-slate-200">—</div>
                </div>
              </div>

              <Separator className="my-4 bg-slate-800" />

              <div className="space-y-2">
                <div className="text-sm font-medium">Timp înregistrat</div>

                {entries.length === 0 ? (
                  <div className="text-sm text-slate-300">Nu există intervale încă. Apasă + pentru a adăuga.</div>
                ) : (
                  <div className="space-y-2">
                    {entries.map((e, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2">
                        <div className="font-mono text-sm">
                          {e.start} – {e.end}
                        </div>
                        <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="icon"
                                onClick={() => startEdit(idx)}
                                title="Editează"
                                className="h-9 w-9 [&_svg]:size-4"
                              >
                            <Pencil className="h-4 w-4" />
                          </Button>
                              <Button
                                variant="destructive"
                                size="icon"
                                onClick={() => deleteEntry(idx)}
                                title="Șterge"
                                className="h-9 w-9 [&_svg]:size-4"
                              >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                    {editorOpen ? (
                      <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 mt-3">
                        <div className="text-sm font-medium mb-2">{editingIdx === null ? "Adaugă interval" : "Editează interval"}</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="grid gap-1">
                            <Label className="text-slate-200">Timp de început</Label>
                            <Input 
                              type="time" 
                              value={start} 
                              onChange={(e) => setStart(e.target.value)} 
                              className="bg-slate-950 border-slate-800" 
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-slate-200">Timp de încheiere</Label>
                            <Input 
                              type="time" 
                              value={end} 
                              onChange={(e) => setEnd(e.target.value)} 
                              className="bg-slate-950 border-slate-800" 
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-3">
                          <Button variant="secondary" onClick={resetEdit}>
                            Închide
                          </Button>
                          <Button onClick={saveEdit}>Salvează</Button>
                        </div>
                      </div>
                    ) : null}
              </div>
                </TabsContent>

                <TabsContent value="verificari">
              <div className="space-y-3">
                {/* Status pontaj și date generale */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <div className="text-sm font-semibold">Informații generale</div>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Data</span>
                      <span className="text-sm font-medium">{subtitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Angajat</span>
                      <span className="text-sm font-medium">{title}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Status</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        cell?.code === "WORK" ? "bg-emerald-900/40 text-emerald-300" :
                        cell?.code === "CO" ? "bg-amber-900/40 text-amber-300" :
                        cell?.code === "CFP" ? "bg-orange-900/40 text-orange-300" :
                        cell?.code === "CM" ? "bg-teal-900/40 text-teal-300" :
                        cell?.code === "DEL" ? "bg-violet-900/40 text-violet-300" :
                        cell?.code === "IN" ? "bg-slate-800/40 text-slate-300" :
                        cell?.code === "SL" ? "bg-blue-900/40 text-blue-300" :
                        cell?.code === "WE" ? "bg-pink-900/40 text-pink-300" :
                        "bg-slate-800/40 text-slate-400"
                      }`}>
                        {cell?.code === "WORK" ? "Lucrat" :
                         cell?.code === "CO" ? "Concediu" :
                         cell?.code === "CFP" ? "Concediu fără plată" :
                         cell?.code === "CM" ? "Concediu medical" :
                         cell?.code === "DEL" ? "Delegație" :
                         cell?.code === "IN" ? "Invoicing" :
                         cell?.code === "SL" ? "Sărbătoare legală" :
                         cell?.code === "WE" ? "Weekend" :
                         "Necompletat"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Total ore</span>
                      <span className="text-sm font-semibold">{minutesToHM(minutes)}</span>
                    </div>
                  </div>
                </div>

                {/* Detalii intrări timp */}
                {entries.length > 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <div className="text-sm font-semibold">Intrări timp înregistrat</div>
                    </div>
                    <div className="space-y-3">
                      {entries.map((entry, idx) => (
                        <div key={idx} className="rounded-md border border-slate-800/60 bg-slate-950/40 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">Interval #{idx + 1}</span>
                            <span className="font-mono text-sm font-semibold">{entry.start} – {entry.end}</span>
                          </div>
                          
                          {entry.methodStart && (
                            <div className="flex items-start gap-2">
                              <MapPin className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs text-slate-400">Metodă început</div>
                                <div className="text-sm text-slate-200">{entry.methodStart}</div>
                              </div>
                            </div>
                          )}
                          
                          {entry.methodEnd && (
                            <div className="flex items-start gap-2">
                              <MapPin className="h-3.5 w-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs text-slate-400">Metodă încheiere</div>
                                <div className="text-sm text-slate-200">{entry.methodEnd}</div>
                              </div>
                            </div>
                          )}
                          
                          {entry.project && (
                            <div className="flex items-start gap-2">
                              <Briefcase className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs text-slate-400">Proiect / Client</div>
                                <div className="text-sm text-slate-200">{entry.project}</div>
                              </div>
                            </div>
                          )}
                          
                          {!entry.methodStart && !entry.methodEnd && !entry.project && (
                            <div className="text-xs text-slate-500 italic">
                              Nu există detalii suplimentare înregistrate
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {entries.length === 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                    <div className="text-center py-6">
                      <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <div className="text-sm text-slate-400">Nu există intrări de timp înregistrate</div>
                      <div className="text-xs text-slate-500 mt-1">Folosește butonul + pentru a adăuga</div>
                    </div>
                  </div>
                )}
              </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}



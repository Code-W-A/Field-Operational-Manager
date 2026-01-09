"use client"

import { useMemo, useRef, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, Pencil, X } from "lucide-react"
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
                            <Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="HH:mm" className="bg-slate-950 border-slate-800" />
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-slate-200">Timp de încheiere</Label>
                            <Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="HH:mm" className="bg-slate-950 border-slate-800" />
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
              <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4">
                <div className="text-sm font-semibold mb-2">Verificări</div>
                <div className="text-sm text-slate-300">
                  Placeholder pentru verificări (ex: metode start/stop, proiect, validări). Îl extindem în următorul pas.
                </div>
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



"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import type { HrHoliday } from "@/lib/hr/types"
import { toast } from "@/hooks/use-toast"
import { formatRomanianDateISO } from "@/lib/utils/date-utils"
import { DatePicker } from "@/components/ui/DatePicker"
import { Trash2, Plus } from "lucide-react"

function normalizeItems(items: HrHoliday[]) {
  return [...items]
    .filter((h) => h?.date && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
    .map((h) => ({ date: h.date, label: h.label?.trim() ? h.label.trim() : undefined }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function LegalHolidaysDialog({
  open,
  onOpenChange,
  year,
  items,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  year: number
  items: HrHoliday[]
  onSave: (items: HrHoliday[]) => Promise<void>
}) {
  const initialItems = useMemo(() => normalizeItems(items), [items])
  const [draftItems, setDraftItems] = useState<HrHoliday[]>(initialItems)
  const [saving, setSaving] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newLabel, setNewLabel] = useState("")

  const minIso = `${year}-01-01`
  const maxIso = `${year}-12-31`

  useEffect(() => {
    if (!open) return
    setDraftItems(initialItems)
    setNewDate("")
    setNewLabel("")
  }, [open, initialItems])

  const addHoliday = () => {
    if (!newDate) {
      toast({ title: "Completează data", description: "Selectează o dată din calendar.", variant: "destructive" })
      return
    }
    if (!newDate.startsWith(`${year}-`)) {
      toast({ title: "An greșit", description: `Data selectată nu este în anul ${year}.`, variant: "destructive" })
      return
    }
    setDraftItems((prev) => {
      const exists = prev.some((h) => h.date === newDate)
      if (exists) {
        toast({ title: "Deja există", description: "Această zi este deja în listă." })
        return prev
      }
      const next = [...prev, { date: newDate, label: newLabel.trim() || undefined }]
      next.sort((a, b) => a.date.localeCompare(b.date))
      return next
    })
    setNewDate("")
    setNewLabel("")
  }

  const save = async () => {
    const parsed = normalizeItems(draftItems).filter((h) => h.date.startsWith(`${year}-`))
    setSaving(true)
    try {
      await onSave(parsed)
      toast({ title: "Sărbători salvate", description: `Am salvat ${parsed.length} zile pentru anul ${year}.` })
      onOpenChange(false)
    } catch (err) {
      console.error("saveHrHolidays failed", err)
      toast({ title: "Eroare", description: "Nu am putut salva sărbătorile. Încearcă din nou.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[calc(100vw-24px)] sm:w-[min(50vw,720px)] max-h-[85vh] overflow-y-auto bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Sărbători legale ({year})</DialogTitle>
          <DialogDescription>
            Adaugă rapid o zi liberă: selectezi data și (opțional) denumirea.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label className="text-gray-700 font-medium">Data</Label>
              <DatePicker
                value={newDate ? new Date(newDate) : null}
                onChange={(val) => {
                  if (!val || val instanceof Date === false) {
                    setNewDate("")
                    return
                  }
                  const iso = val.toISOString().slice(0, 10)
                  setNewDate(iso)
                }}
                minDate={new Date(minIso)}
                maxDate={new Date(maxIso)}
                placeholder="dd MMM yyyy"
                format="dd MMM yyyy"
                locale="ro"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-gray-700 font-medium">Denumire (opțional)</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Anul Nou"
              />
            </div>
            <Button type="button" onClick={addHoliday} disabled={saving}>
              <Plus className="h-4 w-4 mr-2" />
              Adaugă
            </Button>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-medium text-gray-900">Lista ({draftItems.length})</div>
            {draftItems.length === 0 ? (
              <div className="text-sm text-muted-foreground rounded-md border bg-muted/10 px-3 py-2">
                Nu există sărbători definite pentru acest an.
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {draftItems.map((h) => (
                  <div key={h.date} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-[140px] text-sm font-medium">
                      {formatRomanianDateISO(h.date) || h.date}
                    </div>
                    <Input
                      value={h.label ?? ""}
                      onChange={(e) => {
                        const v = e.target.value
                        setDraftItems((prev) =>
                          prev.map((x) => (x.date === h.date ? { ...x, label: v.trim() ? v : undefined } : x))
                        )
                      }}
                      placeholder="Denumire (opțional)"
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Șterge"
                      onClick={() => setDraftItems((prev) => prev.filter((x) => x.date !== h.date))}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Închide
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvez..." : "Salvează"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


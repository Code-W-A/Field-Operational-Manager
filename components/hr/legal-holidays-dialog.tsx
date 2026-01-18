"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { HrHoliday } from "@/lib/hr/types"
import { toast } from "@/hooks/use-toast"
import { format, isValid, parse } from "date-fns"
import { ro } from "date-fns/locale"
import { formatRomanianDateISO } from "@/lib/utils/date-utils"

function formatItems(items: HrHoliday[]) {
  return [...items]
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => {
      const display = formatRomanianDateISO(h.date) || h.date
      return h.label ? `${display} | ${h.label}` : display
    })
    .join("\n")
}

function parseLines(year: number, raw: string): HrHoliday[] | null {
  const lines = raw
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: HrHoliday[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const [left, ...rest] = line.split("|").map((s) => s.trim())
    const dateRaw = left
    const label = rest.join(" | ").trim()

    let isoDate = ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      isoDate = dateRaw
    } else {
      const parsed = parse(dateRaw, "dd MMM yyyy", new Date(), { locale: ro })
      if (isValid(parsed)) {
        isoDate = format(parsed, "yyyy-MM-dd")
      }
    }

    if (!isoDate) {
      toast({ title: "Format invalid", description: `Linie invalidă: "${line}". Folosește "dd MMM yyyy" sau "dd MMM yyyy | Denumire".`, variant: "destructive" })
      return null
    }
    if (!isoDate.startsWith(`${year}-`)) {
      toast({ title: "An greșit", description: `Data "${dateRaw}" nu este în anul ${year}.`, variant: "destructive" })
      return null
    }
    if (seen.has(isoDate)) continue
    seen.add(isoDate)
    out.push({ date: isoDate, label: label || undefined })
  }

  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
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
  const initialText = useMemo(() => formatItems(items), [items])
  const [text, setText] = useState(initialText)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setText(initialText)
  }, [open, initialText])

  const save = async () => {
    const parsed = parseLines(year, text)
    if (!parsed) return
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
            Un rând per zi: <span className="font-mono">dd MMM yyyy</span> sau <span className="font-mono">dd MMM yyyy | Denumire</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label className="text-gray-700 font-medium">Lista de sărbători</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`01 ian ${year} | Anul Nou\n02 ian ${year} | Anul Nou`}
            className="min-h-[220px] font-mono text-sm"
          />
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


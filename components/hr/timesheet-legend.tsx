"use client"

import { Badge } from "@/components/ui/badge"
import type { TimesheetCode } from "@/lib/hr/types"

const ITEMS: Array<{ code: TimesheetCode; label: string; className: string }> = [
  { code: "WORK", label: "Lucru (ore)", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { code: "WE", label: "WE (weekend)", className: "bg-pink-50 text-pink-700 border-pink-200" },
  { code: "CO", label: "CO (concediu)", className: "bg-amber-50 text-amber-800 border-amber-200" },
  { code: "CFP", label: "CFP (concediu fără plată)", className: "bg-orange-50 text-orange-800 border-orange-200" },
  { code: "CM", label: "CM (concediu medical)", className: "bg-teal-50 text-teal-800 border-teal-200" },
  { code: "DEL", label: "DEL (delegație)", className: "bg-violet-50 text-violet-800 border-violet-200" },
  { code: "IN", label: "IN (învoire)", className: "bg-slate-50 text-slate-800 border-slate-200" },
  { code: "SL", label: "SL (sărbătoare legală)", className: "bg-blue-50 text-blue-800 border-blue-200" },
  { code: "EMPTY", label: "Liber", className: "bg-muted text-muted-foreground border-border" },
]

export function TimesheetLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map((i) => (
        <Badge key={i.code} variant="outline" className={i.className}>
          {i.code}: {i.label}
        </Badge>
      ))}
    </div>
  )
}



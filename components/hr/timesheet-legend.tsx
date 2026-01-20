"use client"

import { Badge } from "@/components/ui/badge"
import type { TimesheetCode } from "@/lib/hr/types"

const ITEMS: Array<{ code: TimesheetCode; label: string; className: string }> = [
  { code: "WORK", label: "Lucru (ore)", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { code: "WE", label: "WE (weekend)", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { code: "CO", label: "CO (concediu)", className: "bg-yellow-100 text-yellow-900 border-yellow-300" },
  { code: "CFP", label: "CFP (concediu fără plată)", className: "bg-orange-50 text-orange-800 border-orange-200" },
  { code: "CM", label: "CM (concediu medical)", className: "bg-rose-100 text-rose-900 border-rose-300" },
  { code: "DEL", label: "DEL (delegație)", className: "bg-violet-50 text-violet-800 border-violet-200" },
  { code: "IN", label: "IN (învoire)", className: "bg-slate-50 text-slate-800 border-slate-200" },
  { code: "SL", label: "SL (sărbătoare legală)", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { code: "EMPTY", label: "Liber", className: "bg-muted text-muted-foreground border-border" },
]

export function TimesheetLegend() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {ITEMS.map((i) => (
          <Badge key={i.code} variant="outline" className={i.className}>
            {i.code}: {i.label}
          </Badge>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Zilele cu cereri aprobate sunt evidențiate chiar dacă nu există pontaj.
      </div>
    </div>
  )
}



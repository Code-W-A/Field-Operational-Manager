"use client"

import { Badge } from "@/components/ui/badge"
import type { TimesheetCode } from "@/lib/hr/types"

const ITEMS: Array<{ code: TimesheetCode; label: string; className: string }> = [
  { code: "WORK", label: "Lucru (ore)", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { code: "WE", label: "WE (weekend)", className: "bg-pink-50 text-pink-700 border-pink-200" },
  { code: "CO", label: "CO (concediu)", className: "bg-amber-50 text-amber-800 border-amber-200" },
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



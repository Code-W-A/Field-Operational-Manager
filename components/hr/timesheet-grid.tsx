"use client"

import { cn } from "@/lib/utils"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"
import type React from "react"

function cellClasses(cell: TimesheetCell | undefined) {
  const code = cell?.code ?? "EMPTY"
  if (code === "WORK") return "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
  if (code === "WE") return "bg-pink-50 text-pink-800 hover:bg-pink-100"
  if (code === "CO") return "bg-amber-50 text-amber-900 hover:bg-amber-100"
  if (code === "DEL") return "bg-violet-50 text-violet-900 hover:bg-violet-100"
  if (code === "IN") return "bg-slate-50 text-slate-900 hover:bg-slate-100"
  if (code === "SL") return "bg-blue-50 text-blue-900 hover:bg-blue-100"
  return "bg-background text-muted-foreground hover:bg-muted/30"
}

function cellLabel(cell: TimesheetCell | undefined): React.ReactNode {
  const code = cell?.code ?? "EMPTY"
  const entries = cell?.entries ?? []
  if (entries.length > 0) {
    const first = entries[0]
    const last = entries[entries.length - 1]
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-semibold font-mono">{first?.start ?? ""}</div>
        <div className="text-sm font-semibold font-mono">{last?.end ?? ""}</div>
      </div>
    )
  }
  if (code === "WORK") return <span className="text-sm font-semibold">{String(cell?.hours ?? 8)}</span>
  if (code === "EMPTY") return ""
  return <span className="text-sm font-semibold">{code}</span>
}

export type TimesheetExtraColumn = {
  id: string
  label: React.ReactNode
  widthPx?: number
  render: (employee: Employee) => React.ReactNode
}

export function TimesheetGrid({
  monthKey,
  employees,
  getCell,
  onCellClick,
  extraColumns,
  className,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  getCell: (employeeId: string, day: number) => TimesheetCell | undefined
  onCellClick: (params: { employeeId: string; day: number; anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } }) => void
  extraColumns?: TimesheetExtraColumn[]
  className?: string
}) {
  const dim = daysInMonth(monthKey)
  const cols = extraColumns ?? []
  const dayWidthPx = 100
  const gridTemplateColumns = `260px repeat(${dim}, ${dayWidthPx}px) ${cols.map((c) => `${c.widthPx ?? 110}px`).join(" ")}`

  return (
    <div className={cn("w-full overflow-auto rounded-lg border border-border/60 min-h-[600px] max-h-[70vh]", className)}>
      <div className="min-w-[960px] bg-background">
        {/* Header */}
        <div
          className="grid sticky top-0 z-20 bg-background border-b shadow-sm"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-30 bg-background border-r px-3 py-3 text-sm font-semibold">Salariat</div>
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
            <div key={d} className="flex items-center justify-center px-1 py-3 text-xs font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
          {cols.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-center px-2 py-3 text-xs font-semibold text-foreground border-l bg-muted/20"
            >
              {c.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {employees.map((e) => (
          <div
            key={e.id}
            className="grid border-b last:border-b-0"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-10 bg-background border-r px-3 py-4 min-h-[64px] flex flex-col justify-center">
              <div className="text-sm font-semibold truncate">{e.fullName}</div>
              {e.title && <div className="text-xs text-muted-foreground truncate">{e.title}</div>}
            </div>
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const c = getCell(e.id, d)
              return (
                <button
                  key={d}
                  type="button"
                  className={cn(
                    "h-16 w-full border-l text-xs font-semibold transition-all duration-200 hover:shadow-md hover:z-10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:z-10",
                    cellClasses(c)
                  )}
                  title={`${e.fullName} • ${d}`}
                  onClick={(ev) => {
                    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                    onCellClick({
                      employeeId: e.id,
                      day: d,
                      anchorRect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                    })
                  }}
                >
                  {cellLabel(c)}
                </button>
              )
            })}
            {cols.map((c) => (
              <div key={c.id} className="h-16 w-full border-l px-2 flex items-center justify-center text-xs font-semibold">
                {c.render(e)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}



"use client"

import { cn } from "@/lib/utils"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"

function cellClasses(cell: TimesheetCell | undefined) {
  const code = cell?.code ?? "EMPTY"
  if (code === "WORK") return "bg-emerald-50 text-emerald-800"
  if (code === "WE") return "bg-pink-50 text-pink-800"
  if (code === "CO") return "bg-amber-50 text-amber-900"
  if (code === "SL") return "bg-blue-50 text-blue-900"
  return "bg-background text-muted-foreground"
}

function cellLabel(cell: TimesheetCell | undefined) {
  const code = cell?.code ?? "EMPTY"
  if (code === "WORK") return String(cell?.hours ?? 8)
  if (code === "EMPTY") return ""
  return code
}

export function TimesheetGrid({
  monthKey,
  employees,
  getCell,
  onCellClick,
  className,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  getCell: (employeeId: string, day: number) => TimesheetCell | undefined
  onCellClick: (employeeId: string, day: number) => void
  className?: string
}) {
  const dim = daysInMonth(monthKey)

  return (
    <div className={cn("w-full overflow-auto rounded-lg border", className)}>
      <div className="min-w-[960px]">
        {/* Header */}
        <div
          className="grid sticky top-0 z-20 bg-background border-b"
          style={{ gridTemplateColumns: `260px repeat(${dim}, 44px)` }}
        >
          <div className="sticky left-0 z-30 bg-background border-r px-3 py-2 text-sm font-medium">Salariat</div>
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
            <div key={d} className="flex items-center justify-center px-1 py-2 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Rows */}
        {employees.map((e) => (
          <div
            key={e.id}
            className="grid border-b last:border-b-0"
            style={{ gridTemplateColumns: `260px repeat(${dim}, 44px)` }}
          >
            <div className="sticky left-0 z-10 bg-background border-r px-3 py-2">
              <div className="text-sm font-medium truncate">{e.fullName}</div>
              {e.title && <div className="text-xs text-muted-foreground truncate">{e.title}</div>}
            </div>
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
              const c = getCell(e.id, d)
              return (
                <button
                  key={d}
                  type="button"
                  className={cn(
                    "h-10 w-full border-l text-xs font-semibold transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
                    cellClasses(c)
                  )}
                  title={`${e.fullName} • ${d}`}
                  onClick={() => onCellClick(e.id, d)}
                >
                  {cellLabel(c)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}



"use client"

import { cn } from "@/lib/utils"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getTimesheetCellMinutes, type HMRange } from "@/lib/hr/time-calc"

function weekdayMeta(monthKey: TimesheetMonthKey, day: number) {
  const [yStr, mStr] = monthKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const dt = new Date(y, m - 1, day)
  const dow = dt.getDay() // 0=Sun ... 6=Sat
  const isWeekend = dow === 0 || dow === 6
  const longRo = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"][dow] ?? ""
  return { isWeekend, longRo }
}

function cellClasses(cell: TimesheetCell | undefined) {
  const code = cell?.code ?? "EMPTY"
  if (code === "WORK") return "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
  if (code === "WE") return "bg-sky-50 text-sky-900 hover:bg-sky-100"
  if (code === "CO") return "bg-yellow-100 text-yellow-950 hover:bg-yellow-200"
  if (code === "DEL") return "bg-violet-50 text-violet-900 hover:bg-violet-100"
  if (code === "IN") return "bg-slate-50 text-slate-900 hover:bg-slate-100"
  if (code === "SL") return "bg-sky-50 text-sky-900 hover:bg-sky-100"
  if (code === "CM") return "bg-rose-100 text-rose-950 hover:bg-rose-200"
  return "bg-background text-muted-foreground hover:bg-muted/30"
}

function isLateCell(cell: TimesheetCell | undefined) {
  const entries: any[] = (cell as any)?.entries || []
  if (!Array.isArray(entries) || entries.length === 0) return false
  return entries.some((e: any) => Number(e?.lateStartMinutes || 0) > 0)
}

export function TimesheetListView({
  monthKey,
  employees,
  getCell,
  onCellClick,
  isActiveCell,
  holidayLabelsByDay,
  requestMetaByEmployeeDay,
  getDefaultBreakForEmployee,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  getCell: (employeeId: string, day: number) => TimesheetCell | undefined
  onCellClick: (params: { employeeId: string; day: number; anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } }) => void
  isActiveCell?: (employeeId: string, day: number) => boolean
  holidayLabelsByDay?: Record<number, string | undefined>
  requestMetaByEmployeeDay?: Record<string, Record<number, { kind: string; label: string }>>
  getDefaultBreakForEmployee?: (employeeId: string) => HMRange | null
}) {
  const dim = daysInMonth(monthKey)

  const requestBgClass = (kind: string) => {
    if (kind === "CO") return "bg-yellow-100"
    if (kind === "CFP") return "bg-orange-50"
    if (kind === "CM") return "bg-rose-100"
    if (kind === "DEL") return "bg-violet-50"
    if (kind === "IN") return "bg-slate-50"
    return ""
  }

  const requestRingClass = (kind: string) => {
    if (kind === "CO") return "ring-1 ring-yellow-300"
    if (kind === "CFP") return "ring-1 ring-orange-200"
    if (kind === "CM") return "ring-1 ring-rose-300"
    if (kind === "DEL") return "ring-1 ring-violet-200"
    if (kind === "IN") return "ring-1 ring-slate-200"
    return ""
  }
  
  return (
    <div className="space-y-4">
      {employees.map(emp => {
        // Calculate summary for this employee
        let totalHours = 0
        let workDays = 0
        for (let d = 1; d <= dim; d++) {
          const cell = getCell(emp.id, d)
          if (cell?.code === "WORK") {
            const defaultBreak = getDefaultBreakForEmployee?.(emp.id) ?? null
            totalHours += getTimesheetCellMinutes({ cell, defaultBreak }) / 60
            workDays++
          }
        }
        
        return (
          <Card key={emp.id} className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{getEmployeeFullName(emp)}</CardTitle>
                  {emp.title && <CardDescription>{emp.title}</CardDescription>}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Total ore</div>
                  <div className="text-lg font-bold text-primary">{totalHours}h</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Timeline vizual cu bare colorate */}
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: dim }, (_, i) => i + 1).map(d => {
                  const cell = getCell(emp.id, d)
                  const isActive = isActiveCell?.(emp.id, d)
                  const hasData = cell?.code && cell.code !== "EMPTY"
                  const holidayLabel = holidayLabelsByDay?.[d]
                  const req = requestMetaByEmployeeDay?.[emp.id]?.[d]
                  const { isWeekend, longRo } = weekdayMeta(monthKey, d)
                  const isLate = isLateCell(cell)
                  
                  return (
                    <button
                      key={d}
                      type="button"
                      data-testid={`timesheet-list-cell-${emp.id}-${d}`}
                      className={cn(
                        "relative h-10 flex-1 min-w-[32px] max-w-[48px] rounded text-xs font-semibold transition-all duration-200",
                        cellClasses(cell),
                        req && !hasData ? requestBgClass(req.kind) : "",
                        req && hasData ? requestRingClass(req.kind) : "",
                        // Weekends / legal holidays: full-cell background (only for empty cells)
                        (!hasData && (holidayLabel || isWeekend)) ? "bg-sky-50 text-sky-900 hover:bg-sky-100" : "",
                        isActive && "bg-emerald-200 text-emerald-900 hover:bg-emerald-300",
                        hasData && "ring-1 ring-offset-1 ring-border/40",
                        isLate && "ring-2 ring-red-400 ring-inset"
                      )}
                      onClick={(ev) => {
                        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                        onCellClick({
                          employeeId: emp.id,
                          day: d,
                          anchorRect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                        })
                      }}
                      title={[
                        `${getEmployeeFullName(emp)} • Ziua ${d}`,
                        longRo,
                        req ? `Cerere aprobată: ${req.label}` : "",
                        holidayLabel ? `Sărbătoare: ${holidayLabel}` : "",
                      ].filter(Boolean).join(" • ")}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isActive && !hasData ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" /> : null}
                        {d}
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

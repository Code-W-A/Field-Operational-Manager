"use client"

import { cn } from "@/lib/utils"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

export function TimesheetListView({
  monthKey,
  employees,
  getCell,
  onCellClick,
  isActiveCell,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  getCell: (employeeId: string, day: number) => TimesheetCell | undefined
  onCellClick: (params: { employeeId: string; day: number; anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } }) => void
  isActiveCell?: (employeeId: string, day: number) => boolean
}) {
  const dim = daysInMonth(monthKey)
  
  return (
    <div className="space-y-4">
      {employees.map(emp => {
        // Calculate summary for this employee
        let totalHours = 0
        let workDays = 0
        for (let d = 1; d <= dim; d++) {
          const cell = getCell(emp.id, d)
          if (cell?.code === "WORK") {
            totalHours += Number(cell.hours ?? 8)
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
                  
                  return (
                    <button
                      key={d}
                      type="button"
                      className={cn(
                        "h-10 flex-1 min-w-[32px] max-w-[48px] rounded text-xs font-semibold transition-all duration-200",
                        cellClasses(cell),
                        isActive && "bg-emerald-200 text-emerald-900 hover:bg-emerald-300",
                        hasData && "ring-1 ring-offset-1 ring-border/40"
                      )}
                      onClick={(ev) => {
                        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                        onCellClick({
                          employeeId: emp.id,
                          day: d,
                          anchorRect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                        })
                      }}
                      title={`${getEmployeeFullName(emp)} • Ziua ${d}`}
                    >
                      {d}
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


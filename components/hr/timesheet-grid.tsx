"use client"

import { cn } from "@/lib/utils"
import type { Employee, TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"
import type React from "react"
import { useState, useEffect } from "react"
import { calcEffectiveMinutes, type HMRange } from "@/lib/hr/time-calc"

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

function weekdayMeta(monthKey: TimesheetMonthKey, day: number) {
  const [yStr, mStr] = monthKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const dt = new Date(y, m - 1, day)
  const dow = dt.getDay() // 0=Sun ... 6=Sat
  const isWeekend = dow === 0 || dow === 6
  const shortRo = ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sa"][dow] ?? ""
  const longRo = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"][dow] ?? ""
  return { isWeekend, shortRo, longRo }
}

function isLateCell(cell: TimesheetCell | undefined) {
  const entries: any[] = (cell as any)?.entries || []
  if (!Array.isArray(entries) || entries.length === 0) return false
  return entries.some((e: any) => Number(e?.lateStartMinutes || 0) > 0)
}

function cellLabel(
  cell: TimesheetCell | undefined,
  compact: boolean = false,
  defaultBreak: HMRange | null = null
): React.ReactNode {
  const code = cell?.code ?? "EMPTY"
  const entries = cell?.entries ?? []
  
  if (compact) {
    // Compact mode: show only code letters
    if (code === "WORK") return <span className="text-xs font-bold">W</span>
    if (code === "EMPTY") return ""
    return <span className="text-xs font-bold">{code}</span>
  }
  
  // Normal mode: show total time as HH:mm
  const shouldShowTime = code === "WORK" || code === "DEL" || code === "WE" || code === "SL"
  if (shouldShowTime) {
    const computedMinutes =
      entries.length > 0
        ? calcEffectiveMinutes({
            entries: entries as any,
            breaks: (cell?.breaks ?? null) as any,
            defaultBreak,
          })
        : null
    const totalMinutes = computedMinutes != null ? computedMinutes : Math.round(Number(cell?.hours ?? 0) * 60)
    const hh = Math.floor(totalMinutes / 60)
    const mm = totalMinutes % 60
    const hasTime = totalMinutes > 0 || entries.length > 0
    if (hasTime) {
      return (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-semibold font-mono">
            {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
          </span>
          {code !== "WORK" ? (
            <span className="text-[10px] font-bold opacity-80">{code}</span>
          ) : null}
        </div>
      )
    }
  }
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
  isActiveCell,
  extraColumns,
  holidayLabelsByDay,
  requestMetaByEmployeeDay,
  className,
  compact = false,
  getDefaultBreakForEmployee,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  getCell: (employeeId: string, day: number) => TimesheetCell | undefined
  onCellClick: (params: { employeeId: string; day: number; anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } }) => void
  isActiveCell?: (employeeId: string, day: number) => boolean
  extraColumns?: TimesheetExtraColumn[]
  holidayLabelsByDay?: Record<number, string | undefined>
  requestMetaByEmployeeDay?: Record<string, Record<number, { kind: string; label: string }>>
  className?: string
  compact?: boolean
  getDefaultBreakForEmployee?: (employeeId: string) => HMRange | null
}) {
  const dim = daysInMonth(monthKey)
  
  // Detect screen width for responsive columns
  const [screenWidth, setScreenWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1920)
  
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const handleResize = () => {
      setScreenWidth(window.innerWidth)
    }
    
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])
  
  // In compact mode, show columns based on screen width
  const getCompactColumns = () => {
    if (!compact) return extraColumns ?? []
    
    let columnIds: string[] = []
    
    // Small screen (< 1400px): 3 essential columns
    if (screenWidth < 1400) {
      columnIds = ["zile_lucrate", "ore_prezenta", "banca_ore"]
    }
    // Medium screen (1400-1800px): 5 columns
    else if (screenWidth < 1800) {
      columnIds = ["zile_lucrate", "tichete_masa", "ore_prezenta", "banca_ore", "co"]
    }
    // Large screen (> 1800px): 8 columns
    else {
      columnIds = ["zile_lucrate", "tichete_masa", "ore_prezenta", "banca_ore", "traseu_la", "co", "del", "in"]
    }
    
    return (extraColumns ?? [])
      .filter(col => columnIds.includes(col.id))
      .map(col => ({
        ...col,
        widthPx: 70 // Make them narrower in compact mode
      }))
  }
  
  const cols = compact ? getCompactColumns() : (extraColumns ?? [])
  
  const dayWidthPx = compact ? 40 : 100
  
  // Adjust name column width based on screen size in compact mode
  const getNameColWidth = () => {
    if (!compact) return "260px"
    if (screenWidth < 1400) return "140px"
    if (screenWidth < 1800) return "150px"
    return "160px"
  }
  
  const nameColWidth = getNameColWidth()
  const gridTemplateColumns = `${nameColWidth} repeat(${dim}, ${dayWidthPx}px) ${cols.map((c) => `${c.widthPx ?? 110}px`).join(" ")}`

  const cellHeight = compact ? "h-10" : "h-16"
  const headerPadding = compact ? "py-2" : "py-3"
  const rowMinHeight = compact ? "min-h-[40px]" : "min-h-[64px]"

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
    <div className={cn("w-full overflow-auto rounded-lg border border-border shadow-sm max-h-[calc(100vh-300px)]", className)}>
      <div className={compact ? "w-full" : "min-w-[960px]"}>
        {/* Header */}
        <div
          className="grid sticky top-0 z-20 bg-white border-b-2 border-gray-200"
          style={{ gridTemplateColumns }}
        >
          <div className={cn("sticky left-0 z-30 bg-white border-r border-gray-200 px-3 text-sm font-bold text-gray-900", headerPadding)}>
            Salariat
          </div>
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
            <div
              key={d}
              className={cn(
                "flex flex-col items-center justify-center px-1 font-semibold bg-gray-50",
                compact ? "text-[10px] py-2" : "text-xs py-3",
                (weekdayMeta(monthKey, d).isWeekend || holidayLabelsByDay?.[d]) && "bg-sky-50 text-sky-900"
              )}
              title={[
                `Ziua ${d}`,
                weekdayMeta(monthKey, d).longRo,
                holidayLabelsByDay?.[d] ? `Sărbătoare: ${holidayLabelsByDay?.[d]}` : "",
              ].filter(Boolean).join(" • ")}
            >
              <div>{d}</div>
              {!compact ? <div className="text-[10px] font-bold opacity-80">{weekdayMeta(monthKey, d).shortRo}</div> : null}
            </div>
          ))}
          {cols.map((c) => {
            // Shorter labels for compact mode
            let label = c.label
            if (compact) {
              const labelMap: Record<string, string> = {
                "zile_lucrate": "Zile",
                "tichete_masa": "Tichete",
                "ore_prezenta": "Ore",
                "banca_ore": "Bancă",
                "traseu_la": "Tr→C",
                "traseu_de": "Tr←C",
                "co": "CO",
                "del": "DEL",
                "in": "IN",
                "total_in": "T-IN",
                "ore_sl": "SL"
              }
              // Keep rich labels (e.g. with tooltip icon) intact; shorten only plain string labels.
              label = typeof c.label === "string" ? (labelMap[c.id] || c.label) : c.label
            }
            
            return (
              <div
                key={c.id}
                className={cn("flex items-center justify-center text-gray-900 border-l-2 border-gray-200 bg-gray-50", 
                  compact ? "px-1 text-[10px] font-bold py-2" : "px-2 text-xs font-bold py-3"
                )}
              >
                {label}
              </div>
            )
          })}
        </div>

        {/* Rows */}
        <div className="border-t border-gray-200">
          {employees.map((e, idx) => (
            <div
              key={e.id}
              className={cn(
                "grid",
                idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
              )}
              style={{ gridTemplateColumns }}
            >
              <div className={cn("sticky left-0 z-10 bg-inherit border-r border-b border-gray-200 px-3 flex flex-col justify-center", compact ? "py-2 min-h-[40px]" : "py-3 min-h-[64px]")}>
                <div className="flex items-center gap-2 min-w-0">
                  {isActiveCell?.(e.id, new Date().getDate()) ? (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" title="În pontaj acum" />
                  ) : null}
                  <div className={cn("font-semibold text-gray-900 truncate", compact ? "text-xs" : "text-sm")}>{getEmployeeFullName(e)}</div>
                </div>
                {!compact && e.title && <div className="text-xs text-gray-600 truncate">{e.title}</div>}
              </div>
              {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
                const c = getCell(e.id, d)
                const isActive = isActiveCell?.(e.id, d)
                const holidayLabel = holidayLabelsByDay?.[d]
                const req = requestMetaByEmployeeDay?.[e.id]?.[d]
                const { isWeekend, longRo } = weekdayMeta(monthKey, d)
                const isEmpty = !c || c.code === "EMPTY"
                const isLate = isLateCell(c)
                const defaultBreak = getDefaultBreakForEmployee?.(e.id) ?? null
                return (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "relative w-full border-l border-b border-gray-200 text-xs font-semibold transition-all duration-150 hover:shadow-lg hover:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:z-10",
                      cellHeight,
                      compact ? "hover:scale-110" : "hover:scale-105",
                      cellClasses(c),
                      req && isEmpty ? requestBgClass(req.kind) : "",
                      req && !isEmpty ? requestRingClass(req.kind) : "",
                      isLate && "ring-2 ring-red-400 ring-inset",
                      // Weekends / legal holidays: full-cell background (only for empty cells, so we don't fight code colors)
                      (isEmpty && (holidayLabel || isWeekend)) ? "bg-sky-50 text-sky-900 hover:bg-sky-100" : "",
                      isActive && "bg-emerald-200 text-emerald-900 hover:bg-emerald-300"
                    )}
                    title={[
                      `${getEmployeeFullName(e)} • Ziua ${d}`,
                      longRo,
                      req ? `Cerere aprobată: ${req.label}` : "",
                      holidayLabel ? `Sărbătoare: ${holidayLabel}` : "",
                    ].filter(Boolean).join(" • ")}
                    onClick={(ev) => {
                      const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                      onCellClick({
                        employeeId: e.id,
                        day: d,
                        anchorRect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                      })
                    }}
                  >
                    {isActive && isEmpty ? (
                      <div className="flex flex-col items-center leading-tight">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-700" />
                        {!compact ? <span className="mt-0.5 text-[10px] font-bold">În lucru</span> : null}
                      </div>
                    ) : (
                      cellLabel(c, compact, defaultBreak)
                    )}
                  </button>
                )
              })}
              {cols.map((c) => (
                <div key={c.id} className={cn("w-full border-l-2 border-b border-gray-200 flex items-center justify-center font-semibold text-gray-900 bg-gray-50/30 whitespace-nowrap overflow-hidden text-ellipsis", 
                  cellHeight,
                  compact ? "px-1 text-[10px]" : "px-2 text-xs"
                )}>
                  {c.render(e)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


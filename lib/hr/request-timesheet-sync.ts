import type { HrRequestKind, TimesheetCell, TimesheetMonthKey } from "./types"
import { calcEffectiveMinutes } from "./time-calc"

function enumerateDatesInclusiveISO(startDate: string, endDate: string): string[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const dates: string[] = []
  const d = new Date(start)
  while (d <= end) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    dates.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function minutesToHM(total: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)))
  const hh = Math.floor(safe / 60)
  const mm = safe % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function recalcHours(cell: TimesheetCell): TimesheetCell {
  const minutes = calcEffectiveMinutes({
    entries: (cell.entries ?? []) as any,
    breaks: (cell.breaks ?? null) as any,
  })
  return { ...cell, hours: Math.round((minutes / 60) * 100) / 100 }
}

export function daysByMonthFromRequest(kind: HrRequestKind, payload: any): Record<TimesheetMonthKey, number[]> {
  const map: Record<string, Set<number>> = {}
  const add = (iso: string) => {
    const s = String(iso || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return
    const mk = s.slice(0, 7) as TimesheetMonthKey
    const day = Number(s.slice(8, 10))
    if (!Number.isFinite(day) || day < 1 || day > 31) return
    if (!map[mk]) map[mk] = new Set()
    map[mk].add(day)
  }

  if (kind === "IN" || kind === "CORRECT_HOURS" || kind === "ADD_OVERTIME") {
    add(String(payload?.date || ""))
  } else if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    enumerateDatesInclusiveISO(String(payload?.startDate || ""), String(payload?.endDate || "")).forEach(add)
  }

  return Object.fromEntries(Object.entries(map).map(([mk, set]) => [mk, Array.from(set).sort((a, b) => a - b)])) as Record<
    TimesheetMonthKey,
    number[]
  >
}

export function buildTimesheetCellForHrRequest(params: {
  requestId: string
  kind: HrRequestKind
  payload: any
  existing?: TimesheetCell | null
  programEnd?: string
}): TimesheetCell | null {
  const { requestId, kind } = params
  const p = params.payload ?? {}

  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    return {
      code: kind as any,
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
  }

  if (kind === "IN") {
    const startTime = String(p.startTime || "08:00")
    const endTime = String(p.endTime || "16:00")
    const next: TimesheetCell = {
      code: "IN",
      entries: [
        {
          start: startTime,
          end: endTime,
          project: "Învoire",
          methodStart: "Aprobat cerere",
          methodEnd: "Aprobat cerere",
          sourceRequestId: requestId,
          sourceRequestKind: kind,
        },
      ],
      breaks: [],
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    return recalcHours(next)
  }

  if (kind === "CORRECT_HOURS") {
    const entries = Array.isArray(p.entries) ? p.entries : []
    const breaks = Array.isArray(p.breaks) ? p.breaks : []
    const next: TimesheetCell = {
      code: "WORK",
      entries: entries
        .filter((e: any) => e?.start && e?.end)
        .map((e: any) => ({
          start: String(e.start),
          end: String(e.end),
          project: e.project ? String(e.project) : undefined,
          travelToClient: e.travelToClient ? true : undefined,
          methodStart: "Corectat (cerere aprobată)",
          methodEnd: "Corectat (cerere aprobată)",
          sourceRequestId: requestId,
          sourceRequestKind: kind,
        })),
      breaks: breaks
        .filter((b: any) => b?.start && b?.end)
        .map((b: any) => ({
          start: String(b.start),
          end: String(b.end),
          sourceRequestId: requestId,
          sourceRequestKind: kind,
        })),
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    return recalcHours(next)
  }

  if (kind === "ADD_OVERTIME") {
    const overtimeHours = Number(p.overtimeHours ?? 0)
    if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) return null

    const programEnd = params.programEnd ?? "16:30"
    const startM = parseHM(programEnd) ?? 16 * 60 + 30
    const endM = Math.min(23 * 60 + 59, startM + Math.round(overtimeHours * 60))
    const overtimeEntry = {
      start: minutesToHM(startM),
      end: minutesToHM(endM),
      project: "Ore suplimentare",
      methodStart: "Aprobat cerere",
      methodEnd: "Aprobat cerere",
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }

    const existing = params.existing ?? null
    const baseEntries = Array.isArray(existing?.entries) ? existing.entries.filter((e: any) => e?.sourceRequestId !== requestId) : []
    const baseBreaks = Array.isArray(existing?.breaks) ? existing.breaks : []
    const next: TimesheetCell = {
      ...(existing ?? { code: "WORK" as const }),
      code: existing?.code && existing.code !== "EMPTY" ? existing.code : "WORK",
      entries: [...baseEntries, overtimeEntry],
      breaks: baseBreaks,
    }
    if (!existing || existing.code === "EMPTY") {
      next.sourceRequestId = requestId
      next.sourceRequestKind = kind
    }
    return recalcHours(next)
  }

  return null
}

export function removeHrRequestFromTimesheetCell(cell: TimesheetCell | undefined, requestId: string): TimesheetCell | null | undefined {
  if (!cell) return undefined
  if (cell.sourceRequestId === requestId) return null

  const entries = cell.entries ?? []
  const breaks = cell.breaks ?? []
  const nextEntries = entries.filter((e: any) => e?.sourceRequestId !== requestId)
  const nextBreaks = breaks.filter((b: any) => b?.sourceRequestId !== requestId)
  if (nextEntries.length === entries.length && nextBreaks.length === breaks.length) return cell

  const next: TimesheetCell = {
    ...cell,
    entries: nextEntries,
    breaks: nextBreaks,
  }
  return recalcHours(next)
}

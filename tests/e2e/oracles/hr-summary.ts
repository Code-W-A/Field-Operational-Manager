import { effectiveOracleMinutes, expectedWorkOracleMinutes, parseOracleHHmm, type OracleRange } from "./time"

export type OracleSummaryCell = {
  day: number
  code: string
  hours?: number
  entries?: Array<OracleRange & { project?: string }>
  breaks?: OracleRange[]
  saturday?: boolean
  sunday?: boolean
  holiday?: boolean
}

const normalizedProject = (value?: string) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

function rawProjectMinutes(entries: OracleSummaryCell["entries"], project: string) {
  return (entries ?? []).reduce((sum, entry) => {
    if (normalizedProject(entry.project) !== normalizedProject(project)) return sum
    const absoluteStart = Number(entry.startTimestampMs)
    const absoluteEnd = Number(entry.endTimestampMs)
    if (Number.isFinite(absoluteStart) && Number.isFinite(absoluteEnd) && absoluteEnd > absoluteStart) {
      return sum + (absoluteEnd - absoluteStart) / 60_000
    }
    const start = parseOracleHHmm(entry.start)
    const end = parseOracleHHmm(entry.end)
    return start != null && end != null && end > start ? sum + end - start : sum
  }, 0)
}

export function oracleSummary(params: {
  cells: OracleSummaryCell[]
  schedule?: { start?: string; end?: string; breakStart?: string; breakEnd?: string }
}) {
  const expectedDailyMinutes = expectedWorkOracleMinutes({ employee: params.schedule })
  let presenceMinutes = 0
  let workDays = 0
  let tickets = 0
  let c1 = 0
  let c2 = 0
  let c3 = 0
  let c4 = 0
  let c5 = 0
  let c6 = 0
  let c7 = 0
  const scheduleStart = parseOracleHHmm(params.schedule?.start || "08:00") ?? 480
  const scheduleEnd = parseOracleHHmm(params.schedule?.end || "16:30") ?? 990

  for (const cell of params.cells) {
    const entries = cell.entries ?? []
    const pontaj = entries.filter((entry) => normalizedProject(entry.project) === "pontaj")
    const pontajRaw = rawProjectMinutes(entries, "Pontaj")
    if (cell.code === "WORK") {
      workDays += 1
      const presenceEntries = entries.filter((entry) => {
        const project = normalizedProject(entry.project)
        return project !== "traseu catre client" && project !== "traseu catre casa"
      })
      const minutes = entries.length
        ? effectiveOracleMinutes({ entries: presenceEntries, breaks: cell.breaks, defaultBreak: params.schedule?.breakStart && params.schedule?.breakEnd ? { start: params.schedule.breakStart, end: params.schedule.breakEnd } : null })
        : Math.max(0, Math.round(Number(cell.hours || 0) * 60))
      presenceMinutes += minutes
      if (!cell.saturday && !cell.sunday && !cell.holiday && minutes > 0) tickets += 1
    }
    if (cell.saturday) c6 += pontajRaw
    if (cell.sunday || cell.holiday) c7 += pontajRaw
    if (!cell.saturday && !cell.sunday && !cell.holiday && pontaj.length) {
      const starts = pontaj.map((entry) => parseOracleHHmm(entry.start)).filter((value): value is number => value != null)
      const ends = pontaj.map((entry) => parseOracleHHmm(entry.end)).filter((value): value is number => value != null)
      const routeToClient = entries.filter((entry) => normalizedProject(entry.project) === "traseu catre client")
      const routeHome = entries.filter((entry) => normalizedProject(entry.project) === "traseu catre casa")
      const routeBefore = routeToClient.reduce((sum, entry) => {
        const start = parseOracleHHmm(entry.start)
        const end = parseOracleHHmm(entry.end)
        return start != null && end != null ? sum + Math.max(0, Math.min(end, scheduleStart) - start) : sum
      }, 0)
      const routeAfter = routeHome.reduce((sum, entry) => {
        const start = parseOracleHHmm(entry.start)
        const end = parseOracleHHmm(entry.end)
        return start != null && end != null ? sum + Math.max(0, end - Math.max(start, scheduleEnd)) : sum
      }, 0)
      const before = routeBefore || (starts.length ? Math.max(0, scheduleStart - Math.min(...starts)) : 0)
      const after = routeAfter || (ends.length ? Math.max(0, Math.max(...ends) - scheduleEnd) : 0)
      c1 += before
      c2 += after
      const outside = before + after
      c3 += Math.min(120, outside)
      c4 += Math.min(120, Math.max(0, outside - 120))
      c5 += Math.max(0, outside - 240)
    }
  }
  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100
  return {
    presenceHours: hours(presenceMinutes),
    workDays,
    tickets,
    overtimeBank: hours(presenceMinutes - workDays * expectedDailyMinutes),
    c1: hours(c1), c2: hours(c2), c3: hours(c3), c4: hours(c4), c5: hours(c5), c6: hours(c6), c7: hours(c7),
  }
}

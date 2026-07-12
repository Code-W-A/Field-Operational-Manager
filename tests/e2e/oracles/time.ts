export type OracleRange = {
  start: string
  end: string
  startTimestampMs?: number
  endTimestampMs?: number
}

export function parseOracleHHmm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }
  return hour * 60 + minute
}

export function validOracleRange(range: OracleRange | null | undefined): range is OracleRange {
  if (!range) return false
  const start = parseOracleHHmm(range.start)
  const end = parseOracleHHmm(range.end)
  return start != null && end != null && end > start
}

function unionNumeric(ranges: Array<{ start: number; end: number }>) {
  const sorted = ranges
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const union: Array<{ start: number; end: number }> = []
  for (const current of sorted) {
    const previous = union.at(-1)
    if (!previous || current.start >= previous.end) union.push({ ...current })
    else previous.end = Math.max(previous.end, current.end)
  }
  return union
}

export function unionOracleRanges(ranges: OracleRange[]) {
  return unionNumeric(ranges.flatMap((range) => {
    const start = parseOracleHHmm(range.start)
    const end = parseOracleHHmm(range.end)
    return start != null && end != null && end > start ? [{ start, end }] : []
  }))
}

export function overlapOracleMinutes(a: { start: number; end: number }, b: { start: number; end: number }) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
}

export function effectiveOracleMinutes(params: {
  entries: OracleRange[]
  breaks?: OracleRange[] | null
  defaultBreak?: OracleRange | null
}) {
  const wallEntries = unionOracleRanges(params.entries)
  const absoluteEntries = unionNumeric(params.entries.flatMap((entry) => {
    const start = Number(entry.startTimestampMs)
    const end = Number(entry.endTimestampMs)
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : []
  }))
  const timestampedWallEntries = unionOracleRanges(params.entries.filter((entry) => {
    const start = Number(entry.startTimestampMs)
    const end = Number(entry.endTimestampMs)
    return Number.isFinite(start) && Number.isFinite(end) && end > start
  }))
  const wallMinutes = wallEntries.reduce((sum, range) => sum + range.end - range.start, 0)
  const timestampedWallMinutes = timestampedWallEntries.reduce((sum, range) => sum + range.end - range.start, 0)
  const absoluteMinutes = absoluteEntries.reduce((sum, range) => sum + (range.end - range.start) / 60_000, 0)
  const entryMinutes = wallMinutes + absoluteMinutes - timestampedWallMinutes

  const manualBreaks = unionOracleRanges(params.breaks ?? [])
  const fallback = params.defaultBreak && validOracleRange(params.defaultBreak)
    ? unionOracleRanges([params.defaultBreak])
    : []
  const usedBreaks = manualBreaks.length ? manualBreaks : fallback
  const breakMinutes = usedBreaks.reduce((sum, pause) => {
    return sum + wallEntries.reduce((entrySum, entry) => entrySum + overlapOracleMinutes(entry, pause), 0)
  }, 0)
  return Math.max(0, entryMinutes - breakMinutes)
}

export function expectedWorkOracleMinutes(params: {
  employee?: { start?: string; end?: string; breakStart?: string; breakEnd?: string }
  defaults?: { start?: string; end?: string; breakStart?: string; breakEnd?: string }
}) {
  const start = params.employee?.start || params.defaults?.start || "08:00"
  const end = params.employee?.end || params.defaults?.end || "16:30"
  const breakStart = params.employee?.breakStart || params.defaults?.breakStart
  const breakEnd = params.employee?.breakEnd || params.defaults?.breakEnd
  return effectiveOracleMinutes({
    entries: [{ start, end }],
    defaultBreak: breakStart && breakEnd ? { start: breakStart, end: breakEnd } : null,
  })
}

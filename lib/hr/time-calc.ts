export type HMRange = {
  start: string
  end: string
  /** Present on attendance-generated ranges so elapsed time survives DST folds/gaps. */
  startTimestampMs?: number
  endTimestampMs?: number
}

export function parseHM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

export function isValidHMRange(r: HMRange | null | undefined): r is HMRange {
  if (!r) return false
  const s = parseHM(r.start)
  const e = parseHM(r.end)
  return s != null && e != null && e > s
}

export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const s = Math.max(aStart, bStart)
  const e = Math.min(aEnd, bEnd)
  return Math.max(0, e - s)
}

function normalizeRanges(ranges: HMRange[]): Array<{ start: number; end: number }> {
  const items = ranges
    .map((r) => {
      const s = parseHM(r.start)
      const e = parseHM(r.end)
      if (s == null || e == null || e <= s) return null
      return { start: s, end: e }
    })
    .filter(Boolean) as Array<{ start: number; end: number }>
  if (items.length <= 1) return items
  items.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const it of items) {
    const last = merged[merged.length - 1]
    if (!last || it.start >= last.end) {
      merged.push({ start: it.start, end: it.end })
      continue
    }
    last.end = Math.max(last.end, it.end)
  }
  return merged
}

function normalizeAbsoluteRanges(ranges: HMRange[]): Array<{ start: number; end: number }> {
  const items = ranges
    .map((range) => {
      const start = Number(range.startTimestampMs)
      const end = Number(range.endTimestampMs)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
      return { start, end }
    })
    .filter(Boolean) as Array<{ start: number; end: number }>

  if (items.length <= 1) return items
  items.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const item of items) {
    const last = merged[merged.length - 1]
    if (!last || item.start >= last.end) {
      merged.push({ ...item })
      continue
    }
    last.end = Math.max(last.end, item.end)
  }
  return merged
}

function sumRangeMinutes(ranges: Array<{ start: number; end: number }>, divisor = 1): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start) / divisor, 0)
}

export function calcEffectiveMinutes(params: {
  entries: HMRange[]
  /** Manual breaks stored in the timesheet cell. If empty/invalid, we'll use defaultBreak (if valid). */
  breaks?: HMRange[] | null
  /** Employee/HR default break (pauză). Applied only when there is no valid manual break in breaks[]. */
  defaultBreak?: HMRange | null
}): number {
  const entries = params.entries || []
  const entryRanges = normalizeRanges(entries)
  const absoluteEntryRanges = normalizeAbsoluteRanges(entries)
  if (!entryRanges.length && !absoluteEntryRanges.length) return 0

  // HH:mm loses one hour in a DST fold and invents one in a DST gap. Preserve
  // wall-clock overlap behavior, then correct it with the absolute attendance union.
  const timestampedEntries = entries.filter((entry) => {
    const start = Number(entry.startTimestampMs)
    const end = Number(entry.endTimestampMs)
    return Number.isFinite(start) && Number.isFinite(end) && end > start
  })
  const timestampedWallRanges = normalizeRanges(timestampedEntries)
  const wallMinutes = sumRangeMinutes(entryRanges)
  const timestampedWallMinutes = sumRangeMinutes(timestampedWallRanges)
  const absoluteMinutes = sumRangeMinutes(absoluteEntryRanges, 60_000)
  const entryMinutes = wallMinutes + (absoluteMinutes - timestampedWallMinutes)

  const manualBreaks = normalizeRanges(Array.isArray(params.breaks) ? params.breaks : [])
  const breaksToUse =
    manualBreaks.length > 0 ? manualBreaks : (isValidHMRange(params.defaultBreak) ? normalizeRanges([params.defaultBreak]) : [])

  if (!breaksToUse.length) return Math.max(0, Math.round(entryMinutes))

  // Subtract break overlap with the union of entries.
  let breakOverlap = 0
  for (const b of breaksToUse) {
    for (const e of entryRanges) {
      breakOverlap += overlapMinutes(e.start, e.end, b.start, b.end)
    }
  }

  return Math.max(0, Math.round(entryMinutes - breakOverlap))
}

export function getTimesheetCellMinutes(params: {
  cell: { hours?: number; entries?: Array<HMRange & { project?: string }>; breaks?: HMRange[] } | null | undefined
  defaultBreak?: HMRange | null
}): number {
  const entries = (params.cell?.entries ?? []).filter((entry) => {
    const project = String(entry.project || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    return project !== "traseu catre client" && project !== "traseu catre casa"
  })
  if (entries.length > 0) {
    return calcEffectiveMinutes({
      entries,
      breaks: params.cell?.breaks ?? null,
      defaultBreak: params.defaultBreak ?? null,
    })
  }
  const storedHours = Number(params.cell?.hours)
  return Number.isFinite(storedHours) ? Math.max(0, Math.round(storedHours * 60)) : 0
}

export function getConfiguredBreak(
  employee?: { pauzaStart?: string; pauzaEnd?: string } | null,
  defaults?: { pauzaStart?: string; pauzaEnd?: string } | null,
): HMRange | null {
  const range = {
    start: String(employee?.pauzaStart || defaults?.pauzaStart || "").trim(),
    end: String(employee?.pauzaEnd || defaults?.pauzaEnd || "").trim(),
  }
  return isValidHMRange(range) ? range : null
}

export function getExpectedWorkMinutes(
  employee?: { programLucruStart?: string; programLucruEnd?: string; pauzaStart?: string; pauzaEnd?: string } | null,
  defaults?: { programLucruStart?: string; programLucruEnd?: string; pauzaStart?: string; pauzaEnd?: string } | null,
): number {
  const schedule = {
    start: String(employee?.programLucruStart || defaults?.programLucruStart || "08:00").trim(),
    end: String(employee?.programLucruEnd || defaults?.programLucruEnd || "16:30").trim(),
  }
  if (!isValidHMRange(schedule)) return 0
  return calcEffectiveMinutes({
    entries: [schedule],
    defaultBreak: getConfiguredBreak(employee, defaults),
  })
}

export function minutesToHM(totalMinutes: number): string {
  const total = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

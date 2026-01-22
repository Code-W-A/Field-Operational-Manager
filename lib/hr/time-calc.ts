export type HMRange = { start: string; end: string }

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

export function calcEffectiveMinutes(params: {
  entries: HMRange[]
  /** Manual breaks stored in the timesheet cell. If empty/invalid, we'll use defaultBreak (if valid). */
  breaks?: HMRange[] | null
  /** Employee/HR default break (pauză). Applied only when there is no valid manual break in breaks[]. */
  defaultBreak?: HMRange | null
}): number {
  const entryRanges = normalizeRanges(params.entries || [])
  if (!entryRanges.length) return 0

  const entryMinutes = entryRanges.reduce((sum, r) => sum + (r.end - r.start), 0)

  const manualBreaks = normalizeRanges(Array.isArray(params.breaks) ? params.breaks : [])
  const breaksToUse =
    manualBreaks.length > 0 ? manualBreaks : (isValidHMRange(params.defaultBreak) ? normalizeRanges([params.defaultBreak]) : [])

  if (!breaksToUse.length) return entryMinutes

  // Subtract break overlap with the union of entries.
  let breakOverlap = 0
  for (const b of breaksToUse) {
    for (const e of entryRanges) {
      breakOverlap += overlapMinutes(e.start, e.end, b.start, b.end)
    }
  }

  return Math.max(0, entryMinutes - breakOverlap)
}

export function minutesToHM(totalMinutes: number): string {
  const total = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}


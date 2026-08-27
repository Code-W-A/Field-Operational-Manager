import { formatUiDate, toDateSafe } from "@/lib/utils/time-format"

export type WorkDaySectionKind = "past" | "today" | "tomorrow" | "future" | "undated"

export type WorkDaySection<T> = {
  key: string
  kind: WorkDaySectionKind
  dateKey: string | null
  title: string
  overdue: boolean
  items: T[]
}

const UNDATED_KEY = "undated"
const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function localDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function localDayUtcMs(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

function dayOffsetFromToday(date: Date, today: Date) {
  return Math.round((localDayUtcMs(startOfLocalDay(date)) - localDayUtcMs(today)) / MS_PER_DAY)
}

function sectionTitle(kind: WorkDaySectionKind, date: Date | null) {
  if (kind === "undated" || !date) return "Fără dată programată"
  const dateLabel = formatUiDate(date)
  if (kind === "today") return `Astăzi · ${dateLabel}`
  if (kind === "tomorrow") return `Mâine · ${dateLabel}`
  return dateLabel
}

function kindForOffset(offset: number): Exclude<WorkDaySectionKind, "undated"> {
  if (offset < 0) return "past"
  if (offset === 0) return "today"
  if (offset === 1) return "tomorrow"
  return "future"
}

function sortRank(kind: WorkDaySectionKind) {
  if (kind === "past") return 0
  if (kind === "today") return 1
  if (kind === "tomorrow" || kind === "future") return 2
  return 3
}

export function groupWorksByScheduledDay<T extends { dataInterventie?: unknown }>(
  works: T[],
  now: Date = new Date(),
): WorkDaySection<T>[] {
  const today = startOfLocalDay(now)
  const buckets = new Map<string, WorkDaySection<T>>()

  for (const work of works) {
    const parsed = toDateSafe(work.dataInterventie)
    if (!parsed) {
      const existing = buckets.get(UNDATED_KEY)
      if (existing) {
        existing.items.push(work)
      } else {
        buckets.set(UNDATED_KEY, {
          key: UNDATED_KEY,
          kind: "undated",
          dateKey: null,
          title: sectionTitle("undated", null),
          overdue: false,
          items: [work],
        })
      }
      continue
    }

    const dateKey = localDayKey(parsed)
    const offset = dayOffsetFromToday(parsed, today)
    const kind = kindForOffset(offset)
    const existing = buckets.get(dateKey)
    if (existing) {
      existing.items.push(work)
      continue
    }

    buckets.set(dateKey, {
      key: dateKey,
      kind,
      dateKey,
      title: sectionTitle(kind, parsed),
      overdue: kind === "past",
      items: [work],
    })
  }

  return Array.from(buckets.values()).sort((a, b) => {
    const rankDiff = sortRank(a.kind) - sortRank(b.kind)
    if (rankDiff !== 0) return rankDiff
    if (a.kind === "past") return String(b.dateKey).localeCompare(String(a.dateKey))
    if (a.kind === "tomorrow" || a.kind === "future") return String(a.dateKey).localeCompare(String(b.dateKey))
    return 0
  })
}

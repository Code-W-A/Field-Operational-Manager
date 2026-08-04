export const SCHEDULE_MONTHS_AHEAD = 48
export const MAX_PREVIEW_OCCURRENCES = 2000
export const CALENDAR_MONTHS_VISIBLE = 12

export type RevisionSchedulePreview = {
  scheduledIso: string
  generateIso: string
  locationId?: string
  locationName?: string
}

export type CalendarEvent = {
  id: string
  date: Date
  contractId: string
  contractName: string
  contractNumber: string
  locationName?: string
}

export type ContractCalendarSource = {
  id?: string
  name: string
  number: string
  revisionSchedulePreview?: RevisionSchedulePreview[]
}

export type RevisionFormParams = {
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  locationIds?: string[]
  locationNames?: string[]
  locationId?: string
  locationName?: string
}

export type RevisionCalendarContractSource = ContractCalendarSource & RevisionFormParams

const addMonths = (date: Date, months: number) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

const addDays = (date: Date, days: number) => {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

export const addMonthsDate = (date: Date, months: number) => addMonths(date, months)

export function parsePreviewDate(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof (raw as any)?.toDate === "function") {
    const d = (raw as any).toDate()
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
  }
  if (typeof (raw as any)?.seconds === "number") {
    const d = new Date((raw as any).seconds * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof raw === "string" || typeof raw === "number") {
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export function computeRevisionSchedulePreview(params: RevisionFormParams): RevisionSchedulePreview[] {
  if (!params.startDate || !params.recurrenceInterval || !params.recurrenceUnit) return []
  const start = new Date(params.startDate)
  if (Number.isNaN(start.getTime())) return []

  const interval = Math.max(1, params.recurrenceInterval)
  const lead = params.daysBeforeWork ?? 0
  const horizon =
    params.recurrenceUnit === "luni"
      ? addMonths(start, SCHEDULE_MONTHS_AHEAD)
      : addDays(start, SCHEDULE_MONTHS_AHEAD * 30)

  const locations =
    (params.locationIds?.length ?? 0) > 0
      ? (params.locationIds || []).map((id, idx) => ({
          id,
          name: params.locationNames?.[idx],
        }))
      : [{ id: params.locationId || "", name: params.locationName }]

  const occurrences: RevisionSchedulePreview[] = []
  let occ = start

  while (occ <= horizon && occurrences.length < MAX_PREVIEW_OCCURRENCES) {
    const scheduledAt = new Date(occ)
    const generateAt = addDays(scheduledAt, -lead)
    const scheduledIso = scheduledAt.toISOString()
    const generateIso = generateAt.toISOString()

    for (const loc of locations) {
      occurrences.push({
        scheduledIso,
        generateIso,
        locationId: loc.id || undefined,
        locationName: loc.name || undefined,
      })
    }

    occ = params.recurrenceUnit === "luni" ? addMonths(occ, interval) : addDays(occ, interval)
  }

  return occurrences
}

/** Folosește preview-ul salvat sau îl reconstruiește pentru contractele vechi. */
export function resolveContractRevisionPreview(contract: RevisionCalendarContractSource): RevisionSchedulePreview[] {
  if (Array.isArray(contract.revisionSchedulePreview)) return contract.revisionSchedulePreview

  return computeRevisionSchedulePreview({
    startDate: contract.startDate,
    recurrenceInterval: contract.recurrenceInterval,
    recurrenceUnit: contract.recurrenceUnit,
    daysBeforeWork: contract.daysBeforeWork,
    locationIds: contract.locationIds,
    locationNames: contract.locationNames,
    locationId: contract.locationId,
    locationName: contract.locationName,
  })
}

export function buildCalendarEventsFromPreview(
  preview: RevisionSchedulePreview[],
  contract: { id: string; name: string; number: string },
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  preview.forEach((item, idx) => {
    const raw = item?.scheduledIso
    const date = parsePreviewDate(raw)
    if (!date) return
    if (date < rangeStart || date >= rangeEnd) return

    events.push({
      id: `${contract.id}-${idx}-${date.toISOString()}`,
      date,
      contractId: contract.id,
      contractName: contract.name,
      contractNumber: contract.number,
      locationName: item?.locationName,
    })
  })

  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function buildCalendarEventsFromContracts(
  contracts: ContractCalendarSource[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  contracts.forEach((contract) => {
    const preview = contract.revisionSchedulePreview
    if (!Array.isArray(preview) || !contract.id) return
    events.push(
      ...buildCalendarEventsFromPreview(
        preview,
        { id: contract.id, name: contract.name, number: contract.number },
        rangeStart,
        rangeEnd,
      ),
    )
  })

  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function filterCalendarEventsByContractId(
  events: CalendarEvent[],
  contractId: string | null | undefined,
): CalendarEvent[] {
  if (!contractId) return events
  return events.filter((ev) => ev.contractId === contractId)
}

export function resolveEditDialogCalendarPreview(
  form: RevisionFormParams,
  savedPreview?: RevisionSchedulePreview[] | null,
): RevisionSchedulePreview[] {
  const live = computeRevisionSchedulePreview(form)
  if (live.length > 0) return live
  return Array.isArray(savedPreview) ? savedPreview : []
}

export function canOpenRevisionCalendar(preview: RevisionSchedulePreview[]): boolean {
  return preview.length > 0
}

export function buildEditDialogCalendarEvents(
  form: RevisionFormParams,
  contract: { id: string; name: string; number: string },
  savedPreview: RevisionSchedulePreview[] | undefined | null,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] {
  const preview = resolveEditDialogCalendarPreview(form, savedPreview)
  if (!canOpenRevisionCalendar(preview)) return []
  return buildCalendarEventsFromPreview(preview, contract, rangeStart, rangeEnd)
}

export function getDefaultCalendarRange(referenceDate = new Date()) {
  const start = startOfMonth(referenceDate)
  const end = addMonthsDate(start, CALENDAR_MONTHS_VISIBLE)
  return { start, end }
}

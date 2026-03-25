import type { ProductItem as DevizProductRow } from "@/components/product-table-form"

type ProductSource = Partial<DevizProductRow> & {
  denumire?: string
  title?: string
  cantitate?: number
  pretUnitar?: number
}

export interface AutoDevizInput {
  reportProducts?: ProductSource[] | null
  durationText?: unknown
  arrivalAt?: unknown
  departureAt?: unknown
  techniciansCount?: unknown
  baseVisitPrice?: unknown
  laborHourlyPrice?: unknown
  includedMinutes?: unknown
  laborBillingStepMinutes?: unknown
}

export interface AutoDevizBreakdown {
  totalMinutes: number
  extraMinutes: number
  techCount: number
  billableHours: number
}

export interface AutoDevizResult {
  products: DevizProductRow[]
  breakdown: AutoDevizBreakdown
}

const DEFAULT_BASE_VISIT_PRICE = 280
const DEFAULT_LABOR_HOURLY_PRICE = 198
const DEFAULT_INCLUDED_MINUTES = 30
const DEFAULT_LABOR_STEP_MINUTES = 30

function createRowId(prefix: string, index: number) {
  return `${prefix}_${index}_${Math.random().toString(36).slice(2, 10)}`
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100
}

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }

  const text = String(value || "").trim().toLowerCase()
  if (!text) return null

  const hhmmMatch = text.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmmMatch) {
    const hours = Number(hhmmMatch[1] || 0)
    const minutes = Number(hhmmMatch[2] || 0)
    return hours * 60 + minutes
  }

  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*h(?:ours?|ore?)?/)
  const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m(?:in(?:ute)?)?/)

  if (hourMatch || minuteMatch) {
    const hours = Number((hourMatch?.[1] || "0").replace(",", "."))
    const minutes = Number((minuteMatch?.[1] || "0").replace(",", "."))
    return Math.round(hours * 60 + minutes)
  }

  const numeric = Number(text.replace(",", "."))
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null
}

function computeDurationMinutesFromTimestamps(arrivalAt: unknown, departureAt: unknown): number | null {
  if (!arrivalAt || !departureAt) return null

  const start = new Date(String(arrivalAt))
  const end = new Date(String(departureAt))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  const diffMs = end.getTime() - start.getTime()
  if (diffMs <= 0) return null
  return Math.floor(diffMs / 60000)
}

function normalizeReportProducts(products: ProductSource[] | null | undefined): DevizProductRow[] {
  return (products || []).map((product, index) => {
    const quantity = Number(product?.quantity ?? product?.cantitate ?? 0) || 0
    const price = Number(product?.price ?? product?.pretUnitar ?? 0) || 0

    return {
      id: String(product?.id || createRowId("report", index)),
      name: String(product?.name || product?.denumire || product?.title || "").trim(),
      um: String(product?.um || "buc").trim() || "buc",
      quantity,
      price,
      total: roundToTwo(quantity * price),
    }
  })
}

export function buildAutoDevizProducts(input: AutoDevizInput): AutoDevizResult {
  const baseVisitPrice = toPositiveNumber(input.baseVisitPrice, DEFAULT_BASE_VISIT_PRICE)
  const laborHourlyPrice = toPositiveNumber(input.laborHourlyPrice, DEFAULT_LABOR_HOURLY_PRICE)
  const includedMinutes = toPositiveNumber(input.includedMinutes, DEFAULT_INCLUDED_MINUTES)
  const laborBillingStepMinutes = toPositiveNumber(input.laborBillingStepMinutes, DEFAULT_LABOR_STEP_MINUTES)
  const techCount = Math.max(1, Math.round(toPositiveNumber(input.techniciansCount, 1)))
  const totalMinutes =
    parseDurationMinutes(input.durationText) ??
    computeDurationMinutesFromTimestamps(input.arrivalAt, input.departureAt) ??
    0

  const extraMinutes = Math.max(totalMinutes - includedMinutes, 0)
  const billableSteps = extraMinutes > 0 ? Math.ceil(extraMinutes / laborBillingStepMinutes) : 0
  const billableHours = roundToTwo((billableSteps * laborBillingStepMinutes * techCount) / 60)
  const laborQuantity = billableHours > 0 ? billableHours : 1
  const laborPrice = billableHours > 0 ? laborHourlyPrice : 0

  const fixedRows: DevizProductRow[] = [
    {
      id: createRowId("base", 0),
      name: "Deplasare/Constatare + 1/2h manopera",
      um: "serv",
      quantity: 1,
      price: roundToTwo(baseVisitPrice),
      total: roundToTwo(baseVisitPrice),
    },
    {
      id: createRowId("labor", 1),
      name: "Manopera service",
      um: "ore",
      quantity: laborQuantity,
      price: roundToTwo(laborPrice),
      total: roundToTwo(laborQuantity * laborPrice),
    },
  ]

  return {
    products: [...fixedRows, ...normalizeReportProducts(input.reportProducts)],
    breakdown: {
      totalMinutes,
      extraMinutes,
      techCount,
      billableHours,
    },
  }
}

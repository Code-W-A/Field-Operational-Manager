import { hasTicketCompletionDocument } from "@/lib/utils/work-completion"
import type { UninvoicedReportRow } from "@/lib/reports/types"

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("ro-RO")
}

function toDate(value: any): Date | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Echipamentele cunoscute trebuie să fie toate instalate; un PV fără hartă rămâne facturabil. */
function installationEquipmentReady(work: any) {
  const installation = work?.installation
  if (installation?.schemaVersion !== 1) return true
  const status = installation.equipmentStatus
  const fromStatus = status && typeof status === "object" && !Array.isArray(status) ? Object.keys(status) : []
  const fromIds = Array.isArray(work?.equipmentIds)
    ? work.equipmentIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
    : []
  const ids = [...new Set([...fromIds, ...fromStatus.map((id) => id.trim()).filter(Boolean)])]
  if (!ids.length) return true
  return ids.every((id) => status?.[id] === "done")
}

export function isUninvoicedWork(work: any) {
  if (!work || !hasTicketCompletionDocument(work)) return false
  if (!installationEquipmentReady(work)) return false
  if (String(work?.numarFactura || "").trim()) return false
  if (work?.facturaDocument && (work.facturaDocument.url || work.facturaDocument.fileName || work.facturaDocument.numarFactura)) {
    return false
  }
  if (String(work?.motivNefacturare || "").trim()) return false

  const status = normalize(work?.statusFacturare)
  if (status === "facturat" || status === "nu se facturează" || status === "nu se factureaza") return false
  return true
}

export function getUninvoicedReportDate(work: any) {
  return (
    toDate(work?.raportSnapshot?.dataGenerare) ||
    toDate(work?.raportGeneratAt) ||
    toDate(work?.updatedAt) ||
    toDate(work?.createdAt)
  )
}

export function formatEquipmentLabel(name?: unknown, code?: unknown) {
  const equipmentName = String(name ?? "").trim()
  const equipmentCode = String(code ?? "").trim()
  if (equipmentName && equipmentCode) return `${equipmentName} (${equipmentCode})`
  if (equipmentName) return equipmentName
  if (equipmentCode) return equipmentCode
  return "—"
}

export function toUninvoicedReportRow(work: any, generatedAt = new Date()): UninvoicedReportRow {
  const reportDate = getUninvoicedReportDate(work)
  const ageDays = reportDate
    ? Math.max(0, Math.floor((generatedAt.getTime() - reportDate.getTime()) / 86_400_000))
    : 0
  const archived = normalize(work?.statusLucrare) === "arhivată" || normalize(work?.statusLucrare) === "arhivata"

  return {
    id: String(work?.id || ""),
    ticketNumber: String(work?.nrLucrare || work?.numarRaport || work?.id || "—"),
    client: String(work?.client || "—"),
    location: String(work?.locatie || work?.locationName || "—"),
    workType: String(work?.tipLucrare || "—"),
    equipment: formatEquipmentLabel(work?.echipament, work?.echipamentCod),
    interventionDate: String(work?.dataInterventie || "—"),
    reportDate: reportDate?.toISOString() || "",
    technicians: Array.isArray(work?.tehnicieni) ? work.tehnicieni.map(String) : [],
    workStatus: String(work?.statusLucrare || "—"),
    invoiceStatus: String(work?.statusFacturare || "Nefacturat"),
    ageDays,
    archived,
    href: archived ? `/dashboard/arhivate/${work?.id}` : `/dashboard/lucrari/${work?.id}`,
  }
}

import { EQUIPMENT_STATUS } from "@/lib/utils/constants"

export type EquipmentStatusSettings = {
  equipmentStatusEnabled: boolean
  equipmentStatusIncludeNonFunctional: boolean
  equipmentStatusIncludePartiallyFunctional: boolean
}

export type EquipmentStatusWinner = {
  work: any
  status: string
  ticketCreatedAt: Date
}

function toDate(input: any | undefined): Date | null {
  if (!input) return null
  try {
    if (typeof (input as any)?.toDate === "function") return (input as any).toDate()
  } catch {}
  if (typeof input === "string") {
    const dIso = new Date(input)
    if (!Number.isNaN(dIso.getTime())) return dIso
    const [datePart, timePart = "00:00"] = input.split(" ")
    const [dd, mm, yyyy] = datePart.split(".")
    const [HH, MM] = timePart.split(":")
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function eqInsensitive(a?: string, ...candidates: string[]): boolean {
  const x = String(a || "").toLowerCase()
  return candidates.some((y) => x === String(y || "").toLowerCase())
}

function buildEquipmentKey(work: any): string | null {
  const clientKey = String(work?.clientId || work?.client || "").trim().toLowerCase()
  const locationKey = String(work?.locationId || work?.locatie || "").trim().toLowerCase()
  const equipmentKey = String(work?.echipamentId || work?.echipamentCod || work?.echipament || "").trim().toLowerCase()
  if (!equipmentKey) return null
  return `${clientKey}|${locationKey}|${equipmentKey}`
}

function isNewerEquipmentStatusTicket(
  work: any,
  ticketCreatedAt: Date,
  prev: EquipmentStatusWinner | undefined,
): boolean {
  if (!prev) return true
  const t = ticketCreatedAt.getTime()
  const pt = prev.ticketCreatedAt.getTime()
  if (t !== pt) return t > pt
  return String(work?.id || "") > String(prev.work?.id || "")
}

/**
 * Ultimul tichet emis (createdAt) per echipament determină starea afișată.
 * Dispare din dashboard când câștigătorul are statusEchipament = Funcțional.
 * Include tichete active și arhivate — updatedAt nu influențează câștigătorul.
 */
export function selectLatestEquipmentStatusWinners(
  lucrariForEquipmentStatus: any[],
  cfg: EquipmentStatusSettings,
): EquipmentStatusWinner[] {
  if (!cfg.equipmentStatusEnabled || !Array.isArray(lucrariForEquipmentStatus) || lucrariForEquipmentStatus.length === 0) {
    return []
  }

  const latestStatusByEquipment: Record<string, EquipmentStatusWinner> = {}

  for (const work of lucrariForEquipmentStatus) {
    const equipmentKey = buildEquipmentKey(work)
    if (!equipmentKey) continue

    const statusEchipament = String((work as any).statusEchipament || "").trim()
    if (!statusEchipament) continue

    const ticketCreatedAt = toDate((work as any).createdAt)
    if (!ticketCreatedAt) continue

    const prev = latestStatusByEquipment[equipmentKey]
    if (isNewerEquipmentStatusTicket(work, ticketCreatedAt, prev)) {
      latestStatusByEquipment[equipmentKey] = { work, status: statusEchipament, ticketCreatedAt }
    }
  }

  return Object.values(latestStatusByEquipment)
    .filter((winner) => {
      const isNonFunctional = eqInsensitive(winner.status, EQUIPMENT_STATUS.NON_FUNCTIONAL)
      const isPartial = eqInsensitive(winner.status, EQUIPMENT_STATUS.PARTIALLY_FUNCTIONAL)
      return (
        (isNonFunctional && cfg.equipmentStatusIncludeNonFunctional) ||
        (isPartial && cfg.equipmentStatusIncludePartiallyFunctional)
      )
    })
    .sort((a, b) => a.ticketCreatedAt.getTime() - b.ticketCreatedAt.getTime())
}

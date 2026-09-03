export type RevisionLocationEquipment = {
  id?: unknown
  cod?: unknown
}

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

/**
 * Selectează echipamentele care pot ajunge într-o revizie automată pentru o locație.
 *
 * Contractele moderne folosesc exclusiv intersecția dintre selecția contractului și
 * echipamentele locației. Fallback-ul la toate echipamentele locației este păstrat
 * doar pentru contractele legacy care nu au deloc `equipmentIds`.
 */
export function selectRevisionEquipmentIdsForLocation(params: {
  contractEquipmentIds: unknown
  locationEquipments: RevisionLocationEquipment[]
}): string[] {
  const selectedIds = Array.isArray(params.contractEquipmentIds)
    ? unique(params.contractEquipmentIds.map(normalizeId).filter((id): id is string => Boolean(id)))
    : []

  const locationKeys = new Set(
    params.locationEquipments.flatMap((equipment) => [normalizeId(equipment.id), normalizeId(equipment.cod)]).filter(
      (id): id is string => Boolean(id),
    ),
  )

  if (selectedIds.length > 0) {
    return selectedIds.filter((id) => locationKeys.has(id))
  }

  return unique(
    params.locationEquipments
      .map((equipment) => normalizeId(equipment.id) || normalizeId(equipment.cod))
      .filter((id): id is string => Boolean(id)),
  )
}

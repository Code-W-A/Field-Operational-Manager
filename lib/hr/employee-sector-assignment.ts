export type EmployeeSectorAssignmentInput = {
  sectorIds?: readonly string[] | null
  managerUidBySector?: Readonly<Record<string, string | null | undefined>> | null
  allowedSectorIds?: readonly string[] | null
}

export type EmployeeSectorAssignment = {
  sectorIds: string[]
  managerUidBySector: Record<string, string>
}

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

/** Keeps the sector assignment as a replaceable, self-consistent value object. */
export function normalizeEmployeeSectorAssignment(input: EmployeeSectorAssignmentInput): EmployeeSectorAssignment {
  const allowed = input.allowedSectorIds
    ? new Set(input.allowedSectorIds.map(normalizeId).filter(Boolean))
    : null
  const seen = new Set<string>()
  const sectorIds = (input.sectorIds ?? []).reduce<string[]>((result, sectorId) => {
    const normalized = normalizeId(sectorId)
    if (!normalized || seen.has(normalized) || (allowed && !allowed.has(normalized))) return result
    seen.add(normalized)
    result.push(normalized)
    return result
  }, [])
  const selected = new Set(sectorIds)
  const managerUidBySector = Object.fromEntries(
    Object.entries(input.managerUidBySector ?? {})
      .map(([sectorId, managerUid]) => [normalizeId(sectorId), normalizeId(managerUid)])
      .filter(([sectorId, managerUid]) => selected.has(sectorId) && managerUid),
  )

  return { sectorIds, managerUidBySector }
}

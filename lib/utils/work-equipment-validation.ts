export type WorkEquipmentValidationField = "echipament" | "equipmentIds"

export type WorkEquipmentValidationCode =
  | "WORK_EQUIPMENT_REQUIRED"
  | "WORK_REVISION_EQUIPMENT_REQUIRED"

export type WorkCreationEquipmentPayload = {
  tipLucrare?: unknown
  echipamentId?: unknown
  echipamentCod?: unknown
  echipament?: unknown
  equipmentIds?: unknown
}

export type WorkEquipmentValidationResult =
  | { valid: true }
  | {
      valid: false
      code: WorkEquipmentValidationCode
      field: WorkEquipmentValidationField
      message: string
    }

const WORK_EQUIPMENT_MESSAGES: Record<WorkEquipmentValidationCode, string> = {
  WORK_EQUIPMENT_REQUIRED: "Nu puteți lansa un tichet fără echipament. Selectați un echipament.",
  WORK_REVISION_EQUIPMENT_REQUIRED: "Pentru o revizie trebuie selectat cel puțin un echipament.",
}

const toTrimmed = (value: unknown) => String(value ?? "").trim()

export const isRevisionWorkType = (tipLucrare: unknown) => toTrimmed(tipLucrare).toLowerCase() === "revizie"

export const getNormalizedEquipmentIds = (equipmentIds: unknown): string[] => {
  if (!Array.isArray(equipmentIds)) return []
  return Array.from(new Set(equipmentIds.map((id) => toTrimmed(id)).filter(Boolean)))
}

export const validateWorkEquipmentForCreation = (
  payload: WorkCreationEquipmentPayload,
): WorkEquipmentValidationResult => {
  if (isRevisionWorkType(payload.tipLucrare)) {
    const ids = getNormalizedEquipmentIds(payload.equipmentIds)
    if (ids.length === 0) {
      return {
        valid: false,
        code: "WORK_REVISION_EQUIPMENT_REQUIRED",
        field: "equipmentIds",
        message: WORK_EQUIPMENT_MESSAGES.WORK_REVISION_EQUIPMENT_REQUIRED,
      }
    }
    return { valid: true }
  }

  const hasEquipmentRef =
    Boolean(toTrimmed(payload.echipamentId)) ||
    Boolean(toTrimmed(payload.echipamentCod)) ||
    Boolean(toTrimmed(payload.echipament))

  if (!hasEquipmentRef) {
    return {
      valid: false,
      code: "WORK_EQUIPMENT_REQUIRED",
      field: "echipament",
      message: WORK_EQUIPMENT_MESSAGES.WORK_EQUIPMENT_REQUIRED,
    }
  }

  return { valid: true }
}

import { resolveTicketLocation, type SyncRecord } from "../../firebase-functions/src/client-ticket-sync"

export class ReinterventionEquipmentError extends Error {}

export function revisionReinterventionEquipment(client: SyncRecord, work: SyncRecord) {
  const ids = [...new Set((Array.isArray(work.reinterventionEquipmentIds) ? work.reinterventionEquipmentIds : Array.isArray(work.equipmentIds) ? work.equipmentIds : [])
    .map((id: unknown) => String(id || "").trim()).filter(Boolean))] as string[]
  let equipments: SyncRecord[] = []
  let message = ""
  try {
    const location = resolveTicketLocation(client, work)
    equipments = (location.echipamente || []).filter((e: SyncRecord) => ids.includes(String(e.id)))
    if (!ids.length) message = "Revizia originală nu are ID-uri de echipament. Remediați asocierea în tichetul original."
    else if (ids.some(id => equipments.filter(e => String(e.id) === id).length !== 1)) message = "Un echipament al reviziei originale nu mai există în locație. Remediați asocierea înainte de salvare."
  } catch {
    message = "Locația reviziei originale nu poate fi identificată. Remediați asocierea înainte de salvare."
  }
  return { ids, equipments, message }
}

export function equipmentFields(equipment: SyncRecord) {
  return { echipamentId: String(equipment.id), echipament: equipment.nume || "", echipamentCod: equipment.cod || "", echipamentModel: equipment.model || "" }
}

export function prepareRevisionReinterventionEquipment(client: SyncRecord, work: SyncRecord) {
  const state = revisionReinterventionEquipment(client, work)
  return { reinterventionEquipmentIds: state.ids, equipmentIds: [],
    ...(state.equipments.length === 1 && !state.message ? equipmentFields(state.equipments[0]) :
      { echipamentId: "", echipament: "", echipamentCod: "", echipamentModel: "" }) }
}

export function validateRevisionReinterventionEquipment(client: SyncRecord, work: SyncRecord) {
  const state = revisionReinterventionEquipment(client, work)
  if (state.message) throw new ReinterventionEquipmentError(state.message)
  const selected = state.equipments.find(e => e.id === work.echipamentId)
  if (!selected) throw new ReinterventionEquipmentError("Selectați echipamentul din revizia originală pentru care solicitați reintervenția.")
  return equipmentFields(selected)
}

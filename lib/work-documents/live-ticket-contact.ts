"use client"

import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { getClientById } from "@/lib/firebase/firestore"
import { ContactAssociationError, freshReinterventionContact, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

import { ReinterventionEquipmentError, prepareRevisionReinterventionEquipment, validateRevisionReinterventionEquipment } from "./reintervention-equipment"

export async function loadReinterventionContact(work: SyncRecord, prepareEquipment = false) {
  const id = work.clientId || work.clientInfo?.id
  let client: SyncRecord | null = id ? await getClientById(String(id), { serverOnly: true }) : null
  if (!id) {
    const matches = await getDocsFromServer(query(collection(db, "clienti"), where("nume", "==", work.client || ""), limit(2)))
    if (matches.size === 1) client = { ...matches.docs[0].data(), id: matches.docs[0].id }
  }
  if (!client) throw new ContactAssociationError("Clientul nu poate fi identificat. Selectați clientul actual.")
  const contact = freshReinterventionContact(client, work)
  if (prepareEquipment && work.tipLucrare === "Revizie") return { ...contact, ...prepareRevisionReinterventionEquipment(client, work) }
  if (Array.isArray(work.reinterventionEquipmentIds)) return { ...contact, ...validateRevisionReinterventionEquipment(client, work) }
  return contact
}

export async function prepareReinterventionContact(work: SyncRecord) {
  try { return await loadReinterventionContact(work, true) } catch (error) {
    if (!(error instanceof ContactAssociationError)) throw new Error("Datele clientului nu au putut fi citite. Reîncercați înainte de a crea reintervenția.")
    return { client: work.client || "", clientId: work.clientId || work.clientInfo?.id || "",
      locatie: "", locationId: "", contactId: "", persoanaContact: "", telefon: "", persoanaContactEmail: "",
      ...(work.tipLucrare === "Revizie" ? { reinterventionEquipmentIds: Array.isArray(work.equipmentIds) ? work.equipmentIds : [], equipmentIds: [], echipamentId: "", echipament: "", echipamentCod: "" } : {}),
      persoaneContact: [], contactSelectionRequired: true, contactSelectionMessage: error.message }
  }
}

export async function refreshReinterventionContact(work: SyncRecord) {
  if (work.contactSelectionRequired && (!work.clientId || !work.locationId || !work.contactId)) {
    throw new ContactAssociationError("Selectați explicit clientul, locația și contactul actual înainte de salvare.")
  }
  let fresh: SyncRecord
  try { fresh = await loadReinterventionContact(work) } catch (error) {
    if (error instanceof ContactAssociationError || error instanceof ReinterventionEquipmentError) throw error
    throw new Error("Datele actuale ale clientului nu au putut fi citite. Reintervenția nu a fost creată. Reîncercați.")
  }
  const oldValues = work.contactSync?.values || {}
  for (const field of ["persoanaContact", "telefon", "persoanaContactEmail"]) {
    // A change made deliberately in this new form survives the second server read.
    if (Object.prototype.hasOwnProperty.call(oldValues, field) && work[field] !== oldValues[field]) {
      fresh[field] = work[field]
      fresh.contactSync.conflicts.push(field)
    }
  }
  return fresh
}

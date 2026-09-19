"use client"

import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { getClientById } from "@/lib/firebase/firestore"
import { ContactAssociationError, freshReinterventionContact, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export async function loadReinterventionContact(work: SyncRecord) {
  const id = work.clientId || work.clientInfo?.id
  let client: SyncRecord | null = id ? await getClientById(String(id), { serverOnly: true }) : null
  if (!id) {
    const matches = await getDocsFromServer(query(collection(db, "clienti"), where("nume", "==", work.client || ""), limit(2)))
    if (matches.size === 1) client = { ...matches.docs[0].data(), id: matches.docs[0].id }
  }
  if (!client) throw new ContactAssociationError("Clientul nu poate fi identificat. Selectați clientul actual.")
  return freshReinterventionContact(client, work)
}

export async function prepareReinterventionContact(work: SyncRecord) {
  try { return await loadReinterventionContact(work) } catch (error) {
    if (!(error instanceof ContactAssociationError)) throw new Error("Datele clientului nu au putut fi citite. Reîncercați înainte de a crea reintervenția.")
    return { client: work.client || "", clientId: work.clientId || work.clientInfo?.id || "",
      locatie: "", locationId: "", contactId: "", persoanaContact: "", telefon: "", persoanaContactEmail: "",
      persoaneContact: [], contactSelectionRequired: true, contactSelectionMessage: error.message }
  }
}

export async function refreshReinterventionContact(work: SyncRecord) {
  if (work.contactSelectionRequired && (!work.clientId || !work.locationId || !work.contactId)) {
    throw new ContactAssociationError("Selectați explicit clientul, locația și contactul actual înainte de salvare.")
  }
  let fresh: SyncRecord
  try { fresh = await loadReinterventionContact(work) } catch (error) {
    if (error instanceof ContactAssociationError) throw error
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

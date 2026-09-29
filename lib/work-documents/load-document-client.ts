"use client"

import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { getClientById } from "@/lib/firebase/firestore"
import { linkedClientId } from "@/lib/client-work-links"
import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
import { resolveDocumentClientSnapshot } from "./document-client-snapshot"

/** Called only when creating a new document/version. Historical downloads never call this. */
export async function loadDocumentClientSnapshot(work: SyncRecord) {
  const id = linkedClientId(work)
  let client: SyncRecord | null = null
  try {
    if (id) client = await getClientById(id, { serverOnly: true })
    else if (work.client) {
      const matches = await getDocsFromServer(query(collection(db, "clienti"), where("nume", "==", work.client), limit(2)))
      if (matches.size === 1) client = { ...matches.docs[0].data(), id: matches.docs[0].id }
    }
  } catch {
    throw new Error("Datele actuale ale clientului nu au putut fi citite. Reîncercați generarea documentului.")
  }
  if (!client) throw new Error("Clientul documentului lipsește sau este ambiguu. Verificați asocierea tichetului.")
  return resolveDocumentClientSnapshot(work, client)
}

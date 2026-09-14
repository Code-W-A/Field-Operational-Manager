"use client"

import { getClientById, getLucrareById } from "@/lib/firebase/firestore"
import { resolveRecipientEmailForLocation } from "./shared"

/** Re-read both records from the server before any document-send side effects. */
export async function loadWorkDocumentRecipient(lucrareId: string) {
  const freshWork = await getLucrareById(lucrareId, { serverOnly: true }).catch(() => {
    throw new Error("Nu s-au putut citi datele actuale ale tichetului. Reîncercați trimiterea.")
  })
  if (!freshWork) throw new Error("Tichetul nu mai este disponibil. Trimiterea a fost oprită.")

  const clientId = freshWork.clientId || freshWork.clientInfo?.id
  if (!clientId) throw new Error("Tichetul nu are un client asociat. Verificați datele tichetului.")
  const freshClient = await getClientById(String(clientId), { serverOnly: true }).catch(() => {
    throw new Error("Nu s-a putut citi fișa actuală a clientului. Reîncercați trimiterea.")
  })
  if (!freshClient) throw new Error("Fișa clientului nu mai este disponibilă. Trimiterea a fost oprită.")

  const recipient = resolveRecipientEmailForLocation(freshClient, freshWork)
  if (!recipient) {
    throw new Error("Nu există un email valid în fișa actuală a clientului. Corectați contactul înainte de trimitere.")
  }
  return { freshWork, freshClient, recipient }
}

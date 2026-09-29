"use client"

import { useEffect, useState } from "react"
import { collection, doc, getDocs, limit, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

type ClientState = {
  key: string
  client: SyncRecord | null
  initialClient: SyncRecord | null
  unavailable: boolean
}

/** One read-only subscription per opened ticket; share its result with all display components. */
export function useTicketClient(work: SyncRecord | null, scope: string) {
  const clientId = String(work?.clientId || work?.clientInfo?.id || "").trim()
  const legacyName = clientId ? "" : String(work?.client || "")
  const ticketId = String(work?.id || "")
  const key = JSON.stringify([scope, ticketId, clientId, legacyName])
  const [state, setState] = useState<ClientState | null>(null)

  useEffect(() => {
    if (!ticketId || !scope) return
    let active = true
    let stop: (() => void) | undefined
    // Kept separately so a client edit cannot change existing PDF/email fallback inputs.
    let initialClient: SyncRecord | null = null
    const unavailable = () => {
      if (active) setState({ key, client: null, initialClient, unavailable: true })
    }
    const subscribe = async () => {
      let id = clientId
      if (!id) {
        if (!legacyName) { unavailable(); return }
        const matches = await getDocs(query(collection(db, "clienti"), where("nume", "==", legacyName), limit(2)))
        if (!active) return
        // A cached name match cannot establish that the association is unique on the server.
        if (matches.metadata.fromCache || matches.size !== 1) { unavailable(); return }
        id = matches.docs[0].id
      }
      if (!active) return
      stop = onSnapshot(doc(db, "clienti", id), { includeMetadataChanges: true }, snapshot => {
        if (!active) return
        if (!snapshot.exists()) { unavailable(); return }
        if (snapshot.metadata.fromCache) {
          // Until the server confirms freshness (including an offline first visit), use the ticket.
          unavailable()
          return
        }
        const client = { ...snapshot.data(), id: snapshot.id }
        initialClient ||= client
        setState({ key, client, initialClient, unavailable: false })
      }, unavailable)
    }
    subscribe().catch(unavailable)
    return () => { active = false; stop?.() }
  }, [key, ticketId, scope, clientId, legacyName])

  // Hide the previous ticket's data during the render before effect cleanup runs.
  return state?.key === key ? state : { client: null, initialClient: null, unavailable: false }
}

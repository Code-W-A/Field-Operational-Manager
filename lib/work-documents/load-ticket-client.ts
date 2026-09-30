"use client"

import { collection, getDocsFromServer, limit, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { getClientById } from "@/lib/firebase/firestore"
import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export async function loadTicketClient(work: SyncRecord): Promise<SyncRecord | null> {
  const id = String(work.clientId || work.clientInfo?.id || "").trim()
  if (id) return await getClientById(id, { serverOnly: true }) as SyncRecord | null
  if (!work.client) return null
  const matches = await getDocsFromServer(query(collection(db, "clienti"), where("nume", "==", work.client), limit(2)))
  return matches.size === 1 ? { ...matches.docs[0].data(), id: matches.docs[0].id } : null
}

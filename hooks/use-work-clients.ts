"use client"

import { useEffect, useState } from "react"
import { collection, documentId, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useMockData } from "@/contexts/MockDataContext"
import { linkedClientId } from "@/lib/client-work-links"
import { isContactSyncEligible, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

const EMPTY_CLIENTS: SyncRecord[] = []

/** One shared read per group of distinct clients, never one listener per table row. */
export function useWorkClients(works: SyncRecord[]) {
  const { isPreview, clienti } = useMockData()
  const ids = new Set<string>(), names = new Set<string>()
  for (const work of works) {
    if (!isContactSyncEligible(work)) continue
    const id = linkedClientId(work)
    if (id) ids.add(id)
    else if (work.client) names.add(work.client)
  }
  const key = JSON.stringify([[...ids].sort(), [...names].sort()])
  const [state, setState] = useState<{ key: string; clients: SyncRecord[]; unavailable: boolean }>({ key: "", clients: [], unavailable: false })
  useEffect(() => {
    if (isPreview) return
    let active = true
    const [clientIds, clientNames]: string[][] = JSON.parse(key)
    const pages = new Map<string, SyncRecord[]>(), errors = new Set<string>()
    const stops: (() => void)[] = []
    const publish = () => {
      if (!active) return
      const clients = new Map<string, SyncRecord>()
      for (const page of pages.values()) for (const client of page) clients.set(client.id, client)
      setState({ key, clients: [...clients.values()], unavailable: errors.size > 0 })
    }
    for (const [field, values] of [["id", clientIds], ["nume", clientNames]] as const) {
      for (let offset = 0; offset < values.length; offset += 30) {
        const group = `${field}:${offset}`
        if (field === "id" && values.slice(offset, offset + 30).some(id => id.includes("/"))) {
          // Malformed legacy IDs must not crash the entire list query.
          errors.add(`invalid:${group}`)
        }
        const selectedValues = values.slice(offset, offset + 30).filter(value => field !== "id" || !value.includes("/"))
        if (!selectedValues.length) continue
        const request = query(collection(db, "clienti"), where(field === "id" ? documentId() : field, "in", selectedValues))
        stops.push(onSnapshot(request, { includeMetadataChanges: true }, snap => {
          if (!active) return
          pages.set(group, snap.metadata.fromCache ? [] : snap.docs.map(d => ({ ...d.data(), id: d.id })))
          if (snap.metadata.fromCache) errors.add(group); else errors.delete(group)
          publish()
        }, () => { if (active) { pages.delete(group); errors.add(group); publish() } }))
      }
    }
    publish()
    return () => { active = false; stops.forEach(stop => stop()) }
  }, [key, isPreview])
  return isPreview ? { clients: clienti, unavailable: false }
    : state.key === key ? state : { clients: EMPTY_CLIENTS, unavailable: false }
}

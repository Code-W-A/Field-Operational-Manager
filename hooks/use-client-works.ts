"use client"

import { useEffect, useMemo, useState } from "react"
import { collection, limit, onSnapshot, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { Client, Lucrare } from "@/lib/firebase/firestore"
import { useMockData } from "@/contexts/MockDataContext"
import { createClientIndex, linkedClientId } from "@/lib/client-work-links"

/** Read only this client's works, deduplicating the two supported ID fields. */
export function useClientWorks(client: Client | null) {
  const { isPreview, clienti, lucrari } = useMockData()
  const id = String(client?.id || ""), name = client?.nume || ""
  const key = JSON.stringify([id, name])
  const [state, setState] = useState<{ key: string; works: Lucrare[]; error: boolean }>({ key: "", works: [], error: false })
  useEffect(() => {
    if (isPreview || !id) return
    let active = true, failed = false
    const pages = new Map<string, Lucrare[]>()
    const stops: (() => void)[] = []
    const publish = () => {
      if (!active) return
      const unique = new Map<string, Lucrare>()
      for (const [selector, works] of pages) for (const work of works) {
        const linked = linkedClientId(work)
        if (linked === id || (!linked && selector === "client" && work.client === name)) unique.set(work.id!, work)
      }
      setState({ key, works: [...unique.values()], error: failed })
    }
    const subscribe = (field: string, value: string) => {
      let subscribed = true
      const stop = onSnapshot(query(collection(db, "lucrari"), where(field, "==", value)), snap => {
        if (!active || !subscribed) return
        pages.set(field, snap.docs.map(d => ({ ...d.data(), id: d.id }) as Lucrare))
        publish()
      }, () => { if (active && subscribed) { failed = true; publish() } })
      const unsubscribe = () => { subscribed = false; stop() }
      stops.push(unsubscribe)
      return unsubscribe
    }
    subscribe("clientId", id)
    subscribe("clientInfo.id", id)
    let stopLegacy: (() => void) | undefined
    if (name) stops.push(onSnapshot(query(collection(db, "clienti"), where("nume", "==", name), limit(2)), { includeMetadataChanges: true }, matches => {
      if (!active) return
      const unique = !matches.metadata.fromCache && matches.size === 1 && matches.docs[0].id === id
      if (unique && !stopLegacy) stopLegacy = subscribe("client", name)
      if (!unique && stopLegacy) { stopLegacy(); stopLegacy = undefined; pages.delete("client"); publish() }
    }, () => { stopLegacy?.(); stopLegacy = undefined; pages.delete("client"); failed = true; publish() }))
    return () => { active = false; stops.forEach(stop => stop()) }
  }, [id, name, key, isPreview])
  const previewWorks = useMemo(() => {
    if (!isPreview || !id) return []
    const index = createClientIndex(clienti)
    return lucrari.filter(work => index.resolve(work)?.id === id)
  }, [isPreview, id, clienti, lucrari])
  return isPreview ? { works: previewWorks, error: false }
    : state.key === key ? state : { works: [], error: false }
}

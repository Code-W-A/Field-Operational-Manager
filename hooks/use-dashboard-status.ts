"use client"

import { useMemo, useEffect, useState } from "react"
import { Timestamp, where, orderBy, limit } from "firebase/firestore"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { WORK_STATUS } from "@/lib/utils/constants"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"

export interface DashboardBubbleItem {
  id: string
  locatie: string
  equipmentLabel: string
  client?: string
  nrLucrare?: string
}

export interface DashboardBuckets {
  intarziate: DashboardBubbleItem[]
  amanate: DashboardBubbleItem[]
  listate: DashboardBubbleItem[]
  nepreluate: DashboardBubbleItem[]
  nefacturate: DashboardBubbleItem[]
  necesitaOferta: DashboardBubbleItem[]
  ofertate: DashboardBubbleItem[]
  statusOferteAcceptate: DashboardBubbleItem[]
  statusOferteRefuzate: DashboardBubbleItem[]
  equipmentStatus: DashboardBubbleItem[]
}

export interface PersonalBoard {
  dispatcher: { owner: string; items: DashboardBubbleItem[] }
  technicians: Array<{ name: string; items: DashboardBubbleItem[] }>
}

function getTodayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getTodayAt(hour: number, minute = 0): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

function toDate(input: any | undefined): Date | null {
  if (!input) return null
  // Firestore Timestamp or ISO or "dd.MM.yyyy HH:mm"
  try {
    if (typeof (input as any)?.toDate === "function") return (input as any).toDate()
  } catch {}
  if (typeof input === "string") {
    // try ISO first
    const dIso = new Date(input)
    if (!isNaN(dIso.getTime())) return dIso
    // fallback dd.MM.yyyy or dd.MM.yyyy HH:mm
    const [datePart, timePart = "00:00"] = input.split(" ")
    const [dd, mm, yyyy] = datePart.split(".")
    const [HH, MM] = timePart.split(":")
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function eqInsensitive(a?: string, ...candidates: string[]): boolean {
  const x = String(a || "").toLowerCase()
  return candidates.some((y) => x === String(y || "").toLowerCase())
}

function buildBubble(l: any): DashboardBubbleItem {
  const equipmentLabel = l.echipament || l.echipamentModel || l.echipamentCod || "-"
  return {
    id: String(l.id),
    locatie: String(l.locatie || "-"),
    equipmentLabel: String(equipmentLabel),
    client: l.client,
    nrLucrare: l.nrLucrare || l.numarRaport,
  }
}

export function useDashboardStatus() {
  const { userData } = useAuth()

  // Active works (exclude archived) - removing orderBy to avoid index issues
  const { data: lucrari, loading: loadingLucrari } = useFirebaseCollection<Lucrare>("lucrari", [
    where("statusLucrare", "!=", WORK_STATUS.ARCHIVED),
    limit(500),
  ])

  // Work assignment modifications today (for Intarziate cutoff at 18:00)
  const startOfToday = getTodayStart()
  const { data: modificariAtribuire, loading: loadingModificari } = useFirebaseCollection<any>("work_modifications", [
    where("modificationType", "==", "assignment"),
    where("modifiedAt", ">=", Timestamp.fromDate(startOfToday)),
    orderBy("modifiedAt", "desc"),
    limit(500),
  ])

  // Technicians list for personal board
  const { data: users, loading: loadingUsers } = useFirebaseCollection<any>("users")

  // Recompute at/after 18:00 without reload
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((x) => x + 1), 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Filter out archived works manually since query might not catch all
  const activeLucrari = useMemo(() => {
    if (!Array.isArray(lucrari)) return []
    return lucrari.filter((l) => {
      const status = String(l.statusLucrare || "").toLowerCase()
      return status !== WORK_STATUS.ARCHIVED.toLowerCase()
    })
  }, [lucrari])

  const buckets: DashboardBuckets = useMemo(() => {
    const res: DashboardBuckets = {
      intarziate: [],
      amanate: [],
      listate: [],
      nepreluate: [],
      nefacturate: [],
      necesitaOferta: [],
      ofertate: [],
      statusOferteAcceptate: [],
      statusOferteRefuzate: [],
      equipmentStatus: [],
    }

    if (!Array.isArray(activeLucrari) || activeLucrari.length === 0) return res

    const todayAt18 = getTodayAt(18, 0)
    const assignedTodayByWork: Record<string, Date> = {}
    for (const m of modificariAtribuire || []) {
      const wid = String((m as any).lucrareId || "")
      const t = toDate((m as any).modifiedAt)
      if (!wid || !t) continue
      if (!assignedTodayByWork[wid] || t > assignedTodayByWork[wid]) assignedTodayByWork[wid] = t
    }

    for (const l of activeLucrari) {
      const id = String(l.id || "")
      const status = String(l.statusLucrare || "")
      const technicians = Array.isArray(l.tehnicieni) ? l.tehnicieni : []
      const bubble = buildBubble(l)

      // Intarziate
      const assignedAt = assignedTodayByWork[id] || toDate(l.updatedAt)
      const noActionYet = !l.timpSosire && !l.equipmentVerified
      const consideredAssigned = technicians.length > 0 || eqInsensitive(status, WORK_STATUS.ASSIGNED)
      if (
        consideredAssigned &&
        noActionYet &&
        assignedAt && assignedAt >= startOfToday &&
        new Date() >= todayAt18 &&
        (eqInsensitive(status, WORK_STATUS.ASSIGNED) || eqInsensitive(status, WORK_STATUS.LISTED))
      ) {
        res.intarziate.push(bubble)
      }

      // Amânate
      if (eqInsensitive(status, WORK_STATUS.POSTPONED)) res.amanate.push(bubble)

      // Listate (fără tehnician)
      if (technicians.length === 0 && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) res.listate.push(bubble)

      // Nepreluate (raport generat, nepreluat)
      if (l.raportGenerat && !(l as any).preluatDispecer && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) res.nepreluate.push(bubble)

      // Nefacturate
      const hasInvoice = Boolean((l as any).numarFactura || (l as any).facturaDocument)
      const hasMotiv = Boolean((l as any).motivNefacturare)
      if (l.raportGenerat && !hasInvoice && !hasMotiv) res.nefacturate.push(bubble)

      // Necesită ofertă
      if ((l as any).necesitaOferta && !(l as any).offerResponse) res.necesitaOferta.push(bubble)

      // Ofertate (trimise, fără răspuns)
      const hasOffer = ((l as any).offerVersions && (l as any).offerVersions.length > 0) || (l as any).offerTotal
      if (hasOffer && !(l as any).offerResponse) res.ofertate.push(bubble)

      // Status oferte (acceptate/refuzate)
      const resp = (l as any).offerResponse
      if (resp?.status === "accept") res.statusOferteAcceptate.push(bubble)
      if (resp?.status === "reject") res.statusOferteRefuzate.push(bubble)

      // Stare echipament
      const se = String((l as any).statusEchipament || "").toLowerCase()
      if (["nefunctional", "nefunctionale", "partial", "partial functionale"].includes(se)) res.equipmentStatus.push(bubble)
    }

    return res
  }, [activeLucrari, modificariAtribuire, startOfToday])

  const personal: PersonalBoard = useMemo(() => {
    const dispatcherName = userData?.displayName || userData?.email || ""
    const active = activeLucrari || []

    const dispatcherItems = active
      .filter((l: any) => l.preluatDe === dispatcherName)
      .map(buildBubble)

    const techUsers = (users || []).filter((u: any) => u.role === "tehnician")
    const technicians = techUsers.map((u: any) => {
      const name = u.displayName || u.email || "Tehnician"
      const items = active.filter((l) => Array.isArray(l.tehnicieni) && l.tehnicieni.includes(name)).map(buildBubble)
      return { name, items }
    }).filter((c: any) => c.items.length > 0)

    return {
      dispatcher: { owner: dispatcherName, items: dispatcherItems },
      technicians,
    }
  }, [activeLucrari, users, userData?.displayName, userData?.email])

  const loading = loadingLucrari || loadingModificari || loadingUsers

  return { buckets, personal, loading }
}



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
  offerStatus?: "accept" | "reject"
  // Câmpuri pentru sortare specifică
  sortDate?: Date
  createdAt?: Date
}

export interface DashboardBuckets {
  intarziate: DashboardBubbleItem[]
  amanate: DashboardBubbleItem[]
  listate: DashboardBubbleItem[]
  nepreluate: DashboardBubbleItem[]
  nefacturate: DashboardBubbleItem[]
  necesitaOferta: DashboardBubbleItem[]
  ofertate: DashboardBubbleItem[]
  statusOferte: DashboardBubbleItem[]
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

function buildBubble(l: any, offerStatus?: "accept" | "reject", sortDate?: Date): DashboardBubbleItem {
  const equipmentLabel = l.echipament || l.echipamentModel || l.echipamentCod || "-"
  return {
    id: String(l.id),
    locatie: String(l.locatie || "-"),
    equipmentLabel: String(equipmentLabel),
    client: l.client,
    nrLucrare: l.nrLucrare || l.numarRaport,
    createdAt: toDate(l.createdAt) || undefined,
    sortDate: sortDate,
    offerStatus: offerStatus,
  }
}

function sortByDate(items: DashboardBubbleItem[]): DashboardBubbleItem[] {
  return items.sort((a, b) => {
    const dateA = a.sortDate || a.createdAt || new Date(0)
    const dateB = b.sortDate || b.createdAt || new Date(0)
    return dateA.getTime() - dateB.getTime()
  })
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

  // Status modifications for postponed date tracking
  const { data: modificariStatus, loading: loadingStatusModificari } = useFirebaseCollection<any>("work_modifications", [
    where("modificationType", "==", "status"),
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
      statusOferte: [],
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

    // Build map pentru data amânării (ultima modificare cu newValue = "Amânată")
    const postponedDateByWork: Record<string, Date> = {}
    for (const m of modificariStatus || []) {
      const wid = String((m as any).lucrareId || "")
      const newVal = String((m as any).newValue || "").toLowerCase()
      const t = toDate((m as any).modifiedAt)
      if (!wid || !t || newVal !== "amânată") continue
      if (!postponedDateByWork[wid] || t > postponedDateByWork[wid]) postponedDateByWork[wid] = t
    }

    for (const l of activeLucrari) {
      const id = String(l.id || "")
      const status = String(l.statusLucrare || "")
      const technicians = Array.isArray(l.tehnicieni) ? l.tehnicieni : []

      // Intarziate - sortate după data generării raportului (createdAt)
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
        res.intarziate.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
      }

      // Amânate - sortate după data amânării
      if (eqInsensitive(status, WORK_STATUS.POSTPONED)) {
        const postponedDate = postponedDateByWork[id] || toDate(l.updatedAt)
        res.amanate.push(buildBubble(l, undefined, postponedDate || undefined))
      }

      // Listate (fără tehnician) - sortate după data solicitării execuției (dataInterventie)
      if (technicians.length === 0 && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) {
        res.listate.push(buildBubble(l, undefined, toDate(l.dataInterventie) || undefined))
      }

      // Nepreluate (raport generat, nepreluat) - sortate după data generării raportului
      if (l.raportGenerat && !(l as any).preluatDispecer && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) {
        res.nepreluate.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
      }

      // Nefacturate - sortate după data generării raportului
      const hasInvoice = Boolean((l as any).numarFactura || (l as any).facturaDocument)
      const hasMotiv = Boolean((l as any).motivNefacturare)
      if (l.raportGenerat && !hasInvoice && !hasMotiv) {
        res.nefacturate.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
      }

      // Necesită ofertă - sortate după data generării raportului
      if ((l as any).necesitaOferta && !(l as any).offerResponse) {
        res.necesitaOferta.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
      }

      // Ofertate (trimise, fără răspuns) - sortate după data trimiterii ofertei
      const hasOffer = ((l as any).offerVersions && (l as any).offerVersions.length > 0) || (l as any).offerTotal
      if (hasOffer && !(l as any).offerResponse) {
        const offerDate = toDate((l as any).lastOfferEmail?.sentAt) || toDate((l as any).offerPreparedAt)
        res.ofertate.push(buildBubble(l, undefined, offerDate || undefined))
      }

      // Status oferte (acceptate/refuzate) - sortate după data primirii răspunsului
      const resp = (l as any).offerResponse
      if (resp?.status === "accept") {
        const responseDate = toDate(resp.at)
        res.statusOferte.push(buildBubble(l, "accept", responseDate || undefined))
      }
      if (resp?.status === "reject") {
        const responseDate = toDate(resp.at)
        res.statusOferte.push(buildBubble(l, "reject", responseDate || undefined))
      }

      // Stare echipament - sortate după data generării raportului
      const se = String((l as any).statusEchipament || "").toLowerCase()
      if (["nefunctional", "nefunctionale", "partial", "partial functionale"].includes(se)) {
        res.equipmentStatus.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
      }
    }

    // Sortăm toate bucket-urile după sortDate
    res.intarziate = sortByDate(res.intarziate)
    res.amanate = sortByDate(res.amanate)
    res.listate = sortByDate(res.listate)
    res.nepreluate = sortByDate(res.nepreluate)
    res.nefacturate = sortByDate(res.nefacturate)
    res.necesitaOferta = sortByDate(res.necesitaOferta)
    res.ofertate = sortByDate(res.ofertate)
    res.statusOferte = sortByDate(res.statusOferte)
    res.equipmentStatus = sortByDate(res.equipmentStatus)

    return res
  }, [activeLucrari, modificariAtribuire, modificariStatus, startOfToday])

  const personal: PersonalBoard = useMemo(() => {
    const active = activeLucrari || []

    // Lista de dispatcheri (admin + dispecer)
    const dispatcherUsers = (users || []).filter((u: any) => 
      u.role === "admin" || u.role === "dispecer"
    )
    const dispatcherNames = dispatcherUsers.map((u: any) => u.displayName || u.email || "")

    // Build map pentru data atribuirii (ultima modificare assignment pentru fiecare lucrare)
    const assignmentDateByWork: Record<string, Date> = {}
    for (const m of modificariAtribuire || []) {
      const wid = String((m as any).lucrareId || "")
      const t = toDate((m as any).modifiedAt)
      if (!wid || !t) continue
      if (!assignmentDateByWork[wid] || t > assignmentDateByWork[wid]) assignmentDateByWork[wid] = t
    }

    // Dispecer: toate lucrările preluate de orice dispecer, sortate după data generării raportului
    const dispatcherItems = sortByDate(
      active
        .filter((l: any) => {
          const preluatDe = l.preluatDe || ""
          // Verificăm dacă a fost preluat de un dispecer
          return dispatcherNames.includes(preluatDe)
        })
        .map((l: any) => buildBubble(l, undefined, toDate(l.createdAt) || undefined))
    )

    const techUsers = (users || []).filter((u: any) => u.role === "tehnician")
    const technicians = techUsers.map((u: any) => {
      const name = u.displayName || u.email || "Tehnician"
      const items = sortByDate(
        active.filter((l) => {
          const isAssignedToTechnician = Array.isArray(l.tehnicieni) && l.tehnicieni.includes(name)
          
          if (!isAssignedToTechnician) return false
          
          // Aplicăm aceleași reguli ca pentru vizualizarea tehnicianului pe telefon
          const isFinalized = l.statusLucrare === "Finalizat"
          const hasReportGenerated = l.raportGenerat === true
          const isPickedUpByDispatcher = (l as any).preluatDispecer === true
          const isCompletedWithReportAndPickedUp = isFinalized && hasReportGenerated && isPickedUpByDispatcher
          
          const isPostponed = eqInsensitive(l.statusLucrare, WORK_STATUS.POSTPONED)
          
          // NU afișa lucrările finalizate cu raport și preluate
          // NU afișa lucrările amânate și preluate
          return !isCompletedWithReportAndPickedUp && !(isPostponed && isPickedUpByDispatcher)
        }).map((l: any) => {
          // Sortare după data atribuirii
          const assignmentDate = assignmentDateByWork[l.id] || toDate(l.updatedAt)
          return buildBubble(l, undefined, assignmentDate || undefined)
        })
      )
      return { name, items }
    }).filter((c: any) => c.items.length > 0)

    return {
      dispatcher: { owner: "Dispecer", items: dispatcherItems },
      technicians,
    }
  }, [activeLucrari, users, modificariAtribuire])

  const loading = loadingLucrari || loadingModificari || loadingStatusModificari || loadingUsers

  return { buckets, personal, loading }
}



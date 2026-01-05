"use client"

import { useMemo, useEffect, useState } from "react"
import { Timestamp, where, orderBy, limit } from "firebase/firestore"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { WORK_STATUS, EQUIPMENT_STATUS } from "@/lib/utils/constants"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import type { DashboardStatusConfig } from "@/hooks/use-dashboard-status-settings"

export interface DashboardBubbleItem {
  id: string
  lucrareId?: string
  locatie: string
  equipmentLabel: string
  client?: string
  nrLucrare?: string
  offerStatus?: "accept" | "reject"
  equipmentStatus?: string
  contractId?: string
  // Câmpuri pentru sortare specifică
  sortDate?: Date
  createdAt?: Date
}

export interface DashboardBuckets {
  programatorRevizii: DashboardBubbleItem[]
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

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDateRO(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = String(d.getFullYear())
  return `${dd}.${mm}.${yyyy}`
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

function dateKeyFromAny(input: any | undefined): string | null {
  if (!input) return null
  if (typeof input === "string") {
    // ISO-ish date (YYYY-MM-DD...)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
  }
  const d = toDate(input)
  if (!d || Number.isNaN(d.getTime())) return null
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function eqInsensitive(a?: string, ...candidates: string[]): boolean {
  const x = String(a || "").toLowerCase()
  return candidates.some((y) => x === String(y || "").toLowerCase())
}

function buildBubble(l: any, offerStatus?: "accept" | "reject", sortDate?: Date, equipmentStatus?: string): DashboardBubbleItem {
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
    equipmentStatus: equipmentStatus,
  }
}

function buildRevisionScheduleBubble(params: {
  id: string
  contractId: string
  lucrareId?: string
  locatie: string
  equipmentLabel: string
  sortDate: Date
}): DashboardBubbleItem {
  return {
    id: params.id,
    lucrareId: params.lucrareId,
    contractId: params.contractId,
    locatie: params.locatie,
    equipmentLabel: params.equipmentLabel,
    sortDate: params.sortDate,
  }
}

function sortByDate(items: DashboardBubbleItem[]): DashboardBubbleItem[] {
  return items.sort((a, b) => {
    const dateA = a.sortDate || a.createdAt || new Date(0)
    const dateB = b.sortDate || b.createdAt || new Date(0)
    return dateA.getTime() - dateB.getTime()
  })
}

const DEFAULT_DASHBOARD_STATUS_CONFIG: DashboardStatusConfig = {
  intarziateEnabled: true,
  intarziateRequireExecDate: true,
  intarziateIncludePastDays: true,
  intarziateIncludeToday: true,
  intarziateTodayRequiresAfter18: true,
  intarziateRequireAssigned: true,
  intarziateRequireNotScanned: true,

  amanateEnabled: true,

  listateEnabled: true,
  listateRequireNoTechnicians: true,

  nepreluateEnabled: true,
  nepreluateRequireReportGenerated: true,
  nepreluateRequireNotPickedUp: true,

  nefacturateEnabled: true,
  nefacturateRequireReportGenerated: true,
  nefacturateRequireNoInvoice: true,
  nefacturateRequireNoReason: true,

  necesitaOfertaEnabled: true,
  necesitaOfertaRequireFlag: true,
  necesitaOfertaRequireNoResponse: true,

  ofertateEnabled: true,
  ofertateRequireHasOffer: true,
  ofertateRequireNoResponse: true,

  statusOferteEnabled: true,
  statusOferteIncludeAccept: true,
  statusOferteIncludeReject: true,

  equipmentStatusEnabled: true,
  equipmentStatusIncludeNonFunctional: true,
  equipmentStatusIncludePartiallyFunctional: true,
}

export function useDashboardStatus(config?: DashboardStatusConfig) {
  const { userData } = useAuth()

  // Active works (exclude archived) - removing orderBy to avoid index issues
  const { data: lucrari, loading: loadingLucrari } = useFirebaseCollection<Lucrare>("lucrari", [
    where("statusLucrare", "!=", WORK_STATUS.ARCHIVED),
    limit(500),
  ])

  // Contracts (for revision schedule preview / programator revizii)
  const { data: contracts, loading: loadingContracts } = useFirebaseCollection<any>("contracts", [limit(500)])

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
    const cfg = config || DEFAULT_DASHBOARD_STATUS_CONFIG
    const res: DashboardBuckets = {
      programatorRevizii: [],
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

    // Programator revizii: din contracts.revisionSchedulePreview, cu generateAt în următoarele 10 zile (azi..azi+10)
    if (cfg.programatorReviziiEnabled && Array.isArray(contracts) && contracts.length > 0) {
      // Dacă lucrările de revizie există deja, vrem să navigăm către lucrare (nu către contract).
      // Mapăm după contract + data intervenției (zi).
      const revizieWorkByContractAndDate: Record<string, string> = {}
      if (Array.isArray(activeLucrari) && activeLucrari.length > 0) {
        for (const l of activeLucrari) {
          const lucrareId = String((l as any)?.id || "")
          const contractId = String((l as any)?.contract || "")
          const tip = String((l as any)?.tipLucrare || "").toLowerCase()
          if (!lucrareId || !contractId) continue
          if (!tip.includes("reviz")) continue
          const dk = dateKeyFromAny((l as any)?.dataInterventie)
          if (!dk) continue
          const key = `${contractId}|${dk}`
          // păstrăm prima lucrare găsită pentru cheie
          if (!revizieWorkByContractAndDate[key]) revizieWorkByContractAndDate[key] = lucrareId
        }
      }

      const windowStart = startOfToday
      const windowEnd = addDays(startOfToday, 10)
      const maxTotal = 120
      const maxPerContract = 10

      for (const c of contracts) {
        if (res.programatorRevizii.length >= maxTotal) break
        const contractId = String((c as any)?.id || (c as any)?.docId || "")
        const contractNumber = String((c as any)?.number || (c as any)?.numar || "").trim()
        const contractName = String((c as any)?.name || "").trim()
        const preview = (c as any)?.revisionSchedulePreview
        if (!contractId || !Array.isArray(preview) || preview.length === 0) continue

        let added = 0
        for (const raw of preview) {
          if (res.programatorRevizii.length >= maxTotal) break
          if (added >= maxPerContract) break
          const scheduledIso = (raw as any)?.scheduledIso
          const generateIso = (raw as any)?.generateIso
          const locationName = String((raw as any)?.locationName || (raw as any)?.location || "-")
          const scheduledAt = scheduledIso ? new Date(String(scheduledIso)) : null
          const generateAt = generateIso ? new Date(String(generateIso)) : null
          if (!generateAt || Number.isNaN(generateAt.getTime())) continue
          if (generateAt < windowStart || generateAt > windowEnd) continue

          const scheduledOk = scheduledAt && !Number.isNaN(scheduledAt.getTime()) ? scheduledAt : null

          const genLabel = formatDateRO(generateAt)
          const schedLabel = scheduledOk ? formatDateRO(scheduledOk) : "-"
          const contractLabel = contractNumber ? contractNumber : contractName ? contractName : contractId
          const subtitle = `Gen: ${genLabel} • Rev: ${schedLabel} (${contractLabel})`
          const id = `${contractId}:${String(generateIso || scheduledIso || "")}:${locationName}`

          const scheduledKey = dateKeyFromAny(scheduledIso)
          const lucrareId = scheduledKey ? revizieWorkByContractAndDate[`${contractId}|${scheduledKey}`] : undefined

          res.programatorRevizii.push(
            buildRevisionScheduleBubble({
              id,
              contractId,
              lucrareId,
              locatie: locationName,
              equipmentLabel: subtitle,
              sortDate: generateAt,
            })
          )
          added += 1
        }
      }

      res.programatorRevizii = sortByDate(res.programatorRevizii)
    }

    if (!Array.isArray(activeLucrari) || activeLucrari.length === 0) return res

    const todayAt18 = getTodayAt(18, 0)
    const endOfToday = getTodayAt(23, 59)

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

      // Intarziate – logic refăcut:
      // dacă data programată (dataInterventie) este în trecut SAU este azi (după ora 18:00),
      // lucrarea este atribuită și nu are echipament scanat (equipmentVerified === false)
      if (cfg.intarziateEnabled) {
      const execDate = toDate(l.dataInterventie)
        if (cfg.intarziateRequireExecDate && !execDate) {
          // skip
        } else if (execDate) {
      const isAssigned = technicians.length > 0 || eqInsensitive(status, WORK_STATUS.ASSIGNED)
      const notScanned = !l.equipmentVerified
          const isPastDay = execDate < startOfToday
          const isToday = execDate >= startOfToday && execDate <= endOfToday

          let dateCondition = false
          if (isPastDay && cfg.intarziateIncludePastDays) dateCondition = true
          if (isToday && cfg.intarziateIncludeToday) {
            if (cfg.intarziateTodayRequiresAfter18) {
              if (new Date() >= todayAt18) dateCondition = true
            } else {
              dateCondition = true
            }
          }

          const assignedOk = cfg.intarziateRequireAssigned ? isAssigned : true
          const notScannedOk = cfg.intarziateRequireNotScanned ? notScanned : true

          if (dateCondition && assignedOk && notScannedOk) {
        // sortăm după data programării pentru relevanță
        res.intarziate.push(buildBubble(l, undefined, execDate || undefined))
          }
        }
      }

      // Amânate - sortate după data amânării
      if (cfg.amanateEnabled && eqInsensitive(status, WORK_STATUS.POSTPONED)) {
        const postponedDate = postponedDateByWork[id] || toDate(l.updatedAt)
        res.amanate.push(buildBubble(l, undefined, postponedDate || undefined))
      }

      // Listate (fără tehnician) - sortate după data solicitării execuției (dataInterventie)
      if (cfg.listateEnabled) {
        const noTechOk = cfg.listateRequireNoTechnicians ? technicians.length === 0 : true
        if (noTechOk && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) {
        res.listate.push(buildBubble(l, undefined, toDate(l.dataInterventie) || undefined))
        }
      }

      // Nepreluate (raport generat, nepreluat) - sortate după data generării raportului
      if (cfg.nepreluateEnabled) {
        const reportOk = cfg.nepreluateRequireReportGenerated ? Boolean(l.raportGenerat) : true
        const notPickedOk = cfg.nepreluateRequireNotPickedUp ? !(l as any).preluatDispecer : true
        if (reportOk && notPickedOk && !eqInsensitive(status, WORK_STATUS.ARCHIVED)) {
        res.nepreluate.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
        }
      }

      // Nefacturate - sortate după data generării raportului
      const hasInvoice = Boolean((l as any).numarFactura || (l as any).facturaDocument)
      const hasMotiv = Boolean((l as any).motivNefacturare)
      if (cfg.nefacturateEnabled) {
        const reportOk = cfg.nefacturateRequireReportGenerated ? Boolean(l.raportGenerat) : true
        const noInvoiceOk = cfg.nefacturateRequireNoInvoice ? !hasInvoice : true
        const noReasonOk = cfg.nefacturateRequireNoReason ? !hasMotiv : true
        if (reportOk && noInvoiceOk && noReasonOk) {
        res.nefacturate.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
        }
      }

      // Necesită ofertă - sortate după data generării raportului
      if (cfg.necesitaOfertaEnabled) {
        const flagOk = cfg.necesitaOfertaRequireFlag ? Boolean((l as any).necesitaOferta) : true
        const noRespOk = cfg.necesitaOfertaRequireNoResponse ? !(l as any).offerResponse : true
        if (flagOk && noRespOk) {
        res.necesitaOferta.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined))
        }
      }

      // Ofertate (trimise, fără răspuns) - sortate după data trimiterii ofertei
      const hasOffer = ((l as any).offerVersions && (l as any).offerVersions.length > 0) || (l as any).offerTotal
      if (cfg.ofertateEnabled) {
        const hasOfferOk = cfg.ofertateRequireHasOffer ? Boolean(hasOffer) : true
        const noRespOk = cfg.ofertateRequireNoResponse ? !(l as any).offerResponse : true
        if (hasOfferOk && noRespOk) {
        const offerDate = toDate((l as any).lastOfferEmail?.sentAt) || toDate((l as any).offerPreparedAt)
        res.ofertate.push(buildBubble(l, undefined, offerDate || undefined))
        }
      }

      // Status oferte (acceptate/refuzate) - sortate după data primirii răspunsului
      const resp = (l as any).offerResponse
      if (cfg.statusOferteEnabled) {
        if (cfg.statusOferteIncludeAccept && resp?.status === "accept") {
        const responseDate = toDate(resp.at)
        res.statusOferte.push(buildBubble(l, "accept", responseDate || undefined))
      }
        if (cfg.statusOferteIncludeReject && resp?.status === "reject") {
        const responseDate = toDate(resp.at)
        res.statusOferte.push(buildBubble(l, "reject", responseDate || undefined))
        }
      }

      // Stare echipament - sortate după data generării raportului
      // Include doar Parțial funcțional și Nefuncțional (exclude Funcțional)
      if (cfg.equipmentStatusEnabled) {
      const statusEchipament = (l as any).statusEchipament
        const isNonFunctional = eqInsensitive(statusEchipament, EQUIPMENT_STATUS.NON_FUNCTIONAL)
        const isPartial = eqInsensitive(statusEchipament, EQUIPMENT_STATUS.PARTIALLY_FUNCTIONAL)
        const shouldInclude =
          (isNonFunctional && cfg.equipmentStatusIncludeNonFunctional) ||
          (isPartial && cfg.equipmentStatusIncludePartiallyFunctional)

        if (shouldInclude) {
        res.equipmentStatus.push(buildBubble(l, undefined, toDate(l.createdAt) || undefined, statusEchipament))
        }
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
  }, [activeLucrari, contracts, modificariAtribuire, modificariStatus, startOfToday, config])

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

  const loading = loadingLucrari || loadingContracts || loadingModificari || loadingStatusModificari || loadingUsers

  return { buckets, personal, loading }
}



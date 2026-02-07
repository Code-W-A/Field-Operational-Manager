"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bug, Copy } from "lucide-react"
import { WORK_STATUS } from "@/lib/utils/constants"
import { useAuth } from "@/contexts/AuthContext"

function toDate(input: any | undefined): Date | null {
  if (!input) return null
  try {
    if (input instanceof Date) return input
    if (typeof input?.toDate === "function") return input.toDate()
    if (typeof input?.seconds === "number") return new Date(input.seconds * 1000)
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function getTodayAt(h: number, m: number) {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function getTodayStart() {
  return getTodayAt(0, 0)
}

function eqInsensitive(a: any, b: any) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase()
}

export function DevDebugPanel({ lucrare }: { lucrare: any }) {
  const { userData } = useAuth()
  const isAdmin = userData?.role === "admin"
  if (!isAdmin) return null

  const [open, setOpen] = useState(false)
  const [buildInfo, setBuildInfo] = useState<any>(null)
  const [buildInfoError, setBuildInfoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch("/api/build-info", { cache: "no-store" })
        const json = await res.json()
        if (cancelled) return
        setBuildInfo(json)
        setBuildInfoError(null)
      } catch (e: any) {
        if (cancelled) return
        setBuildInfo(null)
        setBuildInfoError(String(e?.message || e || "unknown"))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const computed = useMemo(() => {
    const l = lucrare || {}
    const status = String(l.statusLucrare || "")
    const statusFinalizareInterventie = String((l as any)?.statusFinalizareInterventie || "")
    const technicians = Array.isArray(l.tehnicieni) ? l.tehnicieni : []
    const semnaturaTehnician = String(l.semnaturaTehnician || "")
    const semnaturaBeneficiar = String(l.semnaturaBeneficiar || "")
    const raportSnapshot = (l as any)?.raportSnapshot || null
    const snapshotTechSig = String(raportSnapshot?.semnaturaTehnician || "")
    const snapshotClientSig = String(raportSnapshot?.semnaturaBeneficiar || "")
    const hasTechSignature = Boolean(semnaturaTehnician.trim())
    const hasClientSignature = Boolean(semnaturaBeneficiar.trim())
    const hasAnySignature = hasTechSignature || hasClientSignature
    const snapshotHasTechSig = Boolean(snapshotTechSig.trim())
    const snapshotHasClientSig = Boolean(snapshotClientSig.trim())
    const snapshotHasAnySig = snapshotHasTechSig || snapshotHasClientSig

    const execDate = toDate(l.dataInterventie)
    const now = new Date()
    const startOfToday = getTodayStart()
    const endOfToday = getTodayAt(23, 59)
    const todayAt18 = getTodayAt(18, 0)

    const isAssigned = technicians.length > 0 || eqInsensitive(status, WORK_STATUS.ASSIGNED)
    const notScanned = !l.equipmentVerified
    const notPickedUp = !(l as any).preluatDispecer
    const isPastDay = Boolean(execDate && execDate < startOfToday)
    const isToday = Boolean(execDate && execDate >= startOfToday && execDate <= endOfToday)
    const after18 = now >= todayAt18

    // Mirrors default dashboard config (see hooks/use-dashboard-status.ts)
    const dateCondition = Boolean(isPastDay || (isToday && after18))
    const intarziataByDashboardRules = Boolean(execDate && dateCondition && isAssigned && notScanned && notPickedUp)

    // Common archive-related flags (informational)
    const isFinalizat = eqInsensitive(status, WORK_STATUS.COMPLETED) || status === "Finalizat"
    const isFinalizatByReport = isFinalizat || statusFinalizareInterventie.toUpperCase() === "FINALIZAT"
    const raportGenerat = Boolean(l.raportGenerat)
    const preluatDispecer = Boolean(l.preluatDispecer)

    // "Preluare" (dispatcher/admin pickup) visibility rules are implemented in multiple places.
    // Keep the debug mirror explicit so admins can copy/paste reasons.
    const isTechnicianRole = userData?.role === "tehnician"
    const isAdminOrDispatcherRole = userData?.role === "admin" || userData?.role === "dispecer"
    const isPostponed = eqInsensitive(status, WORK_STATUS.POSTPONED) || status === WORK_STATUS.POSTPONED

    // /dashboard/lucrari (list) - shows the "Preia" button ONLY for completed-with-report, not for postponed.
    const list_shouldShowPreia =
      !isTechnicianRole && isFinalizatByReport && raportGenerat === true && preluatDispecer === false

    // /dashboard/lucrari/[id] (details) - shows "Preia lucrare" for completed-with-report OR postponed, if not already picked up.
    const details_shouldShowPreia =
      isAdminOrDispatcherRole &&
      preluatDispecer === false &&
      ((isFinalizatByReport && raportGenerat === true) || status === WORK_STATUS.POSTPONED)

    return {
      execDate: execDate ? execDate.toISOString() : null,
      now: now.toISOString(),
      isAssigned,
      techniciansCount: technicians.length,
      technicians,
      notScanned,
      notPickedUp,
      equipmentVerified: Boolean(l.equipmentVerified),
      isPastDay,
      isToday,
      after18,
      intarziataByDashboardRules,
      isFinalizat,
      isFinalizatByReport,
      statusFinalizareInterventie: statusFinalizareInterventie || null,
      raportGenerat,
      preluatDispecer,
      statusFinalizareInterventie: (l as any)?.statusFinalizareInterventie ?? null,
      // semnături (raw + snapshot)
      hasTechSignature,
      hasClientSignature,
      hasAnySignature,
      snapshotHasTechSig,
      snapshotHasClientSig,
      snapshotHasAnySig,
      numeTehnician: l.numeTehnician ?? null,
      numeBeneficiar: l.numeBeneficiar ?? null,
      raportDataLocked: Boolean((l as any)?.raportDataLocked),
      raportSnapshotExists: Boolean(raportSnapshot),
      raportSnapshotDataGenerare: raportSnapshot?.dataGenerare ?? null,
      // timestamps utile pentru “semnare”
      timpSosire: l.timpSosire ?? null,
      dataSosire: l.dataSosire ?? null,
      oraSosire: l.oraSosire ?? null,
      timpPlecare: l.timpPlecare ?? null,
      dataPlecare: l.dataPlecare ?? null,
      oraPlecare: l.oraPlecare ?? null,
      durataInterventie: l.durataInterventie ?? null,
      // context fields that are often suspected (but may or may not be used in preluare logic)
      tipLucrare: l.tipLucrare ?? null,
      lockedAfterReintervention: Boolean((l as any).lockedAfterReintervention),
      reinterventieMotiv: (l as any)?.reinterventieMotiv ?? null,
      mesajReatribuire: (l as any)?.mesajReatribuire ?? null,
      // preluare debug
      role: userData?.role ?? null,
      isTechnicianRole,
      isAdminOrDispatcherRole,
      isPostponed,
      list_shouldShowPreia,
      details_shouldShowPreia,
    }
  }, [lucrare, userData?.role])

  const jsonText = useMemo(() => {
    try {
      return JSON.stringify(lucrare ?? null, null, 2)
    } catch {
      return String(lucrare)
    }
  }, [lucrare])

  const preluareDebugText = useMemo(() => {
    const l = lucrare || {}
    const status = String(l.statusLucrare || "")
    const technicians = Array.isArray(l.tehnicieni) ? l.tehnicieni : []
    const technNames = technicians.map((t) => String(t)).filter(Boolean)
    const tipLucrare = String(l.tipLucrare || "")
    const statusFinalizareInterventie = String((l as any)?.statusFinalizareInterventie || "")
    const semnaturaTehnician = String(l.semnaturaTehnician || "")
    const semnaturaBeneficiar = String(l.semnaturaBeneficiar || "")
    const raportSnapshot = (l as any)?.raportSnapshot || null

    const lines: string[] = []
    lines.push("=== Preluare debug (dispecer/admin) ===")
    lines.push(`lucrare.id: ${String(l.id || "")}`)
    lines.push(`client: ${String(l.client || "")}`)
    lines.push(`locatie: ${String(l.locatie || "")}`)
    lines.push(`tipLucrare: ${tipLucrare}`)
    lines.push(`statusLucrare: ${status}`)
    lines.push(`statusFinalizareInterventie: ${statusFinalizareInterventie}`)
    lines.push(`raportGenerat: ${String(Boolean(l.raportGenerat))}`)
    lines.push(`preluatDispecer: ${String(Boolean(l.preluatDispecer))}`)
    lines.push(`lockedAfterReintervention: ${String(Boolean((l as any).lockedAfterReintervention))}`)
    lines.push(`reinterventieMotiv: ${String((l as any)?.reinterventieMotiv ?? "")}`)
    lines.push(`mesajReatribuire: ${String((l as any)?.mesajReatribuire ?? "")}`)
    lines.push(`tehnicieni (${technNames.length}): ${technNames.join(", ") || "-"}`)
    lines.push(`viewer.role: ${String(userData?.role || "")}`)
    lines.push("")
    lines.push("Semnături (raw + snapshot)")
    lines.push(`- semnaturaTehnician: ${semnaturaTehnician ? "DA" : "NU"}`)
    lines.push(`- semnaturaBeneficiar: ${semnaturaBeneficiar ? "DA" : "NU"}`)
    lines.push(`- numeTehnician: ${String(l.numeTehnician || "")}`)
    lines.push(`- numeBeneficiar: ${String(l.numeBeneficiar || "")}`)
    lines.push(`- raportDataLocked: ${String(Boolean((l as any)?.raportDataLocked))}`)
    lines.push(`- raportSnapshotExists: ${String(Boolean(raportSnapshot))}`)
    lines.push(`- raportSnapshot.dataGenerare: ${String(raportSnapshot?.dataGenerare || "")}`)
    lines.push(`- raportSnapshot.semnaturaTehnician: ${String(Boolean(raportSnapshot?.semnaturaTehnician))}`)
    lines.push(`- raportSnapshot.semnaturaBeneficiar: ${String(Boolean(raportSnapshot?.semnaturaBeneficiar))}`)
    lines.push("")
    lines.push("Timpuri (pentru raport/semnare)")
    lines.push(`- dataSosire: ${String(l.dataSosire || "")}`)
    lines.push(`- oraSosire: ${String(l.oraSosire || "")}`)
    lines.push(`- dataPlecare: ${String(l.dataPlecare || "")}`)
    lines.push(`- oraPlecare: ${String(l.oraPlecare || "")}`)
    lines.push(`- durataInterventie: ${String(l.durataInterventie || "")}`)
    lines.push("")

    lines.push("Context A: /dashboard/lucrari (LISTĂ) – butonul 'Preia' (coloana 'Preluat Dispecer')")
    lines.push(`- role != 'tehnician': ${String(!computed.isTechnicianRole)}`)
    lines.push(`- statusLucrare == 'Finalizat': ${String(status === "Finalizat")}`)
    lines.push(`- statusFinalizareInterventie == 'FINALIZAT': ${String(statusFinalizareInterventie.toUpperCase() === "FINALIZAT")}`)
    lines.push(`- raportGenerat == true: ${String(Boolean(l.raportGenerat) === true)}`)
    lines.push(`- preluatDispecer == false: ${String(Boolean(l.preluatDispecer) === false)}`)
    lines.push(`=> REZULTAT: ${computed.list_shouldShowPreia ? "ARATĂ butonul 'Preia'" : "NU arată butonul 'Preia'"}`)
    lines.push("")

    lines.push("Context B: /dashboard/lucrari/[id] (DETALII) – butonul 'Preia lucrare'")
    lines.push(`- role in {'admin','dispecer'}: ${String(computed.isAdminOrDispatcherRole)}`)
    lines.push(`- preluatDispecer == false: ${String(Boolean(l.preluatDispecer) === false)}`)
    lines.push(
      `- (Finalizat+raport) OR (Amânată): ${String(
        ((status === "Finalizat" || statusFinalizareInterventie.toUpperCase() === "FINALIZAT") && Boolean(l.raportGenerat) === true) ||
          status === WORK_STATUS.POSTPONED,
      )}`,
    )
    lines.push(`=> REZULTAT: ${computed.details_shouldShowPreia ? "ARATĂ butonul 'Preia lucrare'" : "NU arată butonul 'Preia lucrare'"}`)
    lines.push("")

    lines.push("Notă: câmpurile tipLucrare / reintervenție / tehnicieni sunt incluse aici ca 'context',")
    lines.push("dar butoanele de 'preluare dispecer' sunt decise în principal de statusLucrare/raportGenerat/preluatDispecer + rol.")

    return lines.join("\n")
  }, [lucrare, userData?.role, computed, ])

  return (
    <>
      {/* Admin-only debug button (kept behind NEXT_PUBLIC_ENABLE_DEBUG_PANEL) */}
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setOpen(true)}
          className="shadow-lg"
          variant="secondary"
        >
          <Bug className="h-4 w-4 mr-2" />
          Debug
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
          <div className="flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Debug (admin)</span>
              <div className="flex items-center gap-2">
                <Badge variant={computed.intarziataByDashboardRules ? "destructive" : "secondary"}>
                  Întârziată: {computed.intarziataByDashboardRules ? "DA" : "NU"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(preluareDebugText)
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiază debug preluare
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(jsonText)
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copiază JSON
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

            <Tabs defaultValue="build" className="mt-4 flex flex-col min-h-0">
              <TabsList className="self-start">
                <TabsTrigger value="build">Build</TabsTrigger>
                <TabsTrigger value="computed">Computed</TabsTrigger>
                <TabsTrigger value="preluare">Preluare</TabsTrigger>
                <TabsTrigger value="lucrare">Lucrare</TabsTrigger>
              </TabsList>

              <TabsContent value="build" className="mt-3 min-h-0">
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold mb-2">Build info (domain sanity)</div>
                  <ScrollArea className="h-[60vh]">
                    {buildInfoError ? (
                      <div className="text-xs text-red-600">Eroare: {buildInfoError}</div>
                    ) : (
                      <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(buildInfo, null, 2)}</pre>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="computed" className="mt-3 min-h-0">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2">Computed</div>
                  <ScrollArea className="h-[60vh]">
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(computed, null, 2)}</pre>
                  </ScrollArea>
            </div>
              </TabsContent>

              <TabsContent value="preluare" className="mt-3 min-h-0">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2">Preluare debug (copy/paste)</div>
                  <ScrollArea className="h-[60vh]">
              <pre className="text-xs whitespace-pre-wrap break-words">{preluareDebugText}</pre>
                  </ScrollArea>
            </div>
              </TabsContent>

              <TabsContent value="lucrare" className="mt-3 min-h-0">
            <div className="rounded-lg border">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="text-sm font-semibold">Lucrare (doc dump)</div>
                <div className="text-xs text-muted-foreground">scroll</div>
              </div>
              <ScrollArea className="h-[60vh] p-3">
                <pre className="text-xs whitespace-pre-wrap break-words">{jsonText}</pre>
              </ScrollArea>
            </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


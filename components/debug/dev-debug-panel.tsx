"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bug, Copy } from "lucide-react"
import { WORK_STATUS } from "@/lib/utils/constants"

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
  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"
  if (!enabled) return null

  const [open, setOpen] = useState(false)

  const computed = useMemo(() => {
    const l = lucrare || {}
    const status = String(l.statusLucrare || "")
    const technicians = Array.isArray(l.tehnicieni) ? l.tehnicieni : []

    const execDate = toDate(l.dataInterventie)
    const now = new Date()
    const startOfToday = getTodayStart()
    const endOfToday = getTodayAt(23, 59)
    const todayAt18 = getTodayAt(18, 0)

    const isAssigned = technicians.length > 0 || eqInsensitive(status, WORK_STATUS.ASSIGNED)
    const notScanned = !l.equipmentVerified
    const isPastDay = Boolean(execDate && execDate < startOfToday)
    const isToday = Boolean(execDate && execDate >= startOfToday && execDate <= endOfToday)
    const after18 = now >= todayAt18

    // Mirrors default dashboard config (see hooks/use-dashboard-status.ts)
    const dateCondition = Boolean(isPastDay || (isToday && after18))
    const intarziataByDashboardRules = Boolean(execDate && dateCondition && isAssigned && notScanned)

    // Common archive-related flags (informational)
    const isFinalizat = eqInsensitive(status, WORK_STATUS.COMPLETED) || status === "Finalizat"
    const raportGenerat = Boolean(l.raportGenerat)
    const preluatDispecer = Boolean(l.preluatDispecer)

    return {
      execDate: execDate ? execDate.toISOString() : null,
      now: now.toISOString(),
      isAssigned,
      techniciansCount: technicians.length,
      notScanned,
      equipmentVerified: Boolean(l.equipmentVerified),
      isPastDay,
      isToday,
      after18,
      intarziataByDashboardRules,
      isFinalizat,
      raportGenerat,
      preluatDispecer,
    }
  }, [lucrare])

  const jsonText = useMemo(() => {
    try {
      return JSON.stringify(lucrare ?? null, null, 2)
    } catch {
      return String(lucrare)
    }
  }, [lucrare])

  return (
    <>
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Debug (development)</span>
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2">Computed</div>
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(computed, null, 2)}</pre>
            </div>

            <div className="rounded-lg border">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="text-sm font-semibold">Lucrare (doc dump)</div>
                <div className="text-xs text-muted-foreground">scroll</div>
              </div>
              <ScrollArea className="h-[60vh] p-3">
                <pre className="text-xs whitespace-pre-wrap break-words">{jsonText}</pre>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


"use client"

import { useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, Pencil, X, Clock, MapPin, Briefcase, Calendar, Copy, Image as ImageIcon, ExternalLink } from "lucide-react"
import { doc, getDoc } from "firebase/firestore"
import type { TimesheetCell } from "@/lib/hr/types"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/AuthContext"
import { markHrRequestTimesheetCleared } from "@/lib/hr/storage"
import { normalizeTimeHHmmLoose } from "@/lib/utils/time-input"
import { calcEffectiveMinutes, type HMRange, minutesToHM as minutesToHMUtil } from "@/lib/hr/time-calc"
import { db } from "@/lib/firebase/config"
import type { AttendanceLocation, AttendanceSession } from "@/types/attendance"
import { getGoogleMapsUrl } from "@/lib/attendance/location"

type LocationDialogData = {
  startTime: string
  endTime?: string
  startLocation?: AttendanceLocation
  endLocation?: AttendanceLocation
  endMissingMessage: string
}

function isValidAttendanceLocation(value: unknown): value is AttendanceLocation {
  const location = value as AttendanceLocation | undefined
  return Boolean(
    location &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    Math.abs(location.lat) <= 90 &&
    Math.abs(location.lng) <= 180
  )
}

function LocationDetails({
  title,
  time,
  location,
  missingMessage,
}: {
  title: string
  time?: string
  location?: AttendanceLocation
  missingMessage: string
}) {
  const validLocation = isValidAttendanceLocation(location) ? location : undefined
  return (
    <section className="rounded-lg border bg-slate-50 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {time ? <span className="font-mono text-sm text-slate-600">{time}</span> : null}
      </div>
      {validLocation ? (
        <>
          <div className="flex items-start gap-2 text-sm text-slate-700">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <div className="min-w-0 space-y-1">
              {validLocation.address ? <p className="break-words">{validLocation.address}</p> : null}
              <p className="font-mono text-xs text-slate-600">
                {validLocation.lat.toFixed(6)}, {validLocation.lng.toFixed(6)}
              </p>
            </div>
          </div>
          <a
            href={getGoogleMapsUrl(validLocation)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
          >
            Deschide în Google Maps <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{missingMessage}</p>
      )}
    </section>
  )
}

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function findOverlapPair(entries: Array<{ start: string; end: string }>) {
  const ranges = entries
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en, label: `${e.start}–${e.end}` }
    })
    .filter(Boolean) as Array<{ start: number; end: number; label: string }>
  if (ranges.length <= 1) return null
  ranges.sort((a, b) => (a.start - b.start) || (a.end - b.end))
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      return { a: ranges[i - 1].label, b: ranges[i].label }
    }
  }
  return null
}

function isValidInterval(it: { start: string; end: string }) {
  const s = parseHM(it.start)
  const en = parseHM(it.end)
  return s != null && en != null && s < en
}

function isValidBreak(it: { start: string; end: string }) {
  // same validation as intervals; kept separate for clarity
  return isValidInterval(it)
}

function sortEntries<T extends { start: string; end: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const sa = parseHM(a.start) ?? 0
    const sb = parseHM(b.start) ?? 0
    const ea = parseHM(a.end) ?? 0
    const eb = parseHM(b.end) ?? 0
    return (sa - sb) || (ea - eb)
  })
}

function minutesToHM(total: number) {
  return minutesToHMUtil(total)
}

function calcMinutes(cell: TimesheetCell | undefined, defaultBreak?: HMRange | null) {
  const entries = (cell?.entries ?? []) as any
  const breaks = (cell?.breaks ?? null) as any
  return calcEffectiveMinutes({ entries, breaks, defaultBreak: defaultBreak ?? null })
}

export function DayEntryPopover({
  open,
  onOpenChange,
  title,
  subtitle,
  cell,
  activeSessionStart,
  activeSession,
  anchorRect,
  approvedRequestLabel,
  onOpenEditApprovedRequest,
  onOpenAddDialog,
  onOpenDeleteDialog,
  onSaveCell,
  dateISO,
  defaultBreak,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle: string
  cell: TimesheetCell | undefined
  activeSessionStart?: string | null
  activeSession?: AttendanceSession | null
  anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } | null
  approvedRequestLabel?: string | null
  onOpenEditApprovedRequest?: (() => void) | null
  onOpenAddDialog: () => void
  onOpenDeleteDialog: () => void
  onSaveCell: (next: TimesheetCell) => Promise<void>
  dateISO?: string | null
  defaultBreak?: HMRange | null
}) {
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"
  const { user, userData } = useAuth()
  const canViewSelfies = userData?.role === "admin" || userData?.role === "dispecer"
  const [verificariOpen, setVerificariOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [travelToClient, setTravelToClient] = useState(false)
  const [selfieDialogOpen, setSelfieDialogOpen] = useState(false)
  const [selfieDialogTitle, setSelfieDialogTitle] = useState<string>("Selfie")
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [selfieLoading, setSelfieLoading] = useState(false)
  const [locationDialogOpen, setLocationDialogOpen] = useState(false)
  const [locationDialogData, setLocationDialogData] = useState<LocationDialogData | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const attendanceCacheRef = useRef(new Map<string, Record<string, any> | null>())
  const [clearCoBusy, setClearCoBusy] = useState(false)

  const minutes = useMemo(() => calcMinutes(cell, defaultBreak), [cell, defaultBreak])

  const entries = cell?.entries ?? []
  type Entry = NonNullable<TimesheetCell["entries"]>[number]
  const breaks = (cell?.breaks ?? []) as Array<{ start: string; end: string }>
  const validBreaks = breaks.filter((b) => isValidBreak(b))
  const breaksLabel = validBreaks.length ? validBreaks.map((b) => `${b.start}–${b.end}`).join(", ") : ""
  const showImplicitBreak = !breaksLabel && Boolean(defaultBreak)

  const openSelfie = (title: string, url?: string) => {
    if (!url) return
    setSelfieDialogTitle(title)
    setSelfieUrl(url)
    setSelfieDialogOpen(true)
  }

  const loadAttendanceSession = async (sessionId: string) => {
    if (attendanceCacheRef.current.has(sessionId)) {
      return attendanceCacheRef.current.get(sessionId) ?? null
    }
    const snap = await getDoc(doc(db, "attendance", sessionId))
    const data = snap.exists() ? (snap.data() as Record<string, any>) : null
    attendanceCacheRef.current.set(sessionId, data)
    return data
  }

  const openSelfieForEntry = async (title: string, entry: Entry, kind: "start" | "end") => {
    const directUrl = kind === "start" ? (entry as any).selfieStartUrl : (entry as any).selfieEndUrl
    if (directUrl) {
      openSelfie(title, String(directUrl))
      return
    }

    const sessionId = (entry as any).attendanceSessionId ? String((entry as any).attendanceSessionId) : ""
    if (!sessionId) {
      toast({
        title: "Selfie lipsă",
        description: "Nu există ID de sesiune asociat pentru acest interval.",
        variant: "destructive",
      })
      return
    }

    try {
      setSelfieLoading(true)
      const data = await loadAttendanceSession(sessionId)
      const url =
        kind === "start" ? (data?.checkInSelfieUrl as string | undefined) : (data?.checkOutSelfieUrl as string | undefined)
      if (!url) {
        toast({
          title: "Selfie lipsă",
          description: "Nu există selfie salvat pentru acest capăt de interval.",
          variant: "destructive",
        })
        return
      }
      openSelfie(title, url)
    } catch (e) {
      toast({
        title: "Eroare",
        description: e instanceof Error ? e.message : "Nu am putut încărca selfie-ul.",
        variant: "destructive",
      })
    } finally {
      setSelfieLoading(false)
    }
  }

  const openLocationsForEntry = async (entry: Entry) => {
    if (!canViewSelfies) return
    const sessionId = (entry as any).attendanceSessionId ? String((entry as any).attendanceSessionId) : ""
    if (!sessionId) {
      toast({
        title: "Locații indisponibile",
        description: "Intervalul nu este asociat unei sesiuni de pontaj.",
        variant: "destructive",
      })
      return
    }
    try {
      setLocationLoading(true)
      const data = await loadAttendanceSession(sessionId)
      if (!data) {
        toast({
          title: "Sesiune indisponibilă",
          description: "Documentul de pontaj asociat nu mai există.",
          variant: "destructive",
        })
        return
      }
      setLocationDialogData({
        startTime: entry.start,
        endTime: entry.end,
        startLocation: isValidAttendanceLocation(data.location) ? data.location : undefined,
        endLocation: isValidAttendanceLocation(data.checkOutLocation) ? data.checkOutLocation : undefined,
        endMissingMessage: data.checkOutAuto
          ? "Depontarea a fost automată; locația de stop nu a fost înregistrată."
          : "Locația de stop nu a fost înregistrată.",
      })
      setLocationDialogOpen(true)
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu am putut încărca locațiile pontajului.",
        variant: "destructive",
      })
    } finally {
      setLocationLoading(false)
    }
  }

  const openActiveSessionLocation = () => {
    if (!canViewSelfies || !activeSession) return
    setLocationDialogData({
      startTime: activeSessionStart || "În lucru",
      startLocation: isValidAttendanceLocation(activeSession.location) ? activeSession.location : undefined,
      endMissingMessage: "Sesiunea este încă activă; locația de stop va fi disponibilă după depontare.",
    })
    setLocationDialogOpen(true)
  }

  const clearCo = async () => {
    if (!canViewSelfies) return // same role gate: admin/dispecer
    if ((cell?.code as any) !== "CO") return
    const sourceRequestId = (cell as any)?.sourceRequestId ? String((cell as any).sourceRequestId) : ""
    const confirmed = window.confirm(
      "Sigur vrei să elimini complet codul CO din condică pentru această zi? (Nu modifică cererea HR; doar curăță celula din condică.)"
    )
    if (!confirmed) return
    try {
      setClearCoBusy(true)
      const next: TimesheetCell = {
        ...(cell ?? { code: "EMPTY" }),
        code: "EMPTY",
      }
      // Remove computed/manual fields to truly clear the day
      delete (next as any).hours
      delete (next as any).entries
      delete (next as any).breaks
      delete (next as any).sourceRequestId
      delete (next as any).sourceRequestKind
      await onSaveCell(next)
      if (sourceRequestId && user?.uid) {
        // Best-effort audit note on the HR request, so lists show that the CO was cleared after approval.
        try {
          await markHrRequestTimesheetCleared({
            requestId: sourceRequestId,
            clearedByUid: user.uid,
            clearedByRole: userData?.role || undefined,
            dateISO: dateISO ? String(dateISO) : undefined,
            note: "CO eliminat din condică după aprobare.",
          })
        } catch (e) {
          // Non-blocking: condica was cleared; we just couldn't write the audit note.
          console.warn("Failed to mark hrRequest as cleared-from-timesheet:", e)
        }
      }
      toast({ title: "CO eliminat", description: "Codul CO a fost eliminat din condică pentru această zi." })
    } catch (e) {
      toast({
        title: "Eroare",
        description: e instanceof Error ? e.message : "Nu am putut elimina CO.",
        variant: "destructive",
      })
    } finally {
      setClearCoBusy(false)
    }
  }

  const startEdit = (idx: number) => {
    const e = entries[idx]
    setEditingIdx(idx)
    setStart(e?.start ?? "")
    setEnd(e?.end ?? "")
    setTravelToClient(Boolean((e as any)?.travelToClient))
    setEditDialogOpen(true)
  }

  const resetEdit = () => {
    setEditingIdx(null)
    setStart("")
    setEnd("")
    setTravelToClient(false)
    setEditDialogOpen(false)
  }

  const saveEdit = async () => {
    // Validate the current edited interval (avoid 07:03–07:03 or 07:04–06:37)
    if (!isValidInterval({ start, end })) {
      toast({
        title: "Interval invalid",
        description: "Ora de sfârșit trebuie să fie după ora de început.",
        variant: "destructive",
      })
      return
    }

    const nextEntries = [...entries]
    const item = { start, end, travelToClient: travelToClient ? true : undefined }
    if (editingIdx === null) nextEntries.push(item as any)
    else nextEntries[editingIdx] = { ...(nextEntries[editingIdx] as any), ...item }

    // If there are already invalid entries, block save so we don't keep corrupt data.
    const invalidIdx = nextEntries.findIndex((e) => !isValidInterval(e))
    if (invalidIdx !== -1) {
      toast({
        title: "Există intervale invalide",
        description: `Intervalul #${invalidIdx + 1} este invalid. Corectează-l sau folosește „Curăță intervale”.`,
        variant: "destructive",
      })
      return
    }

    const sortedEntries = sortEntries(nextEntries)
    const overlap = findOverlapPair(nextEntries)
    if (overlap) {
      toast({
        title: "Intervale suprapuse",
        description: `Conflict între ${overlap.a} și ${overlap.b}.`,
        variant: "destructive",
      })
      return
    }

    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      code: (cell?.code ?? "WORK") === "EMPTY" ? "WORK" : (cell?.code ?? "WORK"),
      entries: sortedEntries,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: sortedEntries }, defaultBreak) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    resetEdit()
  }

  const cleanIntervals = async () => {
    const current = entries
    if (!current.length) return
    const cleaned = sortEntries(current.filter((e) => isValidInterval(e)))
    const removed = current.length - cleaned.length
    if (removed === 0 && cleaned.every((e, i) => e === current[i])) {
      toast({ title: "Nimic de curățat", description: "Intervalele sunt deja valide." })
      return
    }
    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      code: (cell?.code ?? "WORK") === "EMPTY" ? "WORK" : (cell?.code ?? "WORK"),
      entries: cleaned as any,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: cleaned as any }, defaultBreak) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    toast({
      title: "Intervale curățate",
      description: removed > 0 ? `Am eliminat ${removed} interval(e) invalid(e).` : "Am ordonat intervalele.",
    })
  }

  const deleteEntry = async (idx: number) => {
    const nextEntries = entries.filter((_, i) => i !== idx)
    const next: TimesheetCell = {
      ...(cell ?? { code: "WORK" }),
      entries: nextEntries,
      hours: Math.round((calcMinutes({ ...(cell ?? { code: "WORK" }), entries: nextEntries }, defaultBreak) / 60) * 100) / 100,
    }
    await onSaveCell(next)
    if (editingIdx === idx) resetEdit()
  }

  const virtualRef = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null)
  if (anchorRect) {
    virtualRef.current = {
      getBoundingClientRect: () =>
        new DOMRect(anchorRect.left, anchorRect.top, anchorRect.width, anchorRect.height),
    }
  } else {
    virtualRef.current = null
  }

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        {virtualRef.current ? <PopoverAnchor virtualRef={virtualRef as any} /> : null}
        <PopoverContent
          data-testid="condica-day-detail"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-[400px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-24px)] p-0 overflow-auto border shadow-xl bg-white"
        >
          <div className="rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-start justify-between">
              <div>
                <div className="text-xs text-gray-600">{subtitle}</div>
                <div className="text-base font-semibold text-gray-900">{title}</div>
              </div>
              <div className="flex items-center gap-2">
                {debugEnabled && (
                  <Button
                    variant="secondary"
                    size="icon"
                    title="Copiază JSON (debug)"
                    className="h-8 w-8 [&_svg]:size-4"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(cell ?? null, null, 2))
                        console.log("[CONDICA] cell json copied")
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 [&_svg]:size-4"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="p-3.5 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-gray-600 font-medium">Detalii</div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVerificariOpen(true)}
                    className="h-8 text-xs"
                  >
                    Verificări pontaj
                  </Button>
                  {canViewSelfies && cell?.code === "CO" ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void clearCo()}
                      disabled={clearCoBusy}
                      className="h-8 text-xs"
                      title="Elimină complet CO din această zi"
                    >
                      {clearCoBusy ? "Se elimină…" : "Elimină CO"}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={onOpenAddDialog}
                    title="Adaugă timp"
                    className="h-8 w-8 [&_svg]:size-4"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={onOpenDeleteDialog}
                    title="Șterge pontajul"
                    className="h-8 w-8 [&_svg]:size-4"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {approvedRequestLabel ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-900">Cerere aprobată</div>
                      <div className="text-xs text-amber-900/90 mt-0.5 break-words">{approvedRequestLabel}</div>
                    </div>
                    {onOpenEditApprovedRequest ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-amber-300 bg-white hover:bg-amber-100"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onOpenEditApprovedRequest()
                        }}
                        title="Editează cererea aprobată"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Editează
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-gray-600">Total timp</div>
                    <div data-testid="condica-day-total" className="text-xl font-semibold text-gray-900">{minutesToHM(minutes)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Pauză înregistrată</div>
                    <div className="text-xs text-gray-700">{breaksLabel || "—"}</div>
                    {showImplicitBreak && defaultBreak ? (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Pauză implicită (fișă/standard):{" "}
                        <span className="font-mono">{defaultBreak.start}–{defaultBreak.end}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <Separator className="my-3 bg-gray-200" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900">Timp înregistrat</div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={cleanIntervals} className="h-7 text-xs">
                        Curăță intervale
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingIdx(null)
                          setStart("08:00")
                          setEnd("16:00")
                          setTravelToClient(false)
                          setEditDialogOpen(true)
                        }}
                        className="h-7 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Adaugă interval
                      </Button>
                    </div>
                  </div>

                  {entries.length === 0 && activeSessionStart ? (
                    <div className="space-y-2">
                      <div className="rounded-lg bg-emerald-50 border-2 border-emerald-200 px-3 py-2">
                        <div className="text-xs text-emerald-700 font-medium">În lucru</div>
                        <div className="mt-1 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-emerald-600" />
                          <div className="font-mono text-sm font-bold text-emerald-900">
                            {activeSessionStart}
                          </div>
                          {canViewSelfies && activeSession ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="ml-auto h-7 px-2 text-xs"
                              onClick={openActiveSessionLocation}
                            >
                              <MapPin className="h-3.5 w-3.5 mr-1" />
                              Locație start
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : entries.length === 0 ? (
                    <div className="text-center py-4 px-3 rounded-lg bg-gray-50 border-2 border-dashed border-gray-300">
                      <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <div className="text-xs text-gray-600 font-medium">Nu există intervale înregistrate</div>
                      <div className="text-xs text-gray-500 mt-1">Apasă "Adaugă interval" pentru a începe</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {entries.map((e, idx) => (
                        <div key={idx} data-testid={`condica-day-entry-${idx}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 px-3 py-2 hover:border-blue-400 transition-all">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-600" />
                            <div className="font-mono text-sm font-bold text-gray-900">
                              {e.start} – {e.end}
                            </div>
                            {Boolean((e as any)?.travelToClient) && (
                              <span className="ml-1 rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                TRASEU
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                            {canViewSelfies && Boolean((e as any).attendanceSessionId) ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => void openLocationsForEntry(e as Entry)}
                                disabled={locationLoading}
                                aria-label={`Locații pontaj ${e.start}–${e.end}`}
                              >
                                <MapPin className="h-3.5 w-3.5 mr-1" />
                                Locații
                              </Button>
                            ) : null}
                            {canViewSelfies && (
                              <div className="flex items-center gap-1 mr-1">
                                {(Boolean((e as any).selfieStartUrl) || Boolean((e as any).attendanceSessionId)) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void openSelfieForEntry(`Selfie Start (${e.start})`, e as Entry, "start")}
                                    title="Vezi selfie la început"
                                    disabled={selfieLoading}
                                  >
                                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                                    Start
                                  </Button>
                                )}
                                {(Boolean((e as any).selfieEndUrl) || Boolean((e as any).attendanceSessionId)) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void openSelfieForEntry(`Selfie Stop (${e.end})`, e as Entry, "end")}
                                    title="Vezi selfie la sfârșit"
                                    disabled={selfieLoading}
                                  >
                                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                                    Stop
                                  </Button>
                                )}
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(idx)}
                              title="Editează intervalul"
                              className="h-8 w-8 hover:bg-blue-100 text-blue-700 hover:text-blue-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteEntry(idx)}
                              title="Șterge intervalul"
                              className="h-8 w-8 hover:bg-red-100 text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {activeSessionStart && activeSession ? (
                        <div className="rounded-lg bg-emerald-50 border-2 border-emerald-200 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-emerald-600" />
                            <div className="text-xs font-medium text-emerald-700">În lucru din</div>
                            <div className="font-mono text-sm font-bold text-emerald-900">{activeSessionStart}</div>
                            {canViewSelfies ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="ml-auto h-7 px-2 text-xs"
                                onClick={openActiveSessionLocation}
                              >
                                <MapPin className="h-3.5 w-3.5 mr-1" />
                                Locație start
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={selfieDialogOpen} onOpenChange={setSelfieDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{selfieDialogTitle}</DialogTitle>
          </DialogHeader>
          {selfieUrl ? (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden bg-black/5">
                <img src={selfieUrl} alt={selfieDialogTitle} className="w-full h-auto max-h-[70vh] object-contain" />
              </div>
              <div className="flex justify-end">
                <a
                  href={selfieUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  Deschide în tab nou <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Nu există selfie pentru acest interval.</div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={locationDialogOpen}
        onOpenChange={(open) => {
          setLocationDialogOpen(open)
          if (!open) setLocationDialogData(null)
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Locații pontaj</DialogTitle>
          </DialogHeader>
          {locationDialogData ? (
            <div className="space-y-3">
              <LocationDetails
                title="Pontare / Start"
                time={locationDialogData.startTime}
                location={locationDialogData.startLocation}
                missingMessage="Locația de start nu a fost înregistrată."
              />
              <LocationDetails
                title="Depontare / Stop"
                time={locationDialogData.endTime}
                location={locationDialogData.endLocation}
                missingMessage={locationDialogData.endMissingMessage}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Locațiile nu sunt disponibile.</p>
          )}
        </DialogContent>
      </Dialog>
      <VerificariDialog
        open={verificariOpen}
        onOpenChange={setVerificariOpen}
        subtitle={subtitle}
        title={title}
        cell={cell}
        minutes={minutes}
        entries={entries}
        approvedRequestLabel={approvedRequestLabel}
      />
      <EditIntervalDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingIdx={editingIdx}
        start={start}
        end={end}
        travelToClient={travelToClient}
        onStartChange={setStart}
        onEndChange={setEnd}
        onTravelToClientChange={setTravelToClient}
        onSave={saveEdit}
        onCancel={resetEdit}
      />
    </>
  )
}

function EditIntervalDialog({
  open,
  onOpenChange,
  editingIdx,
  start,
  end,
  travelToClient,
  onStartChange,
  onEndChange,
  onTravelToClientChange,
  onSave,
  onCancel,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingIdx: number | null
  start: string
  end: string
  travelToClient: boolean
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onTravelToClientChange: (v: boolean) => void
  onSave: () => Promise<void>
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Clock className="h-5 w-5 text-blue-600" />
            {editingIdx === null ? "Adaugă interval de lucru" : `Editează interval #${editingIdx + 1}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
            Setează ora de început și ora de încheiere pentru acest interval de lucru.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-sm text-gray-700 font-semibold flex items-center gap-1">
                <span className="text-green-600">▶</span> Început
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="08:00"
                pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                title="Format 24h: HH:mm (ex: 08:00, 16:30)"
                value={start}
                onChange={(e) => onStartChange(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                onBlur={() => {
                  const normalized = normalizeTimeHHmmLoose(start)
                  if (normalized === null) {
                    toast({
                      title: "Oră invalidă",
                      description: "Folosește formatul 24h HH:mm (ex: 08:00).",
                      variant: "destructive",
                    })
                    return
                  }
                  if (normalized !== start) onStartChange(normalized)
                }}
                className="bg-white border-gray-300 text-gray-900 text-lg font-mono h-12"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm text-gray-700 font-semibold flex items-center gap-1">
                <span className="text-red-600">■</span> Sfârșit
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="16:30"
                pattern="^([01]\\d|2[0-3]):[0-5]\\d$"
                title="Format 24h: HH:mm (ex: 08:00, 16:30)"
                value={end}
                onChange={(e) => onEndChange(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
                onBlur={() => {
                  const normalized = normalizeTimeHHmmLoose(end)
                  if (normalized === null) {
                    toast({
                      title: "Oră invalidă",
                      description: "Folosește formatul 24h HH:mm (ex: 16:30).",
                      variant: "destructive",
                    })
                    return
                  }
                  if (normalized !== end) onEndChange(normalized)
                }}
                className="bg-white border-gray-300 text-gray-900 text-lg font-mono h-12"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="travelToClient"
              type="checkbox"
              checked={travelToClient}
              onChange={(e) => onTravelToClientChange(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="travelToClient" className="text-sm text-gray-700">
              Traseu la client
            </Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} size="sm">
              Anulează
            </Button>
            <Button onClick={onSave} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Clock className="h-4 w-4 mr-1" />
              Salvează
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VerificariDialog({
  open,
  onOpenChange,
  subtitle,
  title,
  cell,
  minutes,
  entries,
  approvedRequestLabel,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  subtitle: string
  title: string
  cell: TimesheetCell | undefined
  minutes: number
  entries: Array<{ start: string; end: string; methodStart?: string; methodEnd?: string; project?: string }>
  approvedRequestLabel?: string | null
}) {
  const hasEntries = Array.isArray(entries) && entries.length > 0
  const approvedKindLabel = (() => {
    const s = String(approvedRequestLabel || "").trim()
    if (!s) return ""
    // label format in condica-page is: "{Kind} • ..." so we keep only the kind part for status.
    return s.split("•")[0]?.trim() || s
  })()
  const code = (cell?.code || "EMPTY") as any
  const statusLabel =
    code === "WORK"
      ? "Lucrat"
      : code === "CO"
        ? "Concediu (CO)"
        : code === "CFP"
          ? "Concediu fără plată (CFP)"
          : code === "CM"
            ? "Concediu medical (CM)"
            : code === "DEL"
              ? "Delegație (DEL)"
              : code === "IN"
                ? "Învoire (IN)"
                : code === "SL"
                  ? "Sărbătoare legală (SL)"
                  : code === "WE"
                    ? "Weekend (WE)"
                    : approvedKindLabel
                      ? `${approvedKindLabel} (aprobat)`
                      : hasEntries
                        ? "Pontat"
                        : "Necompletat"
  const statusClass =
    code === "WORK" || hasEntries
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : code === "CO"
        ? "bg-yellow-100 text-yellow-900 border border-yellow-300"
        : code === "CFP"
          ? "bg-orange-100 text-orange-700 border border-orange-200"
          : code === "CM"
            ? "bg-rose-100 text-rose-900 border border-rose-300"
            : code === "DEL"
              ? "bg-violet-100 text-violet-700 border border-violet-200"
              : code === "IN"
                ? "bg-gray-100 text-gray-700 border border-gray-200"
                : code === "SL" || code === "WE"
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  : approvedKindLabel
                    ? "bg-amber-100 text-amber-900 border border-amber-200"
                    : "bg-gray-100 text-gray-600 border border-gray-200"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Verificări pontaj</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-gray-600" />
              <div className="text-xs font-semibold text-gray-900">Informații generale</div>
            </div>
            <div className="grid gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Data</span>
                <span className="text-xs font-medium text-gray-900">{subtitle}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Angajat</span>
                <span className="text-xs font-medium text-gray-900">{title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Status</span>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Total ore</span>
                <span className="text-xs font-semibold text-gray-900">{minutesToHM(minutes)}</span>
              </div>
            </div>
          </div>

          {entries.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-gray-600" />
                <div className="text-xs font-semibold text-gray-900">Intrări timp înregistrat</div>
              </div>
              <div className="space-y-3">
                {entries.map((entry, idx) => (
                  <div key={idx} className="rounded-md border border-gray-200 bg-white p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Interval #{idx + 1}</span>
                      <div className="flex items-center gap-2">
                        {Boolean((entry as any)?.travelToClient) && (
                          <span className="rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                            TRASEU
                          </span>
                        )}
                        <span className="font-mono text-xs font-semibold text-gray-900">
                          {entry.start} – {entry.end}
                        </span>
                      </div>
                    </div>

                    {entry.methodStart && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Metodă început</div>
                          <div className="text-xs text-gray-900">{entry.methodStart}</div>
                        </div>
                      </div>
                    )}

                    {entry.methodEnd && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-xs text-gray-600">Metodă încheiere</div>
                          <div className="text-xs text-gray-900">{entry.methodEnd}</div>
                        </div>
                      </div>
                    )}

                
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-center py-6">
                <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <div className="text-xs text-gray-600">Nu există intrări de timp înregistrate</div>
                <div className="text-[11px] text-gray-500 mt-1">Folosește butonul + pentru a adăuga</div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

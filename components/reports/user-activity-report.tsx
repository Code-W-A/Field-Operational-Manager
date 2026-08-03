"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ListTree,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  PlusCircle,
  Search,
  Send,
  Table2,
  Trash2,
  User,
  XCircle,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  activityDayKey,
  formatActivityDay,
  formatActivityTime,
  presentAuditEvent,
} from "@/lib/reports/activity-presentation"
import { formatBucharestDateTime, REPORT_TIMEZONE } from "@/lib/reports/date-range"
import type { ActivityReportResponse, AuditChange, AuditEvent, AuditValuePresentation, ReportUserOption } from "@/lib/reports/types"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

type ActivityView = "timeline" | "table"

function dateInputValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: REPORT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

async function downloadFile(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || "Exportul nu a putut fi generat.")
  }
  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") || ""
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || "raport"
  const anchor = document.createElement("a")
  anchor.href = URL.createObjectURL(blob)
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

function activityIcon(event: AuditEvent) {
  const action = event.action.toLocaleLowerCase("ro-RO")
  if (event.outcome === "fail") return XCircle
  if (/deconect|logout/.test(action)) return LogOut
  if (/autentific|login/.test(action)) return LogIn
  if (/șterg|sterg|delete/.test(action)) return Trash2
  if (/creare|creat|create|adăug|adaug/.test(action)) return PlusCircle
  if (/actualiz|modific|update|edit/.test(action)) return Pencil
  if (/trimis|trimit|send/.test(action)) return Send
  if (/export|descărc|descarc|download/.test(action)) return Download
  return Activity
}

function outcomeBadge(event: AuditEvent) {
  return event.outcome === "success"
    ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Reușit</Badge>
    : <Badge variant="destructive">Eșuat</Badge>
}

function changeKindLabel(change: AuditChange) {
  if (change.presentation?.kind === "added") return "Adăugat"
  if (change.presentation?.kind === "removed") return "Eliminat"
  return "Modificat"
}

function ValueDetails({ value, tone }: { value: AuditValuePresentation; tone: "before" | "after" }) {
  return (
    <div className={cn(
      "min-w-0 rounded-lg border p-3",
      tone === "before" ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50/70",
    )}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {tone === "before" ? "Înainte" : "După"}
      </div>
      <div className={cn("break-words text-sm font-medium", value.empty && "italic text-muted-foreground")}>{value.text}</div>
      {value.items.length ? (
        <dl className="mt-3 space-y-2 border-t pt-2 text-xs">
          {value.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid gap-0.5 sm:grid-cols-[minmax(100px,0.35fr)_1fr] sm:gap-3">
              <dt className="font-medium text-muted-foreground">{item.label}</dt>
              <dd className="break-words text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

function ActivityDetailsSheet({ event, onOpenChange }: { event: AuditEvent | null; onOpenChange: (open: boolean) => void }) {
  const presented = event ? presentAuditEvent(event) : null
  const display = presented?.presentation

  return (
    <Sheet open={Boolean(event)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col p-0 sm:max-w-2xl">
        {presented && display ? (
          <>
            <SheetHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {outcomeBadge(presented)}
                <Badge variant="secondary">{display.moduleLabel}</Badge>
                {presented.coverage === "legacy_partial" ? <Badge variant="outline">Istoric parțial</Badge> : null}
              </div>
              <SheetTitle className="text-xl leading-snug">{display.title}</SheetTitle>
              <SheetDescription>{display.description}</SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-6 px-5 py-5 sm:px-6">
                <section aria-labelledby="activity-context-title" className="rounded-xl border bg-muted/20 p-4">
                  <h3 id="activity-context-title" className="sr-only">Contextul activității</h3>
                  <div className="grid gap-4 text-sm sm:grid-cols-2">
                    <div className="flex gap-3">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div><div className="text-xs text-muted-foreground">Data și ora</div><div className="font-medium">{formatBucharestDateTime(presented.occurredAt)}</div></div>
                    </div>
                    <div className="flex gap-3">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div><div className="text-xs text-muted-foreground">Utilizator</div><div className="font-medium">{presented.actorName}</div>{presented.actorRole ? <div className="text-xs text-muted-foreground">{presented.actorRole}</div> : null}</div>
                    </div>
                    <div className="flex gap-3 sm:col-span-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1"><div className="text-xs text-muted-foreground">Entitate afectată</div><div className="break-words font-medium">{presented.entityType}: {display.entityLabel}</div></div>
                    </div>
                  </div>
                  {display.entityHref ? (
                    <Button asChild variant="outline" size="sm" className="mt-4 w-full sm:w-auto">
                      <Link href={display.entityHref}>Deschide tichetul<ExternalLink className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  ) : null}
                </section>

                <section aria-labelledby="activity-changes-title">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 id="activity-changes-title" className="font-semibold">Modificări efectuate</h3>
                    <Badge variant="secondary">{display.changeCount}</Badge>
                  </div>
                  {presented.changes.length ? (
                    <div className="space-y-3">
                      {presented.changes.map((change, index) => {
                        const changeDisplay = change.presentation
                        if (!changeDisplay) return null
                        return (
                          <article key={`${change.field}-${index}`} className={cn(
                            "rounded-xl border p-4",
                            changeDisplay.kind === "added" && "border-emerald-200",
                            changeDisplay.kind === "removed" && "border-rose-200",
                          )}>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-medium">{changeDisplay.label}</h4>
                              <Badge variant="outline" className={cn(
                                changeDisplay.kind === "added" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                                changeDisplay.kind === "removed" && "border-rose-200 bg-rose-50 text-rose-700",
                              )}>{changeKindLabel(change)}</Badge>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <ValueDetails value={changeDisplay.before} tone="before" />
                              <ValueDetails value={changeDisplay.after} tone="after" />
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Acest eveniment nu conține diferențe de câmp. Acțiunea și contextul ei sunt afișate mai sus.
                    </div>
                  )}
                </section>

                <Accordion type="single" collapsible>
                  <AccordionItem value="technical" className="rounded-xl border px-4">
                    <AccordionTrigger className="gap-2 text-sm hover:no-underline">
                      <span className="flex items-center gap-2"><Code2 className="h-4 w-4" />Date tehnice</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <dl className="space-y-3 rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-100">
                        <div><dt className="text-slate-400">Sursă</dt><dd className="break-all">{presented.source}</dd></div>
                        <div><dt className="text-slate-400">ID eveniment</dt><dd className="break-all">{presented.id}</dd></div>
                        <div><dt className="text-slate-400">ID entitate</dt><dd className="break-all">{presented.entityId || "—"}</dd></div>
                        {presented.changes.map((change, index) => (
                          <div key={`${change.field}-technical-${index}`} className="border-t border-slate-700 pt-3">
                            <dt className="text-slate-400">{change.field}</dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words">înainte: {change.before ?? "—"}</dd>
                            <dd className="whitespace-pre-wrap break-words">după: {change.after ?? "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </ScrollArea>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function TimelineView({ rows, onDetails }: { rows: AuditEvent[]; onDetails: (event: AuditEvent) => void }) {
  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; rows: AuditEvent[] }> = []
    for (const row of rows) {
      const key = activityDayKey(row.occurredAt)
      const last = result[result.length - 1]
      if (last?.key === key) last.rows.push(row)
      else result.push({ key, label: formatActivityDay(row.occurredAt), rows: [row] })
    }
    return result
  }, [rows])

  return (
    <div className="space-y-6" data-testid="activity-timeline">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`activity-day-${group.key}`}>
          <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-background/95 py-1 backdrop-blur">
            <h3 id={`activity-day-${group.key}`} className="text-sm font-semibold">{group.label}</h3>
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{group.rows.length} {group.rows.length === 1 ? "activitate" : "activități"}</span>
          </div>
          <div className="relative ml-3 space-y-3 border-l pl-6 sm:ml-5 sm:pl-8">
            {group.rows.map((row) => {
              const display = row.presentation!
              const Icon = activityIcon(row)
              return (
                <article key={row.id} className="relative rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className={cn(
                    "absolute -left-[38px] top-4 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background sm:-left-[46px]",
                    row.outcome === "fail" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
                  )}><Icon className="h-4 w-4" /></div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <time dateTime={row.occurredAt} className="font-mono font-medium text-foreground">{formatActivityTime(row.occurredAt)}</time>
                        <span aria-hidden="true">•</span><span>{display.moduleLabel}</span>
                        {row.coverage === "legacy_partial" ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Istoric parțial</Badge> : null}
                      </div>
                      <h4 className="font-semibold leading-snug">{display.title}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">{display.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {outcomeBadge(row)}
                        {display.changeCount ? <Badge variant="secondary">{display.changeCount} {display.changeCount === 1 ? "modificare" : "modificări"}</Badge> : null}
                        <span className="break-all text-xs text-muted-foreground">{row.entityType}: {display.entityLabel}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => onDetails(row)} aria-label={`Detalii: ${display.title}`}>
                      Detalii<ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function ActivityTableView({ rows, onDetails }: { rows: AuditEvent[]; onDetails: (event: AuditEvent) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border" data-testid="activity-table">
      <Table>
        <TableHeader><TableRow><TableHead>Data și ora</TableHead><TableHead className="min-w-[300px]">Activitate</TableHead><TableHead>Modul / entitate</TableHead><TableHead>Rezultat</TableHead><TableHead>Modificări</TableHead><TableHead className="text-right">Acțiuni</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => {
            const display = row.presentation!
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{formatBucharestDateTime(row.occurredAt)}</TableCell>
                <TableCell><div className="font-medium">{display.title}</div><div className="mt-1 text-xs text-muted-foreground">{display.description}</div></TableCell>
                <TableCell><div>{display.moduleLabel}</div><div className="max-w-[240px] truncate text-xs text-muted-foreground" title={display.entityLabel}>{row.entityType}: {display.entityLabel}</div></TableCell>
                <TableCell>{outcomeBadge(row)}</TableCell>
                <TableCell><Badge variant="secondary">{display.changeCount}</Badge></TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => onDetails(row)} aria-label={`Detalii: ${display.title}`}>Detalii</Button></TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function UserActivityReport() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const today = useMemo(() => new Date(), [])
  const threeDaysAgo = useMemo(() => new Date(today.getTime() - 2 * 86_400_000), [today])
  const [users, setUsers] = useState<ReportUserOption[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [userId, setUserId] = useState("")
  const [from, setFrom] = useState(dateInputValue(threeDaysAgo))
  const [to, setTo] = useState(dateInputValue(today))
  const [report, setReport] = useState<ActivityReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const activityView: ActivityView = searchParams.get("activityView") === "table" ? "table" : "timeline"

  useEffect(() => {
    let active = true
    const loadUsers = async () => {
      try {
        const response = await fetch("/api/reports/users", { cache: "no-store" })
        const body = await response.json()
        if (!response.ok) throw new Error(body?.error || "Utilizatorii nu au putut fi încărcați.")
        if (active) setUsers(body.users || [])
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Utilizatorii nu au putut fi încărcați.")
      } finally {
        if (active) setUsersLoading(false)
      }
    }
    void loadUsers()
    return () => { active = false }
  }, [])

  const setActivityView = (view: ActivityView) => {
    const params = new URLSearchParams(searchParams.toString())
    if (view === "timeline") params.delete("activityView")
    else params.set("activityView", view)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const buildParams = (includeCursor = true) => {
    const params = new URLSearchParams({ userId, from, to, limit: "50" })
    if (includeCursor && cursor) params.set("cursor", cursor)
    return params
  }

  const loadReport = async (nextCursor: string | null = cursor) => {
    if (!userId) {
      setError("Selectează un utilizator.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ userId, from, to, limit: "50" })
      if (nextCursor) params.set("cursor", nextCursor)
      const response = await fetch(`/api/reports/activity?${params.toString()}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "Raportul nu a putut fi încărcat.")
      setReport({ ...body, rows: (body.rows || []).map((row: AuditEvent) => presentAuditEvent(row)) })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Raportul nu a putut fi încărcat.")
    } finally {
      setLoading(false)
    }
  }

  const runSearch = () => {
    setCursor(null)
    setCursorHistory([])
    setSelectedEvent(null)
    void loadReport(null)
  }

  const exportReport = async (format: "xlsx" | "pdf") => {
    if (!userId) return
    const params = buildParams(false)
    params.delete("limit")
    params.set("report", "activity")
    params.set("format", format)
    setExporting(format)
    try {
      await downloadFile(`/api/reports/export?${params.toString()}`)
    } catch (exportError) {
      toast({ title: "Export eșuat", description: exportError instanceof Error ? exportError.message : "Exportul nu a putut fi generat.", variant: "destructive" })
    } finally {
      setExporting(null)
    }
  }

  const nextPage = () => {
    if (!report?.nextCursor) return
    setCursorHistory((history) => [...history, cursor])
    setCursor(report.nextCursor)
    void loadReport(report.nextCursor)
  }

  const previousPage = () => {
    if (!cursorHistory.length) return
    const history = [...cursorHistory]
    const previous = history.pop() ?? null
    setCursorHistory(history)
    setCursor(previous)
    void loadReport(previous)
  }

  return (
    <Card>
      <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><CardTitle>Activitate utilizator</CardTitle><CardDescription>Vezi clar ce a făcut utilizatorul și deschide separat modificările fiecărei acțiuni.</CardDescription></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportReport("xlsx")} disabled={!report || Boolean(exporting)}>{exporting === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}XLSX</Button>
          <Button variant="outline" onClick={() => void exportReport("pdf")} disabled={!report || Boolean(exporting)}>{exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid items-end gap-3 md:grid-cols-[minmax(260px,1fr)_180px_180px_auto]">
          <div className="space-y-1.5"><Label>Utilizator</Label><Select value={userId} onValueChange={setUserId} disabled={usersLoading}><SelectTrigger><SelectValue placeholder={usersLoading ? "Se încarcă..." : "Selectează utilizatorul"} /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}><span>{user.name}</span><span className="ml-2 text-xs text-muted-foreground">{user.role}</span></SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="activity-from">De la</Label><Input id="activity-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="activity-to">Până la</Label><Input id="activity-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
          <Button onClick={runSearch} disabled={loading || !userId}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Generează</Button>
        </div>

        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        {report?.includesLegacyPartial ? <Alert><AlertDescription>Intervalul include date anterioare pornirii auditului complet. Aceste evenimente sunt reconstruite best-effort și pot fi incomplete.</AlertDescription></Alert> : null}

        {report ? (
          <div className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{report.total} evenimente</span><span>Generat la {formatBucharestDateTime(report.generatedAt)}</span></div>
            <div className="inline-flex w-fit rounded-lg border bg-muted/30 p-1" role="group" aria-label="Mod de afișare activitate">
              <Button size="sm" variant={activityView === "timeline" ? "default" : "ghost"} onClick={() => setActivityView("timeline")} aria-pressed={activityView === "timeline"}><ListTree className="mr-2 h-4 w-4" />Jurnal</Button>
              <Button size="sm" variant={activityView === "table" ? "default" : "ghost"} onClick={() => setActivityView("table")} aria-pressed={activityView === "table"}><Table2 className="mr-2 h-4 w-4" />Tabel</Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-36 items-center justify-center rounded-xl border"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Se încarcă activitatea</span></div>
        ) : report?.rows.length ? (
          activityView === "timeline"
            ? <TimelineView rows={report.rows} onDetails={setSelectedEvent} />
            : <ActivityTableView rows={report.rows} onDetails={setSelectedEvent} />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="mb-2 h-6 w-6" />
            {report ? "Nu există activitate în intervalul selectat." : "Selectează utilizatorul și intervalul, apoi generează raportul."}
          </div>
        )}

        {report ? <div className="flex items-center justify-between"><Button variant="outline" onClick={previousPage} disabled={!cursorHistory.length || loading}>Înapoi</Button><span className="text-sm text-muted-foreground">Pagina {cursorHistory.length + 1}</span><Button variant="outline" onClick={nextPage} disabled={!report.nextCursor || loading}>Înainte</Button></div> : null}
      </CardContent>
      <ActivityDetailsSheet event={selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null) }} />
    </Card>
  )
}

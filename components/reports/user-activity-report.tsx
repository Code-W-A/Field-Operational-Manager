"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, FileSpreadsheet, Loader2, Search } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatBucharestDateTime, REPORT_TIMEZONE } from "@/lib/reports/date-range"
import type { ActivityReportResponse, ReportUserOption } from "@/lib/reports/types"
import { toast } from "@/hooks/use-toast"

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

export function UserActivityReport() {
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
      setReport(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Raportul nu a putut fi încărcat.")
    } finally {
      setLoading(false)
    }
  }

  const runSearch = () => {
    setCursor(null)
    setCursorHistory([])
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
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div><CardTitle>Activitate utilizator</CardTitle><CardDescription>Acțiuni, modificări și autentificări, afișate cu data și ora exactă.</CardDescription></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void exportReport("xlsx")} disabled={!report || Boolean(exporting)}>{exporting === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}XLSX</Button>
          <Button variant="outline" onClick={() => void exportReport("pdf")} disabled={!report || Boolean(exporting)}>{exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid items-end gap-3 md:grid-cols-[minmax(260px,1fr)_180px_180px_auto]">
          <div className="space-y-1.5"><Label>Utilizator</Label><Select value={userId} onValueChange={setUserId} disabled={usersLoading}><SelectTrigger><SelectValue placeholder={usersLoading ? "Se încarcă..." : "Selectează utilizatorul"} /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}><span>{user.name}</span><span className="ml-2 text-xs text-muted-foreground">{user.role}</span></SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="activity-from">De la</Label><Input id="activity-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="activity-to">Până la</Label><Input id="activity-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
          <Button onClick={runSearch} disabled={loading || !userId}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Generează</Button>
        </div>

        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        {report?.includesLegacyPartial ? <Alert><AlertDescription>Intervalul include date anterioare pornirii auditului complet. Aceste evenimente sunt reconstruite best-effort și pot fi incomplete.</AlertDescription></Alert> : null}
        {report ? <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>{report.total} evenimente</span><span>Generat la {formatBucharestDateTime(report.generatedAt)}</span></div> : null}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Data și ora</TableHead><TableHead>Modul</TableHead><TableHead>Acțiune</TableHead><TableHead>Rezultat</TableHead><TableHead>Entitate</TableHead><TableHead className="min-w-[320px]">Detalii</TableHead><TableHead>Acoperire</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                : report?.rows.length ? report.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{formatBucharestDateTime(row.occurredAt)}</TableCell>
                    <TableCell>{row.module}</TableCell><TableCell className="font-medium">{row.action}</TableCell>
                    <TableCell><Badge variant={row.outcome === "success" ? "outline" : "destructive"}>{row.outcome === "success" ? "Reușit" : "Eșuat"}</Badge></TableCell>
                    <TableCell><div>{row.entityType}</div><div className="text-xs text-muted-foreground">{row.entityLabel || row.entityId || "—"}</div></TableCell>
                    <TableCell><div>{row.summary}</div>{row.changes.length ? <div className="mt-1 space-y-1 text-xs text-muted-foreground">{row.changes.map((change, index) => <div key={`${change.field}-${index}`}><span className="font-medium">{change.label}:</span> {change.before ?? "—"} → {change.after ?? "—"}</div>)}</div> : null}</TableCell>
                    <TableCell><Badge variant="secondary">{row.coverage === "complete" ? "Complet" : "Parțial"}</Badge></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{report ? "Nu există activitate în intervalul selectat." : "Selectează utilizatorul și intervalul, apoi generează raportul."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {report ? <div className="flex items-center justify-between"><Button variant="outline" onClick={previousPage} disabled={!cursorHistory.length || loading}>Înapoi</Button><span className="text-sm text-muted-foreground">Pagina {cursorHistory.length + 1}</span><Button variant="outline" onClick={nextPage} disabled={!report.nextCursor || loading}>Înainte</Button></div> : null}
      </CardContent>
    </Card>
  )
}

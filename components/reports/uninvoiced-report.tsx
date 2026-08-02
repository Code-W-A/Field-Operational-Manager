"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, ExternalLink, FileSpreadsheet, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatBucharestDateTime } from "@/lib/reports/date-range"
import type { UninvoicedReportResponse } from "@/lib/reports/types"
import { toast } from "@/hooks/use-toast"

const ALL = "__all__"

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

export function UninvoicedReport() {
  const [report, setReport] = useState<UninvoicedReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [client, setClient] = useState(ALL)
  const [workType, setWorkType] = useState(ALL)
  const [workStatus, setWorkStatus] = useState(ALL)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ limit: "50" })
    if (search) params.set("search", search)
    if (client !== ALL) params.set("client", client)
    if (workType !== ALL) params.set("workType", workType)
    if (workStatus !== ALL) params.set("workStatus", workStatus)
    if (cursor) params.set("cursor", cursor)
    return params
  }, [client, cursor, search, workStatus, workType])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/reports/uninvoiced?${queryParams.toString()}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "Raportul nu a putut fi încărcat.")
      setReport(body)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Raportul nu a putut fi încărcat.")
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const resetPagination = () => {
    setCursor(null)
    setCursorHistory([])
  }

  const applySearch = () => {
    resetPagination()
    setSearch(searchDraft.trim())
  }

  const exportReport = async (format: "xlsx" | "pdf") => {
    const params = new URLSearchParams(queryParams)
    params.delete("cursor")
    params.delete("limit")
    params.set("report", "uninvoiced")
    params.set("format", format)
    setExporting(format)
    try {
      await downloadFile(`/api/reports/export?${params.toString()}`)
    } catch (exportError) {
      toast({
        title: "Export eșuat",
        description: exportError instanceof Error ? exportError.message : "Exportul nu a putut fi generat.",
        variant: "destructive",
      })
    } finally {
      setExporting(null)
    }
  }

  const nextPage = () => {
    if (!report?.nextCursor) return
    setCursorHistory((history) => [...history, cursor])
    setCursor(report.nextCursor)
  }

  const previousPage = () => {
    setCursorHistory((history) => {
      if (!history.length) return history
      const next = [...history]
      setCursor(next.pop() ?? null)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle>Tichete nefacturate</CardTitle>
          <CardDescription>
            Situația curentă a tichetelor cu raport generat, fără factură și fără marcaj „Nu se facturează”.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void exportReport("xlsx")} disabled={Boolean(exporting) || loading}>
            {exporting === "xlsx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            XLSX
          </Button>
          <Button variant="outline" onClick={() => void exportReport("pdf")} disabled={Boolean(exporting) || loading}>
            {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_220px_220px_220px]">
          <div className="flex gap-2">
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && applySearch()}
              placeholder="Caută tichet, client, locație..."
            />
            <Button variant="secondary" size="icon" onClick={applySearch} aria-label="Caută">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={client} onValueChange={(value) => { setClient(value); resetPagination() }}>
            <SelectTrigger><SelectValue placeholder="Toți clienții" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Toți clienții</SelectItem>{report?.facets.clients.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={workType} onValueChange={(value) => { setWorkType(value); resetPagination() }}>
            <SelectTrigger><SelectValue placeholder="Toate tipurile" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Toate tipurile</SelectItem>{report?.facets.workTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={workStatus} onValueChange={(value) => { setWorkStatus(value); resetPagination() }}>
            <SelectTrigger><SelectValue placeholder="Toate statusurile" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Toate statusurile</SelectItem>{report?.facets.workStatuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{report ? `${report.total} rezultate` : "Se încarcă..."}</span>
          {report?.generatedAt ? <span>Actualizat la {formatBucharestDateTime(report.generatedAt)}</span> : null}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tichet</TableHead><TableHead>Client / locație</TableHead><TableHead>Tip</TableHead>
                <TableHead>Intervenție</TableHead><TableHead>Raport</TableHead><TableHead>Tehnicieni</TableHead>
                <TableHead>Status</TableHead><TableHead>Facturare</TableHead><TableHead className="text-right">Zile</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
              ) : report?.rows.length ? report.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono font-medium">{row.ticketNumber}</TableCell>
                  <TableCell><div className="font-medium">{row.client}</div><div className="max-w-[260px] text-xs text-muted-foreground">{row.location}</div></TableCell>
                  <TableCell>{row.workType}</TableCell>
                  <TableCell>{row.interventionDate}</TableCell>
                  <TableCell>{row.reportDate ? formatBucharestDateTime(row.reportDate) : "—"}</TableCell>
                  <TableCell>{row.technicians.join(", ") || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{row.workStatus}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{row.invoiceStatus}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{row.ageDays}</TableCell>
                  <TableCell><Button asChild variant="ghost" size="icon"><Link href={row.href} aria-label={`Deschide ${row.ticketNumber}`}><ExternalLink className="h-4 w-4" /></Link></Button></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={10} className="h-28 text-center text-muted-foreground">Nu există tichete pentru filtrele selectate.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={previousPage} disabled={!cursorHistory.length || loading}>Înapoi</Button>
          <span className="text-sm text-muted-foreground">Pagina {cursorHistory.length + 1}</span>
          <Button variant="outline" onClick={nextPage} disabled={!report?.nextCursor || loading}>Înainte</Button>
        </div>
      </CardContent>
    </Card>
  )
}

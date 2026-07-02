"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Download, FileText, ExternalLink, FileCheck2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatUiDate } from "@/lib/utils/time-format"
import type { OfferEvidencePack, OfferEvidenceTimelineItem } from "@/lib/offer/evidence-types"
import { generateOfferEvidencePdf } from "@/lib/offer/evidence-pdf"

type OfferEvidencePanelProps = {
  mode: "lucrari" | "crm-opportunity" | "crm-offer"
  entityId: string
  title?: string
  className?: string
}

function resolveApiPath(props: OfferEvidencePanelProps): string {
  if (props.mode === "lucrari") {
    return `/api/lucrari/${encodeURIComponent(props.entityId)}/offer-evidence`
  }
  if (props.mode === "crm-offer") {
    return `/api/crm/offers/${encodeURIComponent(props.entityId)}/offer-evidence`
  }
  return `/api/crm/opportunities/${encodeURIComponent(props.entityId)}/offer-evidence`
}

function TimelineRow({ item }: { item: OfferEvidenceTimelineItem }) {
  const [open, setOpen] = useState(false)
  const when = item.at ? formatUiDate(item.at) : "dată indisponibilă"

  return (
    <div className="relative pl-6 pb-4 border-l border-neutral-200 last:pb-0">
      <span className="absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full bg-neutral-300 ring-2 ring-white" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{item.label}</span>
        <Badge
          variant="outline"
          className={
            item.dataTier === "complete"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-neutral-200 bg-neutral-50 text-neutral-600"
          }
        >
          {item.dataTier === "complete" ? "Complet" : "Date limitate"}
        </Badge>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
        {item.available.email ? <div>Email: {String(item.available.email)}</div> : null}
        {item.available.messageId ? <div>Message ID: {String(item.available.messageId)}</div> : null}
        {item.available.ip ? <div>IP: {String(item.available.ip)}</div> : null}
        {item.available.status ? <div>Status: {String(item.available.status)}</div> : null}
        {item.available.eventHash ? <div>Event hash: {String(item.available.eventHash).slice(0, 16)}...</div> : null}
        {item.available.prevEventHash ? <div>Prev hash: {String(item.available.prevEventHash).slice(0, 16)}...</div> : null}
        {item.available.details ? <div>{String(item.available.details)}</div> : null}
      </div>
      {item.available.integrityWarning ? (
        <p className="mt-1 text-xs text-red-700">Avertisment: {String(item.available.integrityWarning)}</p>
      ) : null}
      {item.missing?.length ? (
        <p className="mt-1 text-xs text-amber-700">Indisponibil: {item.missing.join(", ")}</p>
      ) : null}
      {Object.keys(item.available).length > 0 ? (
        <button
          type="button"
          className="mt-1 text-xs text-blue-700 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Ascunde detalii" : "Detalii câmpuri"}
        </button>
      ) : null}
      {open ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded border bg-neutral-50 p-2 text-[10px]">
          {JSON.stringify(item.available, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function OfferEvidenceDetails({
  pack,
  logsHref,
  certifiedPdfHref,
}: {
  pack: OfferEvidencePack
  logsHref: string
  certifiedPdfHref: string | null
}) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4 text-sm">
        {pack.summary.sentAt ? (
          <div>
            <span className="text-muted-foreground">Ultima trimitere înregistrată: </span>
            {formatUiDate(pack.summary.sentAt)}
            {pack.summary.sentTo?.length ? ` → ${pack.summary.sentTo.join(", ")}` : ""}
          </div>
        ) : null}
        {pack.summary.acceptedAt ? (
          <div>
            <span className="text-muted-foreground">Acceptat: </span>
            {formatUiDate(pack.summary.acceptedAt)}
            {pack.summary.acceptedByEmail ? ` (${pack.summary.acceptedByEmail})` : ""}
          </div>
        ) : null}
        {pack.summary.offerTotal != null ? (
          <div>
            <span className="text-muted-foreground">Total: </span>
            {Number(pack.summary.offerTotal).toFixed(2)} lei
          </div>
        ) : null}
        {pack.summary.pdfUrl ? (
          <div>
            <a
              href={String(pack.summary.pdfUrl)}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline inline-flex items-center gap-1"
            >
              PDF ofertă <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}
        {pack.summary.certifiedPdf && certifiedPdfHref ? (
          <div>
            <a
              href={certifiedPdfHref}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:underline inline-flex items-center gap-1"
            >
              PDF dovadă <FileCheck2 className="h-3 w-3" />
            </a>
          </div>
        ) : null}
      </div>

      {pack.missingGlobal?.length ? (
        <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
          Pentru perioada anterioară, unele date nu au fost salvate: {pack.missingGlobal.join(", ")}.
        </p>
      ) : null}

      {pack.integrity ? (
        <p
          className={`mb-3 text-xs rounded border p-2 ${
            pack.integrity.verified
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-amber-100 bg-amber-50 text-amber-800"
          }`}
        >
          Integritate evenimente noi: {pack.integrity.verified ? "verificată" : "cu avertismente"}.
        </p>
      ) : null}

      {pack.warnings?.length ? (
        <div className="mb-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-medium">Avertismente dosar</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {pack.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-0">
        {pack.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Niciun eveniment în timeline.</p>
        ) : (
          pack.timeline.map((item) => <TimelineRow key={item.id} item={item} />)
        )}
      </div>

      <div className="mt-4">
        <Link href={logsHref} className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1">
          Vezi în Loguri <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </>
  )
}

export function OfferEvidencePanel({ mode, entityId, title = "Dosar ofertă", className }: OfferEvidencePanelProps) {
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<"json" | "pdf" | null>(null)
  const [pack, setPack] = useState<OfferEvidencePack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const apiPath = useMemo(() => resolveApiPath({ mode, entityId }), [mode, entityId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiPath, { cache: "no-store" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Eroare ${res.status}`)
      setPack(json.pack || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut încărca dosarul.")
      setPack(null)
    } finally {
      setLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    void load()
  }, [load])

  const exportJson = async () => {
    try {
      setExporting("json")
      const res = await fetch(`${apiPath}?format=json`, { cache: "no-store" })
      if (!res.ok) throw new Error("Export JSON eșuat")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dosar-oferta-${entityId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({
        title: "Export eșuat",
        description: e instanceof Error ? e.message : "Eroare necunoscută",
        variant: "destructive",
      })
    } finally {
      setExporting(null)
    }
  }

  const exportPdf = async () => {
    if (!pack) return
    try {
      setExporting("pdf")
      const blob = await generateOfferEvidencePdf(pack)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dosar-oferta-${entityId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast({
        title: "Export PDF eșuat",
        description: e instanceof Error ? e.message : "Eroare necunoscută",
        variant: "destructive",
      })
    } finally {
      setExporting(null)
    }
  }

  const logsHref =
    mode === "lucrari"
      ? `/dashboard/loguri?lucrareId=${encodeURIComponent(entityId)}&categorie=${encodeURIComponent("Portal ofertă")}`
      : "/dashboard/loguri"
  const certifiedPdfHref =
    mode === "lucrari"
      ? `/api/lucrari/${encodeURIComponent(entityId)}/offer-certified-pdf`
      : mode === "crm-offer"
        ? `/api/crm/offers/${encodeURIComponent(entityId)}/certified-pdf`
        : null

  return (
    <div className={`p-4 border rounded-md bg-white ${className || ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-700" />
            <h4 className="text-base font-semibold">{title}</h4>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Evenimentele vechi pot avea date limitate; de acum înainte se înregistrează complet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Reîncarcă
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDetailsOpen(true)} disabled={loading || !pack}>
            Vezi detalii
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void exportJson()} disabled={!pack || exporting !== null}>
            {exporting === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            JSON
          </Button>
          <Button type="button" size="sm" variant="default" onClick={() => void exportPdf()} disabled={!pack || exporting !== null}>
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            PDF dosar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă dosarul...
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !pack ? (
        <p className="text-sm text-muted-foreground">Nu există date pentru dosar.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Dosarul este pregătit. Deschide <span className="font-medium text-foreground">Vezi detalii</span> pentru timeline și toate informațiile.
        </p>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-7xl max-h-[92vh] overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Rezumatul complet, avertismentele și timeline-ul ofertării.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă dosarul...
              </div>
            ) : error ? (
              <p className="text-sm text-red-700">{error}</p>
            ) : !pack ? (
              <p className="text-sm text-muted-foreground">Nu există date pentru dosar.</p>
            ) : (
              <OfferEvidenceDetails pack={pack} logsHref={logsHref} certifiedPdfHref={certifiedPdfHref} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

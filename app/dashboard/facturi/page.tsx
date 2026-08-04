"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, ExternalLink, FileText, Pencil, X } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { updateLucrare, type Lucrare } from "@/lib/firebase/firestore"
import { INVOICE_STATUS, getInvoiceStatusClass } from "@/lib/utils/constants"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { UniversalSearch } from "@/components/universal-search"
import { DataTable } from "@/components/data-table/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"

type InvoiceRow = {
  lucrareId: string
  nrLucrare: string
  client: string
  locatie?: string
  statusFacturare?: string
  invoiceNumber?: string
  invoiceDate?: string
  fileName?: string
  url?: string
  uploadedAt?: string
  uploadedBy?: string
  // for sorting/fallback
  _sortTime: number
}

const normalizeDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "")
const normalizeNumericId = (digits: string) => {
  const trimmed = digits.replace(/^0+/, "")
  return trimmed.length > 0 ? trimmed : "0"
}

function invoiceTokens(row: InvoiceRow): string[] {
  return [
    row.invoiceNumber,
    row.invoiceDate,
    row.fileName,
    row.client,
    row.locatie,
    row.nrLucrare,
    row.statusFacturare,
    row.uploadedBy,
  ]
    .filter(Boolean)
    .map((v) => String(v))
}

function matchesInvoiceRowLoose(row: InvoiceRow, query: string) {
  const q = String(query || "").trim().toLowerCase()
  if (!q) return true

  const tokens = invoiceTokens(row).map((t) => t.toLowerCase())
  if (tokens.some((t) => t.includes(q))) return true

  // digit-friendly search (e.g. "000123" vs "123")
  const qDigits = normalizeDigits(q)
  if (!qDigits) return false
  const qNorm = normalizeNumericId(qDigits)
  return tokens.some((t) => {
    const tDigits = normalizeDigits(t)
    if (!tDigits) return false
    return normalizeNumericId(tDigits).includes(qNorm)
  })
}

function parseSortableTime(row: any): number {
  // Prefer invoice upload time if available (ISO string), fallback to updatedAt/createdAt timestamps.
  const upAt = row?.facturaDocument?.uploadedAt
  if (typeof upAt === "string") {
    const t = Date.parse(upAt)
    if (!Number.isNaN(t)) return t
  }
  try {
    if (row?.updatedAt?.toMillis) return row.updatedAt.toMillis()
    if (row?.createdAt?.toMillis) return row.createdAt.toMillis()
  } catch {}
  // fallback: today = push to bottom
  return 0
}

export default function FacturiPage() {
  const router = useRouter()
  const { userData } = useAuth()
  const isAdminOrDispatcher = userData?.role === "admin" || userData?.role === "dispecer"

  const [searchText, setSearchText] = useState("")
  const [onlyWithPdf, setOnlyWithPdf] = useState(true)
  const [onlyMissingNumber, setOnlyMissingNumber] = useState(false)
  const [onlyMissingPdf, setOnlyMissingPdf] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow] = useState<InvoiceRow | null>(null)
  const [editNr, setEditNr] = useState("")
  const [editDate, setEditDate] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userData) return
    if (!isAdminOrDispatcher) router.replace("/dashboard")
  }, [userData, isAdminOrDispatcher, router])

  const { data: rawLucrari, loading, error } = useFirebaseCollection<Lucrare>("lucrari", [])

  const allInvoiceRows = useMemo<InvoiceRow[]>(() => {
    if (!rawLucrari || rawLucrari.length === 0) return []

    const rows: InvoiceRow[] = []
    for (const w of rawLucrari as any[]) {
      const status = String(w?.statusFacturare || "")
      const doc = w?.facturaDocument
      const hasPdf = Boolean(doc?.url)
      const hasAnyInvoiceSignal =
        hasPdf || Boolean(w?.numarFactura) || status === INVOICE_STATUS.INVOICED || Boolean(doc?.fileName)

      if (!hasAnyInvoiceSignal) continue

      const nrLucrare = String(w?.nrLucrare || w?.numarRaport || w?.id || "")
      const invoiceNumber = doc?.numarFactura || w?.numarFactura || ""
      const invoiceDate = doc?.dataFactura || ""
      const fileName = doc?.fileName || ""
      const uploadedAt = doc?.uploadedAt || ""
      const uploadedBy = doc?.uploadedBy || ""

      rows.push({
        lucrareId: String(w?.id || ""),
        nrLucrare,
        client: String(w?.client || ""),
        locatie: String(w?.locatie || ""),
        statusFacturare: status || undefined,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate: invoiceDate || undefined,
        fileName: fileName || undefined,
        url: doc?.url || undefined,
        uploadedAt: uploadedAt || undefined,
        uploadedBy: uploadedBy || undefined,
        _sortTime: parseSortableTime(w),
      })
    }

    return rows.sort((a, b) => b._sortTime - a._sortTime)
  }, [rawLucrari])

  const filteredRows = useMemo(() => {
    let rows = allInvoiceRows

    if (onlyWithPdf) rows = rows.filter((r) => Boolean(r.url))
    if (onlyMissingPdf) rows = rows.filter((r) => !r.url)
    if (onlyMissingNumber) rows = rows.filter((r) => !String(r.invoiceNumber || "").trim())

    if (searchText.trim()) rows = rows.filter((r) => matchesInvoiceRowLoose(r, searchText))

    return rows
  }, [allInvoiceRows, onlyWithPdf, onlyMissingPdf, onlyMissingNumber, searchText])

  const openDownload = (row: InvoiceRow) => {
    if (!row.url) {
      toast({
        title: "Nu există PDF",
        description: "Factura nu are un document încărcat.",
        variant: "destructive",
      })
      return
    }
    const link = `/api/download?lucrareId=${encodeURIComponent(row.lucrareId)}&type=factura&url=${encodeURIComponent(row.url)}`
    window.open(link, "_blank")
  }

  const openEdit = (row: InvoiceRow) => {
    setEditRow(row)
    setEditNr(row.invoiceNumber || "")
    setEditDate(row.invoiceDate || "")
    setEditOpen(true)
  }

  const saveInvoiceMeta = async () => {
    if (!editRow) return
    setSaving(true)
    try {
      const nr = editNr.trim()
      const dt = editDate.trim()

      // Backward-compatible: keep lucrare.numarFactura
      // Also keep facturaDocument.numarFactura/dataFactura when facturaDocument exists.
      const update: any = {
        numarFactura: nr || "",
      }
      if (editRow.url || editRow.fileName || editRow.uploadedAt || editRow.uploadedBy) {
        update.facturaDocument = {
          url: editRow.url || "",
          fileName: editRow.fileName || "",
          uploadedAt: editRow.uploadedAt || "",
          uploadedBy: editRow.uploadedBy || "",
          ...(nr ? { numarFactura: nr } : {}),
          ...(dt ? { dataFactura: dt } : {}),
        }
      }

      await updateLucrare(editRow.lucrareId, update)

      toast({
        title: "Factura actualizată",
        description: "Am salvat numărul/data facturii.",
      })
      setEditOpen(false)
    } catch (e) {
      console.error(e)
      toast({
        title: "Eroare",
        description: "Nu am putut salva datele facturii.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const columns: any[] = useMemo(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: "Nr. Factură",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          const has = Boolean(String(r.invoiceNumber || "").trim())
          return (
            <div className="flex items-center gap-2">
              <div className="min-w-0">
                <div className={`font-mono text-xs ${has ? "text-gray-900" : "text-rose-700"}`}>
                  {has ? r.invoiceNumber : "Lipsă"}
                </div>
                {r.invoiceDate ? (
                  <div className="text-[11px] text-gray-500">Data: {r.invoiceDate}</div>
                ) : (
                  <div className="text-[11px] text-gray-400">Data: -</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  openEdit(r)
                }}
                title="Editează nr/data factură"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        },
      },
      {
        accessorKey: "fileName",
        header: "Fișier",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                <div className="truncate max-w-[320px]" title={r.fileName || ""}>
                  {r.fileName || <span className="text-gray-400 text-xs">Fără fișier</span>}
                </div>
              </div>
              {r.uploadedAt ? (
                <div className="text-[11px] text-gray-500 mt-0.5">Încărcat: {new Date(r.uploadedAt).toLocaleString("ro-RO")}</div>
              ) : null}
            </div>
          )
        },
      },
      {
        accessorKey: "client",
        header: "Client",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          return (
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate max-w-[240px]" title={r.client}>
                {r.client || "-"}
              </div>
              <div className="text-xs text-gray-500 truncate max-w-[240px]" title={r.locatie || ""}>
                {r.locatie || "-"}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "nrLucrare",
        header: "Lucrare",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          return <Badge className="bg-purple-100 text-purple-800 font-mono text-xs">{r.nrLucrare || "-"}</Badge>
        },
      },
      {
        accessorKey: "statusFacturare",
        header: "Status",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          const s = r.statusFacturare || "-"
          return <Badge className={getInvoiceStatusClass(s)}>{s}</Badge>
        },
      },
      {
        id: "actions",
        header: "Acțiuni",
        cell: ({ row }: any) => {
          const r = row.original as InvoiceRow
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => openDownload(r)}
                disabled={!r.url}
                title={r.url ? "Descarcă factura" : "Nu există PDF"}
              >
                <Download className="mr-2 h-4 w-4" /> Descarcă
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8"
                title="Deschide lucrarea"
              >
                <Link href={`/dashboard/lucrari/${encodeURIComponent(r.lucrareId)}`}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Lucrare
                </Link>
              </Button>
            </div>
          )
        },
      },
    ],
    [],
  )

  if (!isAdminOrDispatcher) return null

  return (
    <DashboardShell>
      <DashboardHeader heading="Facturi" text="Registru facturi încărcate pe lucrări. Caută după număr, nume fișier sau client." />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <UniversalSearch
              onSearch={setSearchText}
              initialValue={searchText}
              placeholder="Caută facturi: nr / nume fișier / client / nr tichet…"
              className="flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={onlyWithPdf ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => {
                  setOnlyWithPdf((v) => !v)
                  // mutually exclusive with missing pdf
                  if (!onlyWithPdf) setOnlyMissingPdf(false)
                }}
                title="Arată doar facturile cu document PDF încărcat"
              >
                Doar cu PDF
              </Button>
              <Button
                variant={onlyMissingPdf ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => {
                  setOnlyMissingPdf((v) => !v)
                  // mutually exclusive with onlyWithPdf
                  if (!onlyMissingPdf) setOnlyWithPdf(false)
                }}
                title="Arată facturile fără document (cazuri vechi / incomplete)"
              >
                Fără PDF
              </Button>
              <Button
                variant={onlyMissingNumber ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => setOnlyMissingNumber((v) => !v)}
                title="Arată facturile care nu au numărul completat"
              >
                Fără nr
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {loading ? "Se încarcă…" : `${filteredRows.length} rezultate`}
              {error ? <span className="text-rose-700 ml-2">Eroare la încărcare</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {onlyWithPdf || onlyMissingPdf || onlyMissingNumber || searchText ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setSearchText("")
                    setOnlyWithPdf(true)
                    setOnlyMissingPdf(false)
                    setOnlyMissingNumber(false)
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Reset
                </Button>
              ) : null}
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredRows}
            onRowClick={(r: any) => router.push(`/dashboard/lucrari/${encodeURIComponent(r.lucrareId)}`)}
            getRowHref={(r: any) => {
              const id = String(r?.lucrareId || "").trim()
              return id ? `/dashboard/lucrari/${encodeURIComponent(id)}` : undefined
            }}
            enablePagination
            initialPageSize={20}
            showFilters={false}
          />
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editează date factură</DialogTitle>
            <DialogDescription>
              Salvează numărul și (opțional) data facturii, ca să poată fi căutată rapid după ce e emisă.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <div className="text-xs text-gray-600">Nr. factură</div>
              <Input value={editNr} onChange={(e) => setEditNr(e.target.value)} placeholder="Ex: INV-123 / 000123" />
            </div>
            <div className="grid gap-1.5">
              <div className="text-xs text-gray-600">Data factură (opțional)</div>
              <Input value={editDate} onChange={(e) => setEditDate(e.target.value)} placeholder="Ex: 22.01.2026" />
            </div>
            {editRow ? (
              <div className="text-xs text-gray-500">
                Lucrare: <span className="font-mono">{editRow.nrLucrare}</span> • Client:{" "}
                <span className="font-medium">{editRow.client || "-"}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button onClick={saveInvoiceMeta} disabled={saving}>
              {saving ? "Se salvează…" : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}


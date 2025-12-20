"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { where } from "firebase/firestore"
import html2canvas from "html2canvas"
import { jsPDF } from "jspdf"
import type { ColumnDef } from "@tanstack/react-table"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableFilters } from "@/components/data-table/data-table-filters"
import { ClampedText } from "@/components/history/clamped-text"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import type { Lucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"

type HistoryRow = {
  id: string
  nrLucrare: string
  dataInterventie: string
  locatie: string
  echipament: string
  client?: string
  clientId?: string
  echipamentCod?: string
  tehnicieni: string[]
  defectReclamat?: string
  constatareLaLocatie?: string
  descriereInterventie?: string
  durataInterventie?: string
}

const extractNr = (value?: string | null) => {
  const v = String(value || "")
  const m = v.match(/\d+/g)
  if (!m?.length) return Number.NEGATIVE_INFINITY
  const n = Number(m.join(""))
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY
}

const computeDurationFallback = (w: any) => {
  const s = w?.timpSosire
  const p = w?.timpPlecare
  if (!s || !p) return ""
  try {
    const start = new Date(s)
    const end = new Date(p)
    const diffMs = end.getTime() - start.getTime()
    if (!Number.isFinite(diffMs) || diffMs <= 0) return ""
    const diffMinutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    return `${hours}h ${minutes}m`
  } catch {
    return ""
  }
}

function escapeCsvCell(v: unknown) {
  const s = String(v ?? "")
  const needsQuotes = /[",\n\r]/.test(s)
  const cleaned = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const escaped = cleaned.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export default function IstoricInterventiiPage() {
  const { userData } = useAuth()
  const role = userData?.role
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const isClient = role === "client"
  const { data: works, loading } = useFirebaseCollection<Lucrare>("lucrari", [where("raportGenerat", "==", true)])

  const [table, setTable] = useState<any>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])

  const { loadSettings, saveFilters } = useTablePersistence("istoric-interventii")
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [cardsPageIndex, setCardsPageIndex] = useState(0)
  const [cardsPageSize, setCardsPageSize] = useState(10)

  useEffect(() => {
    const saved = loadSettings()
    const list = Array.isArray(saved?.activeFilters) ? saved.activeFilters : []
    const vm = list.find((f: any) => f?.id === "viewMode")?.value
    if (vm === "cards" || vm === "table") setViewMode(vm)
    const uiFilters = list.filter((f: any) => f?.id && f.id !== "viewMode")
    setActiveFilters(uiFilters)
  }, [loadSettings])

  useEffect(() => {
    // Persist both viewMode and active filters
    saveFilters([...activeFilters, { id: "viewMode", value: viewMode }])
  }, [viewMode, activeFilters, saveFilters])

  const filterOptions = useMemo<FilterOption[]>(
    () => [
      {
        id: "dateRange",
        label: "Perioadă (data intervenției)",
        type: "dateRange",
      },
      {
        id: "client",
        label: "Client",
        type: "text",
      },
      {
        id: "locatie",
        label: "Locație",
        type: "text",
      },
      {
        id: "echipament",
        label: "Echipament (cod/nume)",
        type: "text",
      },
    ],
    [],
  )

  const handleApplyFilters = (filters: FilterOption[]) => {
    const filtersWithValues = filters.filter((filter) => {
      if (filter.type === "dateRange") {
        return filter.value && (filter.value.from || filter.value.to)
      }
      if (Array.isArray(filter.value)) {
        return filter.value.length > 0
      }
      return !!filter.value
    })
    setActiveFilters(filtersWithValues)
    saveFilters([...filtersWithValues, { id: "viewMode", value: viewMode }])
  }

  const handleResetFilters = () => {
    setActiveFilters([])
    saveFilters([{ id: "viewMode", value: viewMode }])
  }

  const rows = useMemo<HistoryRow[]>(() => {
    const mapped = (works || []).map((w: any) => {
      const nrLucrare = String(w.nrLucrare || w.numarRaport || "").trim()
      const locatie = String(w.locationName || w.locatie || "").trim()

      const echipamentCod = String(w.echipamentCod || "").trim()
      const echipament =
        String(
          [
            echipamentCod ? `(${echipamentCod})` : "",
            w.echipament || "",
          ]
            .filter(Boolean)
            .join(" "),
        ).trim() || String(w.echipament || "").trim()

      const durata = String(w.durataInterventie || computeDurationFallback(w) || "").trim()

      return {
        id: String(w.id),
        nrLucrare,
        dataInterventie: String(w.dataInterventie || "").trim(),
        locatie,
        echipament,
        client: String(w.client || "").trim(),
        clientId: String(w.clientId || w?.clientInfo?.id || "").trim() || undefined,
        echipamentCod,
        tehnicieni: Array.isArray(w.tehnicieni) ? w.tehnicieni : [],
        defectReclamat: w.defectReclamat,
        constatareLaLocatie: w.constatareLaLocatie,
        descriereInterventie: w.descriereInterventie,
        durataInterventie: durata,
      }
    })

    mapped.sort((a, b) => extractNr(b.nrLucrare) - extractNr(a.nrLucrare))
    return mapped
  }, [works])

  const clientAccess = useMemo(() => {
    return Array.isArray((userData as any)?.clientAccess) ? ((userData as any).clientAccess as Array<{ clientId: string; locationNames: string[] }>) : []
  }, [userData])

  const allowedClientIds = useMemo(() => {
    if (role !== "client") return new Set<string>()
    return new Set(clientAccess.map((e) => String(e?.clientId || "").trim()).filter(Boolean))
  }, [role, clientAccess])

  const allowedLocationsByClientId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (role !== "client") return map
    for (const entry of clientAccess) {
      const cid = String(entry?.clientId || "").trim()
      if (!cid) continue
      const set = map.get(cid) || new Set<string>()
      const names = Array.isArray(entry?.locationNames) ? entry.locationNames : []
      for (const n of names) {
        const name = String(n || "").trim()
        if (name) set.add(name)
      }
      map.set(cid, set)
    }
    return map
  }, [role, clientAccess])

  const allowedLocationsUnion = useMemo(() => {
    // Backward compatibility / fallback: union of allowed locations across all clientAccess entries.
    if (role !== "client") return new Set<string>()
    const set = new Set<string>()
    for (const entry of clientAccess) {
      const names = Array.isArray(entry?.locationNames) ? entry.locationNames : []
      for (const n of names) {
        const name = String(n || "").trim()
        if (name) set.add(name)
      }
    }
    return set
  }, [role, clientAccess])

  const visibleRows = useMemo(() => {
    let out = rows

    // Client: restricționăm strict după clientul/locațiile arondate în userData.clientAccess (default-deny).
    if (role === "client") {
      const hasAnyAccess = allowedClientIds.size > 0 || allowedLocationsUnion.size > 0
      if (!hasAnyAccess) {
        return []
      }

      out = out.filter((r) => {
        const cid = String(r.clientId || "").trim()

        // Preferred: strict by clientId + allowed locations for that client (if configured)
        if (cid && allowedClientIds.has(cid)) {
          const allowedLocsForClient = allowedLocationsByClientId.get(cid)
          if (!allowedLocsForClient || allowedLocsForClient.size === 0) return true
          return allowedLocsForClient.has(String(r.locatie || "").trim())
        }

        // Legacy fallback (no clientId on work): allow ONLY for single-client accounts, and only for allowed locations union.
        if (!cid && allowedClientIds.size === 1 && allowedLocationsUnion.size > 0) {
          return allowedLocationsUnion.has(String(r.locatie || "").trim())
        }

        return false
      })
    }

    // Admin/Dispecer: filtre dedicate (perioadă, client, locație, echipament)
    if (isAdminOrDispatcher) {
      const getText = (id: string) =>
        String(activeFilters.find((f) => f.id === id)?.value || "")
          .trim()
          .toLowerCase()
      const range = activeFilters.find((f) => f.id === "dateRange")?.value as { from?: string; to?: string } | undefined

      const fc = getText("client")
      const fl = getText("locatie")
      const fe = getText("echipament")

      const start = range?.from ? new Date(`${range.from}T00:00:00`) : null
      const end = range?.to ? new Date(`${range.to}T23:59:59`) : null

      out = out.filter((r) => {
        if (fc && !String(r.client || "").toLowerCase().includes(fc)) return false
        if (fl && !String(r.locatie || "").toLowerCase().includes(fl)) return false
        if (fe) {
          const hay = `${r.echipament || ""} ${r.echipamentCod || ""}`.toLowerCase()
          if (!hay.includes(fe)) return false
        }
        if (start || end) {
          const d = toDateSafe(r.dataInterventie)
          if (!d) return false
          if (start && d.getTime() < start.getTime()) return false
          if (end && d.getTime() > end.getTime()) return false
        }
        return true
      })
    }

    return out
  }, [
    rows,
    role,
    allowedClientIds,
    allowedLocationsByClientId,
    allowedLocationsUnion,
    isAdminOrDispatcher,
    activeFilters,
  ])

  const columns = useMemo<ColumnDef<HistoryRow>[]>(
    () => [
      {
        accessorKey: "nrLucrare",
        header: "Nr. lucrare",
        sortingFn: (rowA, rowB) => {
          const a = extractNr((rowA.original as any)?.nrLucrare)
          const b = extractNr((rowB.original as any)?.nrLucrare)
          return a === b ? 0 : a > b ? 1 : -1
        },
        cell: ({ row }) => (
          <div className="whitespace-nowrap font-semibold text-gray-900">{row.original.nrLucrare || "-"}</div>
        ),
      },
      {
        accessorKey: "dataInterventie",
        header: "Data execuției",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {row.original.dataInterventie ? formatUiDate(row.original.dataInterventie) : "-"}
          </div>
        ),
      },
      {
        accessorKey: "locatie",
        header: "Locație",
        cell: ({ row }) => <ClampedText text={row.original.locatie} className="max-w-[260px]" />,
      },
      {
        accessorKey: "echipament",
        header: "Echipament",
        cell: ({ row }) => <ClampedText text={row.original.echipament} className="max-w-[260px]" />,
      },
      {
        accessorKey: "tehnicieni",
        header: "Tehnician",
        cell: ({ row }) => (
          <ClampedText
            text={(row.original.tehnicieni || []).join(", ")}
            className="max-w-[220px]"
          />
        ),
      },
      {
        accessorKey: "defectReclamat",
        header: "Defect reclamat",
        cell: ({ row }) => <ClampedText text={row.original.defectReclamat} className="max-w-[380px]" />,
      },
      {
        accessorKey: "constatareLaLocatie",
        header: "Constatare la locație",
        cell: ({ row }) => (
          <ClampedText text={row.original.constatareLaLocatie} className="max-w-[520px]" />
        ),
      },
      {
        accessorKey: "descriereInterventie",
        header: "Intervenție",
        cell: ({ row }) => (
          <ClampedText text={row.original.descriereInterventie} className="max-w-[520px]" />
        ),
      },
      {
        accessorKey: "durataInterventie",
        header: "Ore lucrate",
        cell: ({ row }) => <div className="whitespace-nowrap">{row.original.durataInterventie || "-"}</div>,
      },
      {
        id: "actions",
        header: "Acțiune",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="link" className="px-0">
            <Link href={`/dashboard/lucrari/${row.original.id}`}>Vezi lucrarea</Link>
          </Button>
        ),
      },
    ],
    [],
  )

  const cardsTotal = visibleRows.length
  const cardsTotalPages = Math.max(1, Math.ceil(cardsTotal / cardsPageSize))
  const cardsStart = cardsTotal === 0 ? 0 : cardsPageIndex * cardsPageSize + 1
  const cardsEnd = Math.min(cardsTotal, (cardsPageIndex + 1) * cardsPageSize)
  const pagedCardRows = useMemo(() => {
    const start = cardsPageIndex * cardsPageSize
    return visibleRows.slice(start, start + cardsPageSize)
  }, [visibleRows, cardsPageIndex, cardsPageSize])

  // keep card pagination in range when data changes
  useEffect(() => {
    const maxIdx = Math.max(0, Math.ceil(visibleRows.length / cardsPageSize) - 1)
    if (cardsPageIndex > maxIdx) setCardsPageIndex(maxIdx)
  }, [visibleRows.length, cardsPageIndex, cardsPageSize])

  const handleExportCsv = () => {
    if (!table) return
    // Export all filtered/sorted rows (not just current pagination page)
    const exportRows =
      typeof table.getPrePaginationRowModel === "function"
        ? table.getPrePaginationRowModel().rows
        : table.getRowModel().rows
    const visibleRows = exportRows.map((r: any) => r.original as HistoryRow)

    const header = [
      "Nr. lucrare",
      "Data execuției",
      "Locație",
      "Echipament",
      "Tehnicieni",
      "Defect reclamat",
      "Constatare la locație",
      "Intervenție",
      "Ore lucrate",
      "Lucrare (link)",
    ]

    const lines = [header.map(escapeCsvCell).join(",")]
    for (const r of visibleRows) {
      const link = `/dashboard/lucrari/${r.id}`
      lines.push(
        [
          r.nrLucrare,
          r.dataInterventie ? formatUiDate(r.dataInterventie) : "",
          r.locatie,
          r.echipament,
          (r.tehnicieni || []).join(", "),
          r.defectReclamat || "",
          r.constatareLaLocatie || "",
          r.descriereInterventie || "",
          r.durataInterventie || "",
          link,
        ].map(escapeCsvCell).join(","),
      )
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `istoric-interventii_${formatUiDate(new Date())}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPdf = async () => {
    if (!table) return
    
    // Get all filtered/sorted rows (same as CSV export)
    const exportRows =
      typeof table.getPrePaginationRowModel === "function"
        ? table.getPrePaginationRowModel().rows
        : table.getRowModel().rows
    const visibleRows = exportRows.map((r: any) => r.original as HistoryRow)

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    
    // Titlu
    pdf.setFontSize(16)
    pdf.setFont("helvetica", "bold")
    pdf.text("Istoric intervenții", 14, 15)
    
    // Data generării
    pdf.setFontSize(10)
    pdf.setFont("helvetica", "normal")
    pdf.text(`Generat: ${formatUiDate(new Date())}`, 14, 22)
    
    // Header tabel
    const headers = ["Nr.", "Data", "Locație", "Echipament", "Tehnician", "Ore"]
    const columnWidths = [15, 25, 50, 50, 40, 20]
    const startY = 30
    const startX = 14
    const rowHeight = 7
    
    // Desenăm header
    pdf.setFillColor(240, 240, 240)
    pdf.rect(startX, startY, columnWidths.reduce((a, b) => a + b, 0), rowHeight, "F")
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(9)
    
    let currentX = startX
    headers.forEach((header, i) => {
      pdf.text(header, currentX + 2, startY + 5)
      currentX += columnWidths[i]
    })
    
    // Desenăm rânduri
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8)
    
    let currentY = startY + rowHeight
    const pageHeight = pdf.internal.pageSize.getHeight()
    const bottomMargin = 20
    
    visibleRows.forEach((row, index) => {
      // Verificăm dacă trebuie să adăugăm o pagină nouă
      if (currentY + rowHeight > pageHeight - bottomMargin) {
        pdf.addPage()
        currentY = 20
        
        // Redesenăm header-ul pe pagina nouă
        pdf.setFillColor(240, 240, 240)
        pdf.rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight, "F")
        pdf.setFont("helvetica", "bold")
        currentX = startX
        headers.forEach((header, i) => {
          pdf.text(header, currentX + 2, currentY + 5)
          currentX += columnWidths[i]
        })
        currentY += rowHeight
        pdf.setFont("helvetica", "normal")
      }
      
      // Fundal alb/gri alternant
      if (index % 2 === 0) {
        pdf.setFillColor(255, 255, 255)
      } else {
        pdf.setFillColor(250, 250, 250)
      }
      pdf.rect(startX, currentY, columnWidths.reduce((a, b) => a + b, 0), rowHeight, "F")
      
      // Date
      const rowData = [
        row.nrLucrare || "-",
        row.dataInterventie ? formatUiDate(row.dataInterventie) : "-",
        row.locatie || "-",
        row.echipament || "-",
        (row.tehnicieni || []).join(", ") || "-",
        row.durataInterventie || "-"
      ]
      
      currentX = startX
      rowData.forEach((data, i) => {
        const text = String(data)
        // Truncăm textul dacă e prea lung
        const maxWidth = columnWidths[i] - 4
        const truncated = pdf.splitTextToSize(text, maxWidth)[0] || text
        pdf.text(truncated, currentX + 2, currentY + 5)
        currentX += columnWidths[i]
      })
      
      currentY += rowHeight
    })
    
    // Footer cu număr total
    currentY += 5
    if (currentY > pageHeight - bottomMargin) {
      pdf.addPage()
      currentY = 20
    }
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(9)
    pdf.text(`Total intervenții: ${visibleRows.length}`, startX, currentY)

    pdf.save(`istoric-interventii_${formatUiDate(new Date())}.pdf`)
  }

  return (
    <DashboardShell>
      <div className="space-y-6 pb-8">
        <DashboardHeader heading="Istoric intervenții" text="Intervențiile (lucrări cu raport generat). Textul lung este trunchiat la 4 rânduri — vezi detalii în lucrare." />

        <div className="flex items-center justify-between gap-4 flex-wrap px-1">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="table">Tabel</TabsTrigger>
              <TabsTrigger value="cards">Carduri</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            {isAdminOrDispatcher ? (
              <FilterButton
                onClick={() => setIsFilterModalOpen(true)}
                activeFilters={activeFilters.length}
              />
            ) : null}
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!table}>
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!rows.length}>
              Export PDF
            </Button>
          </div>
        </div>

        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title="Filtrare istoric intervenții"
          filterOptions={filterOptions}
          activeFilters={activeFilters}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
        />

        {viewMode === "table" ? (
          <div className="space-y-4" ref={exportRef}>
          {table ? <DataTableFilters table={table} /> : null}
          <DataTable
            columns={columns}
            data={visibleRows}
            setTable={setTable}
            defaultSort={{ id: "nrLucrare", desc: true }}
            tableClassName="table-fixed w-full"
            enablePagination={true}
            initialPageSize={10}
            onRowClick={(row) => setSelectedId((row as any)?.id || null)}
            getRowClassName={(row) =>
              selectedId && (row as any)?.id === selectedId
                ? "bg-blue-50 border-l-4 border-blue-600"
                : ""
            }
          />
          {!loading && visibleRows.length === 0 ? (
            <div className="text-sm text-muted-foreground px-1">Nu există intervenții (rapoarte generate) de afișat.</div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4" ref={exportRef}>
          {pagedCardRows.map((r) => (
            <Card key={r.id} className="border-gray-200">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-gray-900">{r.nrLucrare || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.dataInterventie ? formatUiDate(r.dataInterventie) : "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.durataInterventie || "-"}</div>
                    </div>
                    <div className="text-sm text-gray-900 mt-1">
                      <span className="font-medium">Locație:</span> {r.locatie || "-"}
                    </div>
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">Echipament:</span> {r.echipament || "-"}
                    </div>
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">Tehnicieni:</span> {(r.tehnicieni || []).join(", ") || "-"}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/dashboard/lucrari/${r.id}`}>Vezi lucrarea</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Defect reclamat</div>
                    <ClampedText text={r.defectReclamat} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Constatare la locație</div>
                    <ClampedText text={r.constatareLaLocatie} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Intervenție</div>
                    <ClampedText text={r.descriereInterventie} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {cardsTotalPages > 1 ? (
            <div className="flex items-center justify-between gap-4 flex-wrap pt-3 px-1">
              <div className="text-sm text-muted-foreground">
                {cardsStart}-{cardsEnd} din {cardsTotal}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Carduri/pagină:</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={cardsPageSize}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 10
                    setCardsPageSize(n)
                    setCardsPageIndex(0)
                  }}
                >
                  {[5, 10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsPageIndex((p) => Math.max(0, p - 1))}
                  disabled={cardsPageIndex <= 0}
                >
                  Înapoi
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsPageIndex((p) => Math.min(cardsTotalPages - 1, p + 1))}
                  disabled={cardsPageIndex >= cardsTotalPages - 1}
                >
                  Înainte
                </Button>
              </div>
            </div>
          ) : null}

          {!loading && visibleRows.length === 0 ? (
            <div className="text-sm text-muted-foreground px-1">Nu există intervenții (rapoarte generate) de afișat.</div>
          ) : null}
        </div>
      )}
      </div>
    </DashboardShell>
  )
}



"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
import { Eye, Search, X } from "lucide-react"
import { ensurePdfFont } from "@/lib/pdf/font-loader"
import { drawFooter, drawSimpleHeader } from "@/lib/pdf/common"
import { Input } from "@/components/ui/input"
import { EquipmentHistoryCheckDialog } from "@/components/equipment-history-check-dialog"

type HistoryRow = {
  id: string
  nrLucrare: string
  // For export + UI, we keep the raw date-like value (Firestore Timestamp/string/Date)
  // Data execuției = timpSosire (scanare QR / sosire la intervenție)
  dataInterventie: any
  locatie: string
  echipamentNume: string
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const role = userData?.role
  const isAdminOrDispatcher = role === "admin" || role === "dispecer"
  const isClient = role === "client"
  const isTechnician = role === "tehnician"
  const { data: works, loading } = useFirebaseCollection<Lucrare>("lucrari", [where("raportGenerat", "==", true)])

  const [table, setTable] = useState<any>(null)
  const exportRef = useRef<HTMLDivElement | null>(null)
  const prefilterAppliedRef = useRef<string>("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [cardsSearch, setCardsSearch] = useState("")

  const { loadSettings, saveFilters } = useTablePersistence("istoric-interventii")
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [cardsPageIndex, setCardsPageIndex] = useState(0)
  const [cardsPageSize, setCardsPageSize] = useState(10)

  const urlClientId = (searchParams.get("clientId") || "").trim()
  const urlClientName = (searchParams.get("clientName") || "").trim()

  useEffect(() => {
    const saved = loadSettings()
    const list = Array.isArray(saved?.activeFilters) ? saved.activeFilters : []
    const vm = list.find((f: any) => f?.id === "viewMode")?.value
    if (vm === "cards" || vm === "table") setViewMode(vm)
    const uiFilters = list.filter((f: any) => f?.id && f.id !== "viewMode")
    setActiveFilters(uiFilters)
  }, [loadSettings])

  // URL prefilter (override): dacă venim din pagina Client cu clientId/clientName, suprascriem filtrele salvate.
  useEffect(() => {
    if (!urlClientId && !urlClientName) return
    const key = `${urlClientId}|${urlClientName}`
    if (prefilterAppliedRef.current === key) return
    prefilterAppliedRef.current = key

    const nextFilters: FilterOption[] = []
    // UI-ul filtrează după nume client; păstrăm selecția vizibilă în UI.
    if (urlClientName) nextFilters.push({ id: "client", value: [urlClientName] } as any)

    setActiveFilters(nextFilters)
    // Persistăm imediat ca să nu revină filtrele vechi (suprascriere).
    saveFilters([...nextFilters, { id: "viewMode", value: viewMode } as any])
  }, [urlClientId, urlClientName, saveFilters, viewMode])

  useEffect(() => {
    // Persist both viewMode and active filters
    saveFilters([...activeFilters, { id: "viewMode", value: viewMode }])
  }, [viewMode, activeFilters, saveFilters])

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

    // Dacă pagina e pre-filtrată din URL (ex: din pagina Client),
    // resetul trebuie să scoată și query param-urile, altfel rezultatele rămân filtrate.
    if (urlClientId || urlClientName) {
      prefilterAppliedRef.current = ""
      router.replace("/dashboard/istoric-interventii")
    }
  }

  const rows = useMemo<HistoryRow[]>(() => {
    const mapped = (works || []).map((w: any) => {
      const nrLucrare = String(w.nrLucrare || w.numarRaport || "").trim()
      const locatie = String(w.locationName || w.locatie || "").trim()

      const echipamentCod = String(w.echipamentCod || "").trim()
      const echipamentNume = String(w.echipament || "").trim()

      const durata = String(w.durataInterventie || computeDurationFallback(w) || "").trim()

      return {
        id: String(w.id),
        nrLucrare,
        // Data execuției = data sosirii / scanării QR
        dataInterventie: w?.timpSosire ?? null,
        locatie,
        echipamentNume,
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

  const accessFilteredRows = useMemo(() => {
    let out = rows

    // Tehnician: pagina listă trebuie să fie goală; tehnicianul verifică istoricul doar prin scanare QR.
    if (role === "tehnician") return []

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

    return out
  }, [rows, role, allowedClientIds, allowedLocationsByClientId, allowedLocationsUnion])

  const urlPrefilteredRows = useMemo(() => {
    if (!urlClientId && !urlClientName) return accessFilteredRows

    const id = urlClientId
    const name = urlClientName.trim().toLowerCase()

    return accessFilteredRows.filter((r) => {
      const rowClientId = String(r.clientId || "").trim()
      const rowClientName = String(r.client || "").trim().toLowerCase()

      // Preferăm clientId; fallback pe nume pentru lucrări legacy fără clientId.
      if (id) {
        if (rowClientId) return rowClientId === id
        if (name) return rowClientName === name
        return false
      }

      if (name) return rowClientName === name
      return true
    })
  }, [accessFilteredRows, urlClientId, urlClientName])

  const filterOptions = useMemo<FilterOption[]>(() => {
    const uniq = (xs: string[]) =>
      Array.from(new Set(xs.map((x) => String(x || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ro"))

    const norm = (s: string) => String(s || "").trim().toLowerCase()
    const getMulti = (filters: FilterOption[], id: string): string[] => {
      const v = filters.find((f) => f.id === id)?.value
      if (!v) return []
      if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean)
      const s = String(v || "").trim()
      return s ? [s] : []
    }

    const clientOptions = uniq(urlPrefilteredRows.map((r) => String(r.client || ""))).map((v) => ({ label: v, value: v }))

    const computeLocatieOptions = (filters: FilterOption[]) => {
      const selectedClients = getMulti(filters, "client").map(norm)

      // Client portal: enforce hierarchy (like "tichet nou") -> no client => no locations
      if (isClient && selectedClients.length === 0) return []

      const base = selectedClients.length
        ? urlPrefilteredRows.filter((r) => selectedClients.includes(norm(r.client || "")))
        : urlPrefilteredRows
      return uniq(base.map((r) => String(r.locatie || ""))).map((v) => ({ label: v, value: v }))
    }

    const computeEchipamentOptions = (filters: FilterOption[]) => {
      const selectedClients = getMulti(filters, "client").map(norm)
      const selectedLocatii = getMulti(filters, "locatie").map(norm)

      // Client portal: enforce hierarchy -> no client OR no location => no equipment
      if (isClient && (selectedClients.length === 0 || selectedLocatii.length === 0)) return []

      let base = urlPrefilteredRows
      if (selectedClients.length) base = base.filter((r) => selectedClients.includes(norm(r.client || "")))
      if (selectedLocatii.length) base = base.filter((r) => selectedLocatii.includes(norm(r.locatie || "")))

      const combined = base.map((r) =>
        [r.echipamentNume, r.echipamentCod ? `(${r.echipamentCod})` : ""].filter(Boolean).join(" ").trim(),
      )
      return uniq(combined).map((v) => ({ label: v, value: v }))
    }

    const locatieOptions = computeLocatieOptions([])
    const echipamentOptions = computeEchipamentOptions([])

    return [
      {
        id: "dateRange",
        label: "Perioadă (data intervenției)",
        type: "dateRange",
      },
      {
        id: "client",
        label: "Client",
        type: "multiselect",
        options: clientOptions,
      },
      {
        id: "locatie",
        label: "Locație",
        type: "multiselect",
        options: locatieOptions,
        getOptions: computeLocatieOptions,
      },
      {
        id: "echipament",
        label: "Echipament (cod/nume)",
        type: "multiselect",
        options: echipamentOptions,
        getOptions: computeEchipamentOptions,
      },
    ]
  }, [urlPrefilteredRows, isClient])

  const visibleRows = useMemo(() => {
    let out = urlPrefilteredRows

    // Filtre UI (perioadă, client, locație, echipament) — aplicăm pentru rolurile care au UI de filtrare.
    // (înainte era doar pentru admin/dispecer, ceea ce făcea "Filtrare" inutilă pentru client)
    if (isAdminOrDispatcher || isClient) {
      const getMulti = (id: string): string[] => {
        const v = activeFilters.find((f) => f.id === id)?.value
        if (!v) return []
        if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean)
        const s = String(v || "").trim()
        return s ? [s] : []
      }
      const range = activeFilters.find((f) => f.id === "dateRange")?.value as { from?: string; to?: string } | undefined

      const fc = getMulti("client").map((x) => x.toLowerCase())
      const fl = getMulti("locatie").map((x) => x.toLowerCase())
      const fe = getMulti("echipament").map((x) => x.toLowerCase())

      const start = range?.from ? new Date(`${range.from}T00:00:00`) : null
      const end = range?.to ? new Date(`${range.to}T23:59:59`) : null

      if (fc.length || fl.length || fe.length || start || end) {
        out = out.filter((r) => {
          if (fc.length > 0 && !fc.includes(String(r.client || "").trim().toLowerCase())) return false
          if (fl.length > 0 && !fl.includes(String(r.locatie || "").trim().toLowerCase())) return false
          if (fe.length > 0) {
            const hay = [r.echipamentNume, r.echipamentCod ? `(${r.echipamentCod})` : ""]
              .filter(Boolean)
              .join(" ")
              .trim()
              .toLowerCase()
            if (!fe.includes(hay)) return false
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
    }

    return out
  }, [
    urlPrefilteredRows,
    isAdminOrDispatcher,
    isClient,
    activeFilters,
  ])

  const cardsVisibleRows = useMemo(() => {
    const q = cardsSearch.trim().toLowerCase()
    if (!q) return visibleRows
    return visibleRows.filter((r) => {
      const hay = [
        r.nrLucrare,
        r.dataInterventie,
        r.locatie,
        r.echipamentNume,
        r.echipamentCod,
        r.client,
        (r.tehnicieni || []).join(" "),
        r.defectReclamat,
        r.constatareLaLocatie,
        r.descriereInterventie,
        r.durataInterventie,
      ]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [visibleRows, cardsSearch])

  const columns = useMemo<ColumnDef<HistoryRow>[]>(
    () => [
      {
        accessorKey: "nrLucrare",
        header: "Nr. tichet",
        sortingFn: (rowA, rowB) => {
          const a = extractNr((rowA.original as any)?.nrLucrare)
          const b = extractNr((rowB.original as any)?.nrLucrare)
          return a === b ? 0 : a > b ? 1 : -1
        },
        cell: ({ row }) => (
          <div className="whitespace-nowrap font-semibold text-gray-900">{row.original.nrLucrare || "-"}</div>
        ),
        meta: {
          thClassName: "w-[90px] max-w-[90px] px-2",
          tdClassName: "w-[90px] max-w-[90px] px-2",
        },
      },
      {
        accessorKey: "dataInterventie",
        header: "Data execuției",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            {(() => {
              const d = toDateSafe(row.original.dataInterventie)
              return d ? formatUiDate(d) : "-"
            })()}
          </div>
        ),
        meta: {
          thClassName: "w-[110px] max-w-[110px] px-2",
          tdClassName: "w-[110px] max-w-[110px] px-2",
        },
      },
      {
        accessorKey: "locatie",
        header: "Locație",
        cell: ({ row }) => <ClampedText text={row.original.locatie} lines={2} className="max-w-full" />,
        meta: {
          thClassName: "w-[160px] max-w-[160px] px-2",
          tdClassName: "w-[160px] max-w-[160px] px-2",
        },
      },
      {
        accessorKey: "echipamentNume",
        header: "Echipament",
        cell: ({ row }) => (
          <div className="min-w-0">
            <ClampedText text={row.original.echipamentNume} lines={2} className="max-w-full" />
            <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
              {row.original.echipamentCod ? row.original.echipamentCod : "-"}
            </div>
          </div>
        ),
        meta: {
          thClassName: "w-[200px] max-w-[200px] px-2",
          tdClassName: "w-[200px] max-w-[200px] px-2",
        },
      },
      {
        accessorKey: "tehnicieni",
        header: "Tehnician",
        cell: ({ row }) => (
          <div className="min-w-0">
            {(row.original.tehnicieni || []).length ? (
              <div className="space-y-0.5">
                {(row.original.tehnicieni || []).map((t, idx) => (
                  <div key={`${t}-${idx}`} className="leading-snug">
                    {t}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </div>
        ),
        meta: {
          thClassName: "w-[170px] max-w-[170px] px-2",
          tdClassName: "w-[170px] max-w-[170px] px-2",
        },
      },
      {
        accessorKey: "defectReclamat",
        header: "Defect reclamat",
        cell: ({ row }) => <ClampedText text={row.original.defectReclamat} lines={4} className="max-w-full" />,
        meta: {
          thClassName: "w-[420px] min-w-[420px] px-3",
          tdClassName: "w-[420px] min-w-[420px] px-3",
        },
      },
      {
        accessorKey: "constatareLaLocatie",
        header: "Constatare la locație",
        cell: ({ row }) => (
          <ClampedText text={row.original.constatareLaLocatie} lines={4} className="max-w-full" />
        ),
        meta: {
          thClassName: "w-[420px] min-w-[420px] px-3",
          tdClassName: "w-[420px] min-w-[420px] px-3",
        },
      },
      {
        accessorKey: "descriereInterventie",
        header: "Intervenție",
        cell: ({ row }) => (
          <ClampedText text={row.original.descriereInterventie} lines={4} className="max-w-full" />
        ),
        meta: {
          thClassName: "w-[420px] min-w-[420px] px-3",
          tdClassName: "w-[420px] min-w-[420px] px-3",
        },
      },
      {
        accessorKey: "durataInterventie",
        header: "Ore lucrate",
        cell: ({ row }) => <div className="whitespace-nowrap">{row.original.durataInterventie || "-"}</div>,
        meta: {
          thClassName: "w-[90px] max-w-[90px] px-2",
          tdClassName: "w-[90px] max-w-[90px] px-2",
        },
      },
      {
        id: "actions",
        header: "Acțiune",
        cell: ({ row }) => (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href={`/dashboard/lucrari/${row.original.id}`} title="Vezi tichetul">
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
        ),
        meta: {
          // Slightly wider so "Acțiune" doesn't clip/squash in the header
          thClassName: "w-[84px] min-w-[84px] max-w-[84px] px-2 text-center whitespace-nowrap",
          tdClassName: "w-[84px] min-w-[84px] max-w-[84px] px-2 text-center whitespace-nowrap",
        },
      },
    ],
    [],
  )

  const cardsTotal = cardsVisibleRows.length
  const cardsTotalPages = Math.max(1, Math.ceil(cardsTotal / cardsPageSize))
  const cardsStart = cardsTotal === 0 ? 0 : cardsPageIndex * cardsPageSize + 1
  const cardsEnd = Math.min(cardsTotal, (cardsPageIndex + 1) * cardsPageSize)
  const pagedCardRows = useMemo(() => {
    const start = cardsPageIndex * cardsPageSize
    return cardsVisibleRows.slice(start, start + cardsPageSize)
  }, [cardsVisibleRows, cardsPageIndex, cardsPageSize])

  // keep card pagination in range when data changes
  useEffect(() => {
    const maxIdx = Math.max(0, Math.ceil(cardsVisibleRows.length / cardsPageSize) - 1)
    if (cardsPageIndex > maxIdx) setCardsPageIndex(maxIdx)
  }, [cardsVisibleRows.length, cardsPageIndex, cardsPageSize])

  const handleExportCsv = () => {
    if (!table) return
    // Export all filtered/sorted rows (not just current pagination page)
    const exportRows =
      typeof table.getPrePaginationRowModel === "function"
        ? table.getPrePaginationRowModel().rows
        : table.getRowModel().rows
    const visibleRows: HistoryRow[] = exportRows.map((r: any) => r.original as HistoryRow)

    const header = [
      "Nr. tichet",
      "Data execuției",
      "Locație",
      "Echipament",
      "Tehnicieni",
      "Defect reclamat",
      "Constatare la locație",
      "Intervenție",
      "Ore lucrate",
      "Tichet (link)",
    ]

    const lines = [header.map(escapeCsvCell).join(",")]
    for (const r of visibleRows) {
      const link = `/dashboard/lucrari/${r.id}`
      const echipamentCombined = [r.echipamentNume, r.echipamentCod].filter(Boolean).join("\n").trim()
      const dExec = toDateSafe(r.dataInterventie)
      lines.push(
        [
          r.nrLucrare,
          dExec ? formatUiDate(dExec) : "",
          r.locatie,
          echipamentCombined,
          (r.tehnicieni || []).join(", "),
          r.defectReclamat || "",
          r.constatareLaLocatie || "",
          r.descriereInterventie || "",
          r.durataInterventie || "",
          link,
        ].map(escapeCsvCell).join(","),
      )
    }

    // Add UTF-8 BOM for Excel compatibility (diacritics)
    const bom = "\uFEFF"
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8" })
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
    const visibleRows: HistoryRow[] = exportRows.map((r: any) => r.original as HistoryRow)

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
    try {
      await ensurePdfFont(pdf)
      try { pdf.setFont("NotoSans", "normal") } catch {}
    } catch {}

    const normalizeForPdf = (text = ""): string => {
      let t = String(text || "").normalize("NFC")
      t = t.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
      return t
    }

    // Optional logo
    let logoDataUrl: string | null = null
    try {
      const resp = await fetch("/nrglogo.png")
      const blob = await resp.blob()
      const reader = new FileReader()
      logoDataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
    } catch {}

    const pageH = pdf.internal.pageSize.getHeight()
    const pageW = pdf.internal.pageSize.getWidth()
    const margin = 7
    const startX = margin
    const contentW = pageW - 2 * margin

    const tableHeaders = [
      "Nr.",
      "Data",
      "Locație",
      "Echipament",
      "Tehnicieni",
      "Defect reclamat",
      "Constatare la locație",
      "Intervenție",
      "Ore",
    ]

    // Baseline widths (mm), scaled to fit contentW
    const baseW = [18, 22, 30, 32, 28, 38, 42, 42, 18]
    const sumW = baseW.reduce((a, b) => a + b, 0)
    const scale = sumW > contentW ? contentW / sumW : 1
    const widths = baseW.map((w) => Math.floor(w * scale * 10) / 10)

    const xAt = (idx: number) => startX + widths.slice(0, idx).reduce((a, b) => a + b, 0)
    const totalW = widths.reduce((a, b) => a + b, 0)

    const drawStamp = (y: number) => {
      try { pdf.setFont("NotoSans", "normal") } catch {}
      pdf.setFontSize(8).setTextColor(80, 80, 80)
      pdf.text(normalizeForPdf(`Generat: ${formatUiDate(new Date())}`), startX, y)
      return y + 5
    }

    const drawTableHeader = (y: number) => {
      pdf.setFillColor(220, 227, 240)
      pdf.rect(startX, y, totalW, 8, "F")
      pdf.setDrawColor(210, 210, 210).setLineWidth(0.2)
      pdf.rect(startX, y, totalW, 8)
      try { pdf.setFont("NotoSans", "bold") } catch {}
      pdf.setFontSize(9).setTextColor(0, 0, 0)
      tableHeaders.forEach((h, i) => {
        pdf.text(normalizeForPdf(h), xAt(i) + 2, y + 5.5)
      })
      try { pdf.setFont("NotoSans", "normal") } catch {}
      pdf.setFontSize(8)
      return y + 8
    }

    const ensureSpace = (y: number, need: number) => {
      if (y + need > pageH - margin - 22) {
        drawFooter(pdf)
        pdf.addPage()
        let yy = drawSimpleHeader(pdf, { title: "Istoric intervenții", logoDataUrl })
        yy = drawStamp(yy)
        yy = drawTableHeader(yy)
        return yy
      }
      return y
    }

    // First page
    let y = drawSimpleHeader(pdf, { title: "Istoric intervenții", logoDataUrl })
    y = drawStamp(y)
    y = drawTableHeader(y)

    const lineH = 3.6
    visibleRows.forEach((row, idx) => {
      const cells: string[] = [
        row.nrLucrare || "-",
        (() => {
          const d = toDateSafe(row.dataInterventie)
          return d ? formatUiDate(d) : "-"
        })(),
        row.locatie || "-",
        [row.echipamentNume, row.echipamentCod].filter(Boolean).join("\n") || "-",
        (row.tehnicieni || []).join("\n") || "-",
        row.defectReclamat || "-",
        row.constatareLaLocatie || "-",
        row.descriereInterventie || "-",
        row.durataInterventie || "-",
      ].map((t) => normalizeForPdf(t))

      const wrapped = cells.map((t, i) => pdf.splitTextToSize(t, Math.max(10, widths[i] - 4)))
      const maxLines = Math.max(...wrapped.map((w) => (Array.isArray(w) ? w.length : 1)))
      const rowH = Math.max(8, 4 + maxLines * lineH)

      y = ensureSpace(y, rowH)

      // Zebra
      pdf.setFillColor(idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 250)
      pdf.rect(startX, y, totalW, rowH, "F")

      // Borders
      pdf.setDrawColor(210, 210, 210).setLineWidth(0.2)
      pdf.rect(startX, y, totalW, rowH)
      let xx = startX
      widths.forEach((w, i) => {
        if (i > 0) pdf.line(xx, y, xx, y + rowH)
        xx += w
      })

      // Text
      try { pdf.setFont("NotoSans", "normal") } catch {}
      pdf.setFontSize(8).setTextColor(0, 0, 0)
      wrapped.forEach((lines, i) => {
        const textLines = Array.isArray(lines) ? lines : [String(lines)]
        pdf.text(textLines, xAt(i) + 2, y + 5)
      })

      y += rowH
    })

    drawFooter(pdf)
    pdf.save(`istoric-interventii_${formatUiDate(new Date())}.pdf`)
  }

  return (
    <DashboardShell>
      <div className="space-y-6 pb-8">
        <DashboardHeader
          heading="Istoric intervenții"
          text="Intervențiile (tichete cu raport generat). Textul lung este trunchiat la 4 rânduri — vezi detalii în tichet."
        />

        <div className="flex items-center justify-between gap-4 flex-wrap px-1">
          {!isTechnician ? (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
              <TabsList>
                <TabsTrigger value="table">Tabel</TabsTrigger>
                <TabsTrigger value="cards">Carduri</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {isTechnician || isClient ? <EquipmentHistoryCheckDialog triggerVariant="outline" /> : null}

            {isAdminOrDispatcher || isClient ? (
              <FilterButton
                onClick={() => setIsFilterModalOpen(true)}
                activeFilters={activeFilters.length}
              />
            ) : null}
            {!isTechnician ? (
              <>
                <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!table}>
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={!rows.length}>
                  Export PDF
                </Button>
              </>
            ) : null}
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

        {isTechnician ? (
          <Card className="border-gray-200">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Pentru tehnician, lista completă de intervenții este indisponibilă. Folosește butonul <span className="font-medium text-foreground">„Verifică istoric”</span> pentru a scana QR-ul echipamentului și a deschide istoricul.
            </CardContent>
          </Card>
        ) : viewMode === "table" ? (
          <div className="space-y-4" ref={exportRef}>
          {table ? <DataTableFilters table={table} showAdvancedFilters={false} globalPlaceholder="Caută în intervenții..." /> : null}
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
          {/* Search bar pentru Carduri (în table mode există deja DataTableFilters) */}
          <div className="px-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                placeholder="Caută în intervenții..."
                value={cardsSearch}
                onChange={(e) => {
                  setCardsSearch(e.target.value)
                  setCardsPageIndex(0)
                }}
                className="pl-9 pr-9"
              />
              {cardsSearch ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                  onClick={() => {
                    setCardsSearch("")
                    setCardsPageIndex(0)
                  }}
                  title="Șterge căutarea"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {pagedCardRows.map((r) => (
            <Card key={r.id} className="border-gray-200">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-gray-900">{r.nrLucrare || "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const d = toDateSafe(r.dataInterventie)
                          return d ? formatUiDate(d) : "-"
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.durataInterventie || "-"}</div>
                    </div>
                    <div className="text-sm text-gray-900 mt-1">
                      <span className="font-medium">Locație:</span> {r.locatie || "-"}
                    </div>
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">Echipament:</span>{" "}
                      {[r.echipamentNume, r.echipamentCod ? `(${r.echipamentCod})` : ""].filter(Boolean).join(" ") || "-"}
                    </div>
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">Tehnicieni:</span> {(r.tehnicieni || []).join(", ") || "-"}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/dashboard/lucrari/${r.id}`}>Vezi tichetul</Link>
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

          {!loading && cardsVisibleRows.length === 0 ? (
            <div className="text-sm text-muted-foreground px-1">Nu există intervenții (rapoarte generate) de afișat.</div>
          ) : null}
        </div>
      )}
      </div>
    </DashboardShell>
  )
}



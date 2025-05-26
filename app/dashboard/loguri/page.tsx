"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Loader2, AlertCircle } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { Log } from "@/lib/firebase/firestore"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DataTable } from "@/components/data-table/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UniversalSearch } from "@/components/universal-search"
import { ColumnSelectionButton } from "@/components/column-selection-button"
import { ColumnSelectionModal } from "@/components/column-selection-modal"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import { usePaginatedFirestore } from "@/hooks/use-paginated-firestore"
import { ServerPagination } from "@/components/data-table/server-pagination"

export default function Loguri() {
  const [activeTab, setActiveTab] = useState("tabel")
  const [searchText, setSearchText] = useState("")
  const [filteredData, setFilteredData] = useState<Log[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [table, setTable] = useState<any>(null) // Declare the table and setTable variables

  // Folosim hook-ul de paginare pentru logs
  const {
    data: logs,
    loading,
    error,
    currentPage,
    totalPages,
    goToPage,
    loadFirstPage,
    pageSize: currentPageSize,
    totalCount,
  } = usePaginatedFirestore<Log>("logs", pageSize, "timestamp", "desc")

  // Detectăm dacă suntem pe un dispozitiv mobil
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Setăm automat vizualizarea cu carduri pe mobil
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
  }

  // Define filter options based on log data
  const filterOptions = useMemo(() => {
    // Extract unique values for multiselect filters
    const tipOptions = Array.from(new Set(logs.map((log) => log.tip))).map((tip) => ({
      value: tip,
      label: tip,
    }))

    const categorieOptions = Array.from(new Set(logs.map((log) => log.categorie))).map((categorie) => ({
      value: categorie,
      label: categorie,
    }))

    const utilizatorOptions = Array.from(new Set(logs.map((log) => log.utilizator))).map((utilizator) => ({
      value: utilizator,
      label: utilizator,
    }))

    return [
      {
        id: "timestamp",
        label: "Data și ora",
        type: "dateRange",
        value: null,
      },
      {
        id: "tip",
        label: "Tip",
        type: "multiselect",
        options: tipOptions,
        value: [],
      },
      {
        id: "categorie",
        label: "Categorie",
        type: "multiselect",
        options: categorieOptions,
        value: [],
      },
      {
        id: "utilizator",
        label: "Utilizator",
        type: "multiselect",
        options: utilizatorOptions,
        value: [],
      },
    ]
  }, [logs])

  // Apply active filters
  const applyFilters = useCallback(
    (data: Log[]) => {
      if (!activeFilters.length) return data

      return data.filter((item) => {
        return activeFilters.every((filter) => {
          // If filter has no value, ignore it
          if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) {
            return true
          }

          switch (filter.id) {
            case "timestamp":
              if (filter.value.from || filter.value.to) {
                try {
                  if (!item.timestamp) return false

                  const itemDate = item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp)

                  if (filter.value.from) {
                    const fromDate = new Date(filter.value.from)
                    fromDate.setHours(0, 0, 0, 0)
                    if (itemDate < fromDate) return false
                  }

                  if (filter.value.to) {
                    const toDate = new Date(filter.value.to)
                    toDate.setHours(23, 59, 59, 999)
                    if (itemDate > toDate) return false
                  }

                  return true
                } catch (error) {
                  console.error("Eroare la parsarea datei:", error)
                  return true
                }
              }
              return true

            case "tip":
            case "categorie":
            case "utilizator":
              // For multiselect filters
              if (Array.isArray(filter.value)) {
                return filter.value.includes(item[filter.id])
              }
              return true

            default:
              return true
          }
        })
      })
    },
    [activeFilters],
  )

  // Apply manual filtering based on search text and active filters
  useEffect(() => {
    let filtered = logs

    // Apply active filters
    if (activeFilters.length) {
      filtered = applyFilters(filtered)
    }

    // Apply global search
    if (searchText.trim()) {
      const lowercasedFilter = searchText.toLowerCase()
      filtered = filtered.filter((item) => {
        return Object.keys(item).some((key) => {
          const value = item[key]
          if (value === null || value === undefined) return false

          // Handle arrays (if any)
          if (Array.isArray(value)) {
            return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
          }

          // Convert to string for search
          return String(value).toLowerCase().includes(lowercasedFilter)
        })
      })
    }

    setFilteredData(filtered)
  }, [searchText, logs, activeFilters, applyFilters])

  const handleApplyFilters = (filters: FilterOption[]) => {
    // Filter only filters that have values
    const filtersWithValues = filters.filter((filter) => {
      if (filter.type === "dateRange") {
        return filter.value && (filter.value.from || filter.value.to)
      }
      if (Array.isArray(filter.value)) {
        return filter.value.length > 0
      }
      return filter.value
    })

    setActiveFilters(filtersWithValues)
  }

  const handleResetFilters = () => {
    setActiveFilters([])
  }

  const getTipColor = (tip: string) => {
    switch (tip.toLowerCase()) {
      case "informație":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
      case "avertisment":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
      case "eroare":
        return "bg-red-100 text-red-800 hover:bg-red-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString("ro-RO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  // Populate column options when table is available
  useEffect(() => {
    if (table) {
      const allColumns = table.getAllColumns()
      const options = allColumns
        .filter((column) => column.getCanHide())
        .map((column) => ({
          id: column.id,
          label:
            typeof column.columnDef.header === "string"
              ? column.columnDef.header
              : column.id.charAt(0).toUpperCase() + column.id.slice(1),
          isVisible: column.getIsVisible(),
        }))
      setColumnOptions(options)
    }
  }, [table, isColumnModalOpen])

  const handleToggleColumn = (columnId: string) => {
    if (!table) return

    const column = table.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Update options state to reflect changes
      setColumnOptions((prev) =>
        prev.map((option) => (option.id === columnId ? { ...option, isVisible: !option.isVisible } : option)),
      )
    }
  }

  const handleSelectAllColumns = () => {
    if (!table) return

    table.getAllColumns().forEach((column) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true)
      }
    })

    // Update all options to visible
    setColumnOptions((prev) => prev.map((option) => ({ ...option, isVisible: true })))
  }

  const handleDeselectAllColumns = () => {
    if (!table) return

    table.getAllColumns().forEach((column) => {
      if (column.getCanHide() && column.id !== "actions") {
        column.toggleVisibility(false)
      }
    })

    // Update all options except actions to not visible
    setColumnOptions((prev) =>
      prev.map((option) => ({
        ...option,
        isVisible: option.id === "actions" ? true : false,
      })),
    )
  }

  // Definim coloanele pentru DataTable
  const columns = [
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      enableFiltering: true,
      cell: ({ row }: any) => <span className="font-mono text-sm">{formatDate(row.original.timestamp)}</span>,
    },
    {
      accessorKey: "utilizator",
      header: "Utilizator",
      enableFiltering: true,
    },
    {
      accessorKey: "actiune",
      header: "Acțiune",
      enableFiltering: true,
    },
    {
      accessorKey: "detalii",
      header: "Detalii",
      enableFiltering: true,
      cell: ({ row }: any) => <div className="max-w-[300px]">{row.original.detalii}</div>,
    },
    {
      accessorKey: "tip",
      header: "Tip",
      enableFiltering: true,
      cell: ({ row }: any) => <Badge className={getTipColor(row.original.tip)}>{row.original.tip}</Badge>,
    },
    {
      accessorKey: "categorie",
      header: "Categorie",
      enableFiltering: true,
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Loguri Sistem"
        text={`Monitorizați activitatea utilizatorilor și evenimentele sistemului (${totalCount} loguri)`}
      />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="tabel">Tabel</TabsTrigger>
                <TabsTrigger value="carduri">Carduri</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Adăugăm câmpul de căutare universal și butoanele de filtrare și selecție coloane */}
        <div className="flex flex-col sm:flex-row gap-2">
          <UniversalSearch onSearch={setSearchText} className="flex-1" />
          <div className="flex gap-2">
            <FilterButton onClick={() => setIsFilterModalOpen(true)} activeFilters={activeFilters.length} />
            <ColumnSelectionButton
              onClick={() => setIsColumnModalOpen(true)}
              hiddenColumnsCount={columnOptions.filter((col) => !col.isVisible).length}
            />
          </div>
        </div>

        {/* Modal de filtrare */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title="Filtrare loguri"
          filterOptions={filterOptions}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
        />

        {/* Modal de selecție coloane */}
        <ColumnSelectionModal
          isOpen={isColumnModalOpen}
          onClose={() => setIsColumnModalOpen(false)}
          title="Vizibilitate coloane"
          columns={columnOptions}
          onToggleColumn={handleToggleColumn}
          onSelectAll={handleSelectAllColumns}
          onDeselectAll={handleDeselectAllColumns}
        />

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Se încarcă logurile...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
          <>
            <DataTable
              columns={columns}
              data={filteredData}
              defaultSort={{ id: "timestamp", desc: true }}
              table={table}
              setTable={setTable}
              showFilters={false}
              disablePagination={true} // Adaugă această proprietate
            />
            <ServerPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={currentPageSize}
              onPageChange={goToPage}
              onPageSizeChange={handlePageSizeChange}
              isLoading={loading}
            />
          </>
        ) : (
          <>
            <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 w-full overflow-auto">
              {filteredData.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-mono text-sm text-muted-foreground">{formatDate(log.timestamp)}</p>
                      </div>
                      <Badge className={getTipColor(log.tip)}>{log.tip}</Badge>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h3 className="font-medium">{log.actiune}</h3>
                        <p className="text-sm mt-1 text-muted-foreground line-clamp-2" title={log.detalii}>
                          {log.detalii}
                        </p>
                      </div>

                      <div className="pt-2 border-t space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Utilizator:</span>
                          <span className="text-sm">{log.utilizator}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium text-muted-foreground">Categorie:</span>
                          <span className="text-sm">{log.categorie}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredData.length === 0 && (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nu există loguri care să corespundă criteriilor de căutare.</p>
                </div>
              )}
            </div>
            <ServerPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={currentPageSize}
              onPageChange={goToPage}
              onPageSizeChange={handlePageSizeChange}
              isLoading={loading}
            />
          </>
        )}
      </div>
    </DashboardShell>
  )
}

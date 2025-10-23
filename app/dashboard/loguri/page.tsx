"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Loader2, AlertCircle } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
// Tipurile din colecția `logs` folosesc câmpuri RO; folosim any pentru flexibilitate aici
import { Alert, AlertDescription } from "@/components/ui/alert"
import { orderBy, query, collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { DataTable } from "@/components/data-table/data-table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { EmailEvent } from "@/lib/firebase/firestore"
import { UniversalSearch } from "@/components/universal-search"
import { ColumnSelectionButton } from "@/components/column-selection-button"
import { ColumnSelectionModal } from "@/components/column-selection-modal"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import { useTablePersistence } from "@/hooks/use-table-persistence"

export default function Loguri() {
  const [activeTab, setActiveTab] = useState("tabel")
  const [activeMainTab, setActiveMainTab] = useState("sistem")
  const [logs, setLogs] = useState<any[]>([])
  const [emailEvents, setEmailEvents] = useState<EmailEvent[]>([])
  const [emailFiltered, setEmailFiltered] = useState<EmailEvent[]>([])
  const [emailFilters, setEmailFilters] = useState<FilterOption[]>([])
  const [emailSearchText, setEmailSearchText] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<any>(null)
  const [searchText, setSearchText] = useState("")
  const [filteredData, setFilteredData] = useState<any[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting, saveSearchText } = useTablePersistence("loguri")
  const emailPersistence = useTablePersistence("loguri-email")

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

  // Încărcăm logurile din Firebase
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)

        const logsQuery = query(collection(db, "logs"), orderBy("timestamp", "desc"))
        const querySnapshot = await getDocs(logsQuery)

        const logsData: any[] = []
        querySnapshot.forEach((doc) => {
          logsData.push({ id: doc.id, ...doc.data() } as any)
        })

        setLogs(logsData)
        setFilteredData(logsData) // Inițializăm datele filtrate
        setError(null)
      } catch (err) {
        console.error("Eroare la încărcarea logurilor:", err)
        setError("A apărut o eroare la încărcarea logurilor.")
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [])

  // Încărcăm emailEvents
  useEffect(() => {
    const fetchEmailEvents = async () => {
      try {
        const q = query(collection(db, "emailEvents"), orderBy("createdAt", "desc"))
        const qs = await getDocs(q)
        const events: EmailEvent[] = []
        qs.forEach((d) => events.push({ id: d.id, ...(d.data() as any) }))
        setEmailEvents(events)
        setEmailFiltered(events)
      } catch (e) {
        console.error("Eroare la încărcarea emailEvents:", e)
      }
    }
    fetchEmailEvents()
  }, [])

  // Email filters: build options dynamically
  const emailFilterOptions = useMemo((): FilterOption[] => {
    const types = Array.from(new Set(emailEvents.map((e: any) => e.type))).map((v) => ({ value: v, label: v }))
    const statuses = Array.from(new Set(emailEvents.map((e: any) => e.status))).map((v) => ({ value: v, label: v }))
    return [
      { id: "createdAt", label: "Data creării", type: "dateRange", value: null },
      { id: "type", label: "Tip", type: "multiselect", options: types, value: [] },
      { id: "status", label: "Status", type: "multiselect", options: statuses, value: [] },
    ]
  }, [emailEvents])

  const applyEmailFilters = useCallback((data: EmailEvent[]): EmailEvent[] => {
    if (!emailFilters.length) return data
    return data.filter((item: any) => {
      return emailFilters.every((filter) => {
        if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) return true
        switch (filter.id) {
          case "createdAt":
            if (filter.value.from || filter.value.to) {
              try {
                const d = item.createdAt?.toDate ? item.createdAt.toDate() : (item.createdAt ? new Date(item.createdAt) : null)
                if (!d) return false
                if (filter.value.from) {
                  const from = new Date(filter.value.from)
                  from.setHours(0,0,0,0)
                  if (d < from) return false
                }
                if (filter.value.to) {
                  const to = new Date(filter.value.to)
                  to.setHours(23,59,59,999)
                  if (d > to) return false
                }
                return true
              } catch { return true }
            }
            return true
          case "type":
          case "status":
            if (Array.isArray(filter.value)) {
              return filter.value.includes(item[filter.id as string])
            }
            return true
          default:
            return true
        }
      })
    })
  }, [emailFilters])

  // Load persisted settings for email tab
  useEffect(() => {
    const saved = emailPersistence.loadSettings()
    if (saved.activeFilters) setEmailFilters(saved.activeFilters)
    if (saved.searchText) setEmailSearchText(saved.searchText)
  }, [emailPersistence])

  // Recompute filtered email events on changes
  useEffect(() => {
    let result = [...emailEvents]
    if (emailFilters.length) result = applyEmailFilters(result)
    if (emailSearchText.trim()) {
      const q = emailSearchText.toLowerCase()
      result = result.filter((ev: any) => {
        const fields = [ev.lucrareId, ev.clientId, (ev.to||[]).join(','), ev.subject, ev.messageId, ev.type, ev.status]
        return fields.some((f) => (f ? String(f).toLowerCase().includes(q) : false))
      })
    }
    setEmailFiltered(result)
  }, [emailEvents, emailFilters, emailSearchText, applyEmailFilters])

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.searchText) {
      setSearchText(savedSettings.searchText)
    }
  }, [loadSettings])

  // Handler pentru schimbarea search text-ului
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    saveSearchText(value)
  }

  // Define filter options based on log data
  const filterOptions = useMemo((): FilterOption[] => {
    // Extract unique values for multiselect filters
    const tipOptions = Array.from(new Set(logs.map((log) => (log as any).tip))).map((tip) => ({
      value: tip,
      label: tip,
    }))

    const categorieOptions = Array.from(new Set(logs.map((log) => (log as any).categorie))).map((categorie) => ({
      value: categorie,
      label: categorie,
    }))

    const utilizatorOptions = Array.from(new Set(logs.map((log) => (log as any).utilizator))).map((utilizator) => ({
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
    (data: any[]) => {
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
                return filter.value.includes((item as any)[filter.id as string])
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
    // Dacă nu avem date, nu facem nimic
    if (!logs || logs.length === 0) {
      setFilteredData([])
      return
    }

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
  }, [searchText, logs, activeFilters]) // Eliminat applyFilters din dependencies

  // Forțăm refiltrarea când datele se încarcă și avem un searchText salvat
  useEffect(() => {
    if (!loading && logs && logs.length > 0 && searchText.trim()) {
      // Trigger o refiltrare pentru a aplica searchText-ul încărcat din localStorage
      const timeoutId = setTimeout(() => {
        // Forțăm o actualizare a filteredData aplicând din nou filtrarea
        let filtered = logs

        if (activeFilters.length) {
          filtered = applyFilters(filtered)
        }

        if (searchText.trim()) {
          const lowercasedFilter = searchText.toLowerCase()
          filtered = filtered.filter((item) => {
            return Object.keys(item).some((key) => {
              const value = item[key]
              if (value === null || value === undefined) return false

              if (Array.isArray(value)) {
                return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
              }

              return String(value).toLowerCase().includes(lowercasedFilter)
            })
          })
        }

        setFilteredData(filtered)
      }, 100) // Mic delay pentru a se asigura că toate datele sunt încărcate

      return () => clearTimeout(timeoutId)
    }
  }, [loading, logs, searchText, activeFilters]) // Trigger când loading se termină

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
    saveFilters(filtersWithValues) // Salvăm filtrele în localStorage
  }

  const handleResetFilters = () => {
    setActiveFilters([])
    saveFilters([]) // Salvăm lista goală în localStorage
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
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      const hour = date.getHours().toString().padStart(2, "0")
      const minute = date.getMinutes().toString().padStart(2, "0")
      const second = date.getSeconds().toString().padStart(2, "0")
      
      return `${day}.${month}.${year} ${hour}:${minute}:${second}`
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
        .filter((column: any) => column.getCanHide())
        .map((column: any) => ({
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

    table.getAllColumns().forEach((column: any) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true)
      }
    })

    // Update all options to visible
    setColumnOptions((prev) => prev.map((option) => ({ ...option, isVisible: true })))
  }

  const handleDeselectAllColumns = () => {
    if (!table) return

    table.getAllColumns().forEach((column: any) => {
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
        text="Monitorizați activitatea utilizatorilor și evenimentele sistemului"
      />

      <div className="space-y-4">
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab}>
          <TabsList>
            <TabsTrigger value="sistem">Loguri sistem</TabsTrigger>
            <TabsTrigger value="emailuri">Emailuri</TabsTrigger>
          </TabsList>
          <TabsContent value="sistem">
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
          <UniversalSearch onSearch={handleSearchChange} initialValue={searchText} className="flex-1" />
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
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
          <DataTable
            columns={columns}
            data={filteredData}
            defaultSort={{ id: "timestamp", desc: true }}
            table={table}
            setTable={setTable}
            showFilters={false}
            persistenceKey="loguri"
          />
        ) : (
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
        )}
          </TabsContent>

          <TabsContent value="emailuri">
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <UniversalSearch onSearch={(v) => { setEmailSearchText(v); emailPersistence.saveSearchText(v) }} initialValue={emailSearchText} className="flex-1" />
                <div className="flex gap-2">
                  <FilterButton onClick={() => setIsFilterModalOpen(true)} activeFilters={activeFilters.length} />
                </div>
              </div>
              <FilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                title="Filtrare emailuri"
                filterOptions={emailFilterOptions}
                onApplyFilters={(filters) => { setEmailFilters(filters); emailPersistence.saveFilters(filters) }}
                onResetFilters={() => { setEmailFilters([]); emailPersistence.saveFilters([]) }}
              />
              {emailFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nu există evenimente de email.</p>
              ) : (
                <div className="grid gap-3 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
                  {emailFiltered.map((ev) => (
                    <Card key={ev.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{ev.type}</Badge>
                          <span className="text-xs text-muted-foreground">{(ev as any)?.createdAt?.toDate ? (ev as any).createdAt.toDate().toLocaleString('ro-RO') : '-'}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1 text-sm">
                          {ev.lucrareId && <div>Lucrare: <span className="font-mono">{ev.lucrareId}</span></div>}
                          {Array.isArray(ev.to) && ev.to.length > 0 && <div>Către: <span className="truncate inline-block max-w-full align-top">{ev.to.join(', ')}</span></div>}
                          {ev.subject && <div>Subiect: <span className="truncate inline-block max-w-full align-top">{ev.subject}</span></div>}
                          <div>Status: <Badge variant="outline" className="ml-1">{ev.status}</Badge></div>
                          {ev.messageId && <div>MsgID: <span className="font-mono text-xs">{ev.messageId}</span></div>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  )
}

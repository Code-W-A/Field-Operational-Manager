"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { 
  Archive, 
  ArchiveRestore, 
  Download, 
  Eye,
  Calendar,
  User,
  MapPin,
  FileText,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  X
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, where, orderBy, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { formatDate } from "@/lib/utils/date-formatter"
import { getWorkStatusClass } from "@/lib/utils/status-classes"
import { WORK_STATUS } from "@/lib/utils/constants"
import { updateLucrare, type Lucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable } from "@/components/data-table/data-table"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { FilterModal } from "@/components/filter-modal"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function LucrariArhivate() {
  const { userData } = useAuth()
  const router = useRouter()

  // State pentru date și loading
  const [lucrariArhivate, setLucrariArhivate] = useState<Lucrare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // State pentru search și view
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards")

  // State pentru filtre și sortări
  const [activeFilters, setActiveFilters] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [sortOption, setSortOption] = useState<{ field: string; direction: "asc" | "desc" }>({
    field: "updatedAt",
    direction: "desc"
  })

  // State pentru date filtrate
  const [filteredLucrari, setFilteredLucrari] = useState<Lucrare[]>([])

  // Persistența filtrelor și sortărilor
  const { loadSettings, saveFilters, saveSorting, saveSearchText } = useTablePersistence("arhivate")

  // Verificăm accesul - doar admin și dispecer
  const hasAccess = userData?.role === "admin" || userData?.role === "dispecer"

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.sorting) {
      const sorting = savedSettings.sorting[0]
      if (sorting) {
        setSortOption({
          field: sorting.id,
          direction: sorting.desc ? "desc" : "asc"
        })
      }
    }
    if (savedSettings.searchText) {
      setSearchTerm(savedSettings.searchText)
    }
  }, [loadSettings])

  // Funcție pentru încărcarea lucrărilor arhivate
  const fetchArchivedWorks = useCallback(async () => {
    if (!hasAccess) {
      router.push("/dashboard")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const lucrarireQuery = query(
        collection(db, "lucrari"),
        where("statusLucrare", "==", WORK_STATUS.ARCHIVED),
        orderBy("updatedAt", "desc")
      )

      const querySnapshot = await getDocs(lucrarireQuery)
      const lucrari = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lucrare[]

      setLucrariArhivate(lucrari)
    } catch (error) {
      console.error("Eroare la încărcarea lucrărilor arhivate:", error)
      setError("Nu s-au putut încărca lucrările arhivate")
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca lucrările arhivate.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [hasAccess, router])

  // Încărcăm datele la mount
  useEffect(() => {
    fetchArchivedWorks()
  }, [fetchArchivedWorks])

  // Opțiuni pentru filtre
  const filterOptions = useMemo(() => {
    if (!lucrariArhivate.length) return []

    // Extragem toate valorile unice pentru tipuri de lucrări
    const tipuriLucrare = Array.from(new Set(lucrariArhivate.map((lucrare) => lucrare.tipLucrare))).map((tip) => ({
      value: tip,
      label: tip,
    }))

    // Extragem toți tehnicienii unici
    const tehnicieniOptions = Array.from(new Set(lucrariArhivate.flatMap((lucrare) => lucrare.tehnicieni))).map(
      (tehnician) => ({
        value: tehnician,
        label: tehnician,
      }),
    )

    // Extragem toți clienții unici
    const clienti = Array.from(new Set(lucrariArhivate.map((lucrare) => lucrare.client))).map((client) => ({
      value: client,
      label: client,
    }))

    // Extragem toate locațiile unice
    const locatii = Array.from(new Set(lucrariArhivate.map((lucrare) => lucrare.locatie)))
      .filter(Boolean)
      .map((locatie) => ({
        value: locatie,
        label: locatie,
      }))

    // Extragem toate statusurile de facturare unice
    const statusuriFacturare = Array.from(new Set(lucrariArhivate.map((lucrare) => lucrare.statusFacturare))).map(
      (status) => ({
        value: status,
        label: status,
      }),
    )

    // Extragem toate statusurile de echipament unice
    const statusuriEchipament = Array.from(
      new Set(lucrariArhivate.map((lucrare) => lucrare.statusEchipament || "Nedefinit")),
    ).map((status) => ({
      value: status,
      label: status === "Nedefinit" ? "Nedefinit" : status,
    }))

         return [
       {
         id: "dataEmiterii",
         label: "Data emiterii",
         type: "dateRange" as const,
         value: null,
       },
       {
         id: "dataInterventie",
         label: "Data intervenție",
         type: "dateRange" as const,
         value: null,
       },
             {
         id: "tipLucrare",
         label: "Tip lucrare",
         type: "multiselect" as const,
         options: tipuriLucrare,
         value: [],
       },
       {
         id: "tehnicieni",
         label: "Tehnicieni",
         type: "multiselect" as const,
         options: tehnicieniOptions,
         value: [],
       },
       {
         id: "client",
         label: "Client",
         type: "multiselect" as const,
         options: clienti,
         value: [],
       },
       {
         id: "locatie",
         label: "Locație",
         type: "multiselect" as const,
         options: locatii,
         value: [],
       },
       {
         id: "statusFacturare",
         label: "Status facturare",
         type: "multiselect" as const,
         options: statusuriFacturare,
         value: [],
       },
       {
         id: "statusEchipament",
         label: "Status echipament",
         type: "multiselect" as const,
         options: statusuriEchipament,
         value: [],
       },
       {
         id: "numarRaport",
         label: "Cu număr raport",
         type: "multiselect" as const, 
         options: [
           { value: "cu_numar", label: "Cu număr raport" },
           { value: "fara_numar", label: "Fără număr raport" },
         ],
         value: [],
       },
       {
         id: "necesitaOferta",
         label: "Necesită ofertă",
         type: "multiselect" as const,
         options: [
           { value: "da", label: "Da" },
           { value: "nu", label: "Nu" },
         ],
         value: [],
       },
    ]
  }, [lucrariArhivate])

  // Funcție pentru aplicarea filtrelor
  const applyFilters = useCallback(
    (data: Lucrare[]) => {
      if (!activeFilters.length) return data

      return data.filter((item) => {
        return activeFilters.every((filter) => {
          if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) return true

          switch (filter.id) {
            case "dataEmiterii":
            case "dataInterventie":
              if (filter.value?.start && filter.value?.end) {
                const itemDate = new Date(item[filter.id])
                const startDate = new Date(filter.value.start)
                const endDate = new Date(filter.value.end)
                return itemDate >= startDate && itemDate <= endDate
              }
              return true

            case "tehnicieni":
              return filter.value.some((filterTechnician: string) =>
                item.tehnicieni.includes(filterTechnician)
              )

                         case "tipLucrare":
             case "client":
             case "locatie":
             case "statusFacturare":
             case "statusEchipament":
               return filter.value.includes((item as any)[filter.id] || "Nedefinit")

            case "numarRaport":
              if (filter.value.includes("cu_numar")) {
                return item.numarRaport && item.numarRaport.trim() !== ""
              }
              if (filter.value.includes("fara_numar")) {
                return !item.numarRaport || item.numarRaport.trim() === ""
              }
              return true

            case "necesitaOferta":
              if (filter.value.includes("da")) {
                return item.necesitaOferta === true
              }
              if (filter.value.includes("nu")) {
                return item.necesitaOferta === false
              }
              return true

            default:
              return true
          }
        })
      })
    },
    [activeFilters]
  )

  // Funcție pentru sortare
  const applySorting = useCallback(
    (data: Lucrare[]) => {
             return [...data].sort((a, b) => {
         let aValue = (a as any)[sortOption.field]
         let bValue = (b as any)[sortOption.field]

                 // Tratare specială pentru date
         if (sortOption.field === "dataEmiterii" || sortOption.field === "dataInterventie" || sortOption.field === "updatedAt") {
           aValue = new Date((aValue as any)).getTime()
           bValue = new Date((bValue as any)).getTime()
         }

        // Tratare pentru string-uri
        if (typeof aValue === "string" && typeof bValue === "string") {
          const comparison = aValue.localeCompare(bValue)
          return sortOption.direction === "asc" ? comparison : -comparison
        }

        // Tratare pentru numere
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortOption.direction === "asc" ? aValue - bValue : bValue - aValue
        }

        return 0
      })
    },
    [sortOption]
  )

  // Aplicăm filtrarea, sortarea și căutarea
  useEffect(() => {
    let result = lucrariArhivate

    // Aplicăm filtrele
    if (activeFilters.length) {
      result = applyFilters(result)
    }

    // Aplicăm sortarea
    result = applySorting(result)

    // Aplicăm căutarea fuzzy
    if (searchTerm.trim()) {
      const lowercasedFilter = searchTerm.toLowerCase()
      result = result.filter((item) => {
        return Object.keys(item).some((key) => {
          const value = item[key as keyof Lucrare]
          if (value === null || value === undefined) return false

          // Gestionăm array-uri (cum ar fi tehnicieni)
          if (Array.isArray(value)) {
            return value.some((v) => String(v).toLowerCase().includes(lowercasedFilter))
          }

          // Convertim la string pentru căutare
          return String(value).toLowerCase().includes(lowercasedFilter)
        })
      })
    }

    setFilteredLucrari(result)
  }, [lucrariArhivate, activeFilters, sortOption, searchTerm, applyFilters, applySorting])

  // Handlers pentru persistență
  const handleFiltersChange = (newFilters: any[]) => {
    setActiveFilters(newFilters)
    saveFilters(newFilters)
  }

  const handleSortChange = (field: string, direction: "asc" | "desc") => {
    const newSort = { field, direction }
    setSortOption(newSort)
    saveSorting([{ id: field, desc: direction === "desc" }])
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    saveSearchText(value)
  }

  // Funcție pentru dezarhivare
  const handleDezarhivare = async (lucrareId: string) => {
    try {
      await updateLucrare(lucrareId, { statusLucrare: WORK_STATUS.COMPLETED })
      toast({
        title: "Succes",
        description: "Lucrarea a fost dezarhivată cu succes.",
      })
      
      // Reîncărcăm datele
      fetchArchivedWorks()
    } catch (error) {
      console.error("Eroare la dezarhivare:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut dezarhiva lucrarea.",
        variant: "destructive",
      })
    }
  }

  // Opțiuni pentru sortare
  const sortOptions = [
    { field: "updatedAt", label: "Data actualizării", defaultDirection: "desc" as const },
    { field: "dataEmiterii", label: "Data emiterii", defaultDirection: "desc" as const },
    { field: "dataInterventie", label: "Data intervenție", defaultDirection: "desc" as const },
    { field: "client", label: "Client", defaultDirection: "asc" as const },
    { field: "tipLucrare", label: "Tip lucrare", defaultDirection: "asc" as const },
    { field: "statusFacturare", label: "Status facturare", defaultDirection: "asc" as const },
    { field: "numarRaport", label: "Număr raport", defaultDirection: "asc" as const },
  ]

  // Coloane pentru tabel
  const columns = [
    {
      id: "client",
      header: "Client",
      cell: ({ row }: { row: any }) => (
        <div className="max-w-[200px] truncate font-medium">
          {row.client}
        </div>
      ),
    },
    {
      id: "locatie",
      header: "Locație",
      cell: ({ row }: { row: any }) => (
        <div className="max-w-[150px] truncate">
          {row.locatie}
        </div>
      ),
    },
    {
      id: "tipLucrare",
      header: "Tip Lucrare",
      cell: ({ row }: { row: any }) => (
        <div className="max-w-[120px] truncate">
          {row.tipLucrare}
        </div>
      ),
    },
         {
       id: "tehnicieni",
       header: "Tehnicieni",
       cell: ({ row }: { row: any }) => {
         const tehnicieni = row.tehnicieni || []
         return (
           <div className="flex flex-wrap gap-1">
             {tehnicieni.slice(0, 2).map((tehnician: string, index: number) => (
               <Badge key={index} variant="secondary" className="text-xs">
                 {tehnician}
               </Badge>
             ))}
             {tehnicieni.length > 2 && (
               <Badge variant="outline" className="text-xs">
                 +{tehnicieni.length - 2}
               </Badge>
             )}
             {tehnicieni.length === 0 && (
               <span className="text-xs text-gray-400">Neatribuit</span>
             )}
           </div>
         )
       },
     },
    {
      id: "dataInterventie",
      header: "Data Intervenție",
      cell: ({ row }: { row: any }) => formatDate(row.dataInterventie),
    },
    {
      id: "statusFacturare",
      header: "Status Facturare",
      cell: ({ row }: { row: any }) => (
        <Badge variant="outline">{row.statusFacturare}</Badge>
      ),
    },
    {
      id: "actions",
      header: "Acțiuni",
      cell: ({ row }: { row: any }) => (
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/dashboard/arhivate/${row.id}`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Vizualizează detalii</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDezarhivare(row.id)}
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dezarhivează lucrarea</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {row.raportGenerat && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => router.push(`/raport/${row.id}`)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Descarcă raport</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
    },
  ]

  if (!hasAccess) {
    return null
  }

  if (loading) {
    return (
      <TooltipProvider>
        <DashboardShell>
          <DashboardHeader heading="Lucrări Arhivate" text="Se încarcă lucrările arhivate..." />
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Se încarcă lucrările arhivate...</p>
            </div>
          </div>
        </DashboardShell>
      </TooltipProvider>
    )
  }

  if (error) {
    return (
      <TooltipProvider>
        <DashboardShell>
          <DashboardHeader heading="Lucrări Arhivate" text="Eroare la încărcarea datelor" />
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Archive className="h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Eroare la încărcare</h3>
              <p className="text-gray-500 text-center max-w-md mb-4">{error}</p>
              <Button onClick={fetchArchivedWorks}>Încearcă din nou</Button>
            </CardContent>
          </Card>
        </DashboardShell>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <DashboardShell>
        <DashboardHeader 
          heading="Lucrări Arhivate" 
          text={`${filteredLucrari.length} ${searchTerm || activeFilters.length ? 'rezultate filtrate' : 'lucrări arhivate'} din ${lucrariArhivate.length} total`}
        />

        {/* Info despre search optimal */}
        {lucrariArhivate.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6">
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <Search className="h-4 w-4" />
              <span>
                <strong>Search optimizat:</strong> Caută instant în toate câmpurile (client, locație, tip lucrare, tehnicieni, ID) 
                din {lucrariArhivate.length} lucrări arhivate.
              </span>
            </div>
          </div>
        )}

        {/* Controls: Search, Filtre, Sortare, View Mode */}
        <div className="flex flex-col space-y-4 mb-6">
          
          {/* Mobile: Fiecare element pe rândul său | Desktop: Layout original */}
          <div className="flex flex-col space-y-3 md:space-y-4">
            
            {/* Rândul 1: Search input (full width pe mobil) */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Caută în toate câmpurile..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => handleSearchChange("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Pe desktop: View mode în dreapta, pe mobil: pe rândul următor */}
              <div className="hidden md:block">
                <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "cards" | "table")}>
                  <TabsList>
                    <TabsTrigger value="cards">Card-uri</TabsTrigger>
                    <TabsTrigger value="table">Tabel</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {/* Rândul 2: Butoane filtre și sortare */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                {/* Buton filtre */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFilterModalOpen(true)}
                  className="relative"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtre
                  {activeFilters.length > 0 && (
                    <Badge className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {activeFilters.length}
                    </Badge>
                  )}
                </Button>

                {/* Dropdown sortare */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {sortOption.direction === "asc" ? (
                        <SortAsc className="h-4 w-4 mr-2" />
                      ) : (
                        <SortDesc className="h-4 w-4 mr-2" />
                      )}
                      Sortare
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Sortează după</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {sortOptions.map((option) => (
                      <div key={option.field}>
                        <DropdownMenuItem
                          onClick={() => handleSortChange(option.field, "asc")}
                          className="flex items-center justify-between"
                        >
                          <span>{option.label} (A-Z)</span>
                          <SortAsc className="h-4 w-4" />
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSortChange(option.field, "desc")}
                          className="flex items-center justify-between"
                        >
                          <span>{option.label} (Z-A)</span>
                          <SortDesc className="h-4 w-4" />
                        </DropdownMenuItem>
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Clear button */}
                {(searchTerm || activeFilters.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleSearchChange("")
                      handleFiltersChange([])
                    }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Șterge tot</span>
                    <span className="sm:hidden">Clear</span>
                  </Button>
                )}
              </div>

              {/* Informații despre filtrare - pe mobil sub butoane */}
              <div className="text-sm text-gray-500 order-last sm:order-none">
                {filteredLucrari.length} din {lucrariArhivate.length} lucrări
              </div>
            </div>

            {/* Rândul 3: View mode pe mobil */}
            <div className="block md:hidden">
              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "cards" | "table")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="cards">Card-uri</TabsTrigger>
                  <TabsTrigger value="table">Tabel</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Filtre active afișate */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  <span className="text-xs">
                    {filter.label}: {Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() => {
                      const newFilters = activeFilters.filter((_, i) => i !== index)
                      handleFiltersChange(newFilters)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <Tabs value={viewMode} className="space-y-4">
          <TabsContent value="cards">
            {filteredLucrari.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Archive className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nu există lucrări arhivate
                  </h3>
                  <p className="text-gray-500 text-center max-w-md">
                    {searchTerm || activeFilters.length
                      ? "Nu s-au găsit lucrări arhivate care să corespundă criteriilor de căutare."
                      : "Încă nu aveți lucrări arhivate. Lucrările finalizate pot fi arhivate pentru organizare."
                    }
                  </p>
                  {(searchTerm || activeFilters.length > 0) && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        handleSearchChange("")
                        handleFiltersChange([])
                      }}
                    >
                      Șterge toate filtrele
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLucrari.map((lucrare) => (
                  <Card key={lucrare.id} className="border-gray-200 hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{lucrare.client}</CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <MapPin className="h-4 w-4" />
                            {lucrare.locatie}
                          </CardDescription>
                        </div>
                        <Badge className={getWorkStatusClass(lucrare.statusLucrare)}>
                          {lucrare.statusLucrare}
                        </Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="truncate">{lucrare.tipLucrare}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span>{formatDate(lucrare.dataInterventie)}</span>
                        </div>
                      </div>

                      {lucrare.tehnicieni && lucrare.tehnicieni.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <div className="flex flex-wrap gap-1">
                            {lucrare.tehnicieni.map((tehnician, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tehnician}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-xs text-gray-400">Neatribuit</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex space-x-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => router.push(`/dashboard/arhivate/${lucrare.id}`)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Vizualizează detalii</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDezarhivare(lucrare.id!)}
                                >
                                  <ArchiveRestore className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Dezarhivează lucrarea</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {lucrare.raportGenerat && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => router.push(`/raport/${lucrare.id}`)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Raport
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Descarcă raport</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="table">
            {filteredLucrari.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Archive className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Nu există lucrări arhivate
                  </h3>
                  <p className="text-gray-500 text-center max-w-md">
                    {searchTerm || activeFilters.length
                      ? "Nu s-au găsit lucrări arhivate care să corespundă criteriilor de căutare."
                      : "Încă nu aveți lucrări arhivate."
                    }
                  </p>
                  {(searchTerm || activeFilters.length > 0) && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        handleSearchChange("")
                        handleFiltersChange([])
                      }}
                    >
                      Șterge toate filtrele
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <DataTable
                columns={columns}
                data={filteredLucrari}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Modal pentru filtre */}
        <FilterModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          title="Filtrează lucrările arhivate"
          filterOptions={filterOptions}
          activeFilters={activeFilters}
          onApplyFilters={handleFiltersChange}
          onResetFilters={() => handleFiltersChange([])}
        />
      </DashboardShell>
    </TooltipProvider>
  )
} 
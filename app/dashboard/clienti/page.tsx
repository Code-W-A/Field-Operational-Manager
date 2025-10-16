"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Eye, Pencil, Trash2, Loader2, AlertCircle, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { useClientLucrari } from "@/hooks/use-client-lucrari"
import { ClientEditForm } from "@/components/client-edit-form"
import { useSearchParams, useRouter } from "next/navigation"
import { type Client, deleteClient } from "@/lib/firebase/firestore"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Badge } from "@/components/ui/badge"
import { ClientForm } from "@/components/client-form"
import { UniversalSearch } from "@/components/universal-search"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { ColumnSelectionButton } from "@/components/column-selection-button"
import { ColumnSelectionModal } from "@/components/column-selection-modal"
import { FilterButton } from "@/components/filter-button"
import { FilterModal, type FilterOption } from "@/components/filter-modal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function Clienti() {
  const { userData } = useAuth()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<any>(null)
  const [searchText, setSearchText] = useState("")
  const [filteredData, setFilteredData] = useState<(Client & { numarLucrari?: number })[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [activeDialog, setActiveDialog] = useState<"add" | "edit" | null>(null)
  const addFormRef = useRef<any>(null)
  const editFormRef = useRef<any>(null)

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting, saveSearchText } = useTablePersistence("clienti")

  // State pentru sorting persistent
  const [tableSorting, setTableSorting] = useState([{ id: "updatedAt", desc: true }])

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.sorting) {
      setTableSorting(savedSettings.sorting)
    }
    if (savedSettings.searchText) {
      setSearchText(savedSettings.searchText)
    }
  }, [loadSettings])

  // Handler pentru schimbarea sortării
  const handleSortingChange = (newSorting: { id: string; desc: boolean }[]) => {
    setTableSorting(newSorting)
    saveSorting(newSorting)
  }

  // Handler pentru schimbarea search text-ului
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    saveSearchText(value)
  }

  const searchParams = useSearchParams()
  const router = useRouter()
  const editId = searchParams.get("edit")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Add state for activeTab
  const [activeTab, setActiveTab] = useState("tabel")

  // State pentru paginația cards
  const [cardsCurrentPage, setCardsCurrentPage] = useState(1)
  const [cardsPageSize, setCardsPageSize] = useState(12)

  // Persistența pentru cardsPageSize
  useEffect(() => {
    const savedCardsPageSize = localStorage.getItem("cardsPageSize_clienti")
    if (savedCardsPageSize) {
      const pageSize = parseInt(savedCardsPageSize, 10)
      if ([6, 12, 24, 48].includes(pageSize)) {
        setCardsPageSize(pageSize)
      }
    }
  }, [])

  // Salvează cardsPageSize în localStorage când se schimbă
  const handleCardsPageSizeChange = (value: string) => {
    const pageSize = Number(value)
    setCardsPageSize(pageSize)
    setCardsCurrentPage(1)
    localStorage.setItem("cardsPageSize_clienti", value)
  }

  // Detect if we're on a mobile device
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Get clients from Firebase
  const { clienti: rawClienti, loading, error: fetchError, refreshData } = useClientLucrari()

  // Sortare hibridă: prioritizăm clienții cu updatedAt (modificați recent), apoi cei cu createdAt
  const clienti = useMemo<(
    Client & {
      numarLucrari?: number
      locatii?: any[]
      persoaneContact?: any[]
      cif?: string
      cui?: string
      regCom?: string
      persoanaContact?: string
      createdAt?: any
      updatedAt?: any
    }
  )[]>(() => {
    if (!rawClienti || rawClienti.length === 0) return []
    
    return [...rawClienti].sort((a: any, b: any) => {
      // Ambii au updatedAt - sortăm după updatedAt
      if (a.updatedAt && b.updatedAt) {
        return b.updatedAt.toMillis() - a.updatedAt.toMillis()
      }
      
      // Doar a are updatedAt - a vine primul
      if (a.updatedAt && !b.updatedAt) {
        return -1
      }
      
      // Doar b are updatedAt - b vine primul  
      if (!a.updatedAt && b.updatedAt) {
        return 1
      }
      
      // Niciunul nu are updatedAt - sortăm după createdAt
      if (a.createdAt && b.createdAt) {
        return b.createdAt.toMillis() - a.createdAt.toMillis()
      }
      
      // Fallback la sortare alfabetică după nume
      return a.nume.localeCompare(b.nume)
    })
  }, [rawClienti])

  // Helper: match client against search text across many nested fields (locations, contacts, etc.)
  const clientMatchesSearch = useCallback((item: any, lowercasedFilter: string): boolean => {
    const test = (v?: any) => {
      if (v === null || v === undefined) return false
      try {
        return String(v).toLowerCase().includes(lowercasedFilter)
      } catch {
        return false
      }
    }

    // Top-level fields
    if (
      test(item.nume) ||
      test(item.cif) || test(item.cui) ||
      test(item.adresa) ||
      test(item.email) ||
      test(item.telefon) ||
      test(item.persoanaContact) ||
      test(item.reprezentantFirma) ||
      test(item.functieReprezentant) ||
      test((item as any)?.regCom)
    ) {
      return true
    }

    // Client-level contacts (optional legacy)
    const persoaneClient = Array.isArray(item.persoaneContact) ? item.persoaneContact : []
    for (const p of persoaneClient) {
      if (test(p?.nume) || test(p?.telefon) || test(p?.email) || test(p?.functie)) return true
    }

    // Locations and their contacts/equipment
    const locatii = Array.isArray(item.locatii) ? item.locatii : []
    for (const loc of locatii) {
      if (test(loc?.nume) || test(loc?.adresa)) return true
      const persoane = Array.isArray(loc?.persoaneContact) ? loc.persoaneContact : []
      for (const p of persoane) {
        if (test(p?.nume) || test(p?.telefon) || test(p?.email) || test(p?.functie)) return true
      }
      const echipamente = Array.isArray(loc?.echipamente) ? loc.echipamente : []
      for (const e of echipamente) {
        if (test(e?.nume) || test(e?.cod) || test(e?.model) || test(e?.serie)) return true
      }
    }

    // Contracts (if present on client object)
    const contracte = Array.isArray((item as any)?.contracte) ? (item as any).contracte : []
    for (const c of contracte) {
      if (test(c?.numar) || test(c?.tip)) return true
    }

    return false
  }, [])

  // Define filter options based on client data
  const filterOptions = useMemo(() => {
    // Get unique work counts and sort them
    const uniqueWorkCounts = Array.from(new Set(clienti.map((client) => client.numarLucrari || 0))).sort(
      (a, b) => a - b,
    )

    // Create options for the multiselect filter
    const numarLucrariOptions = uniqueWorkCounts.map((count) => ({
      value: count.toString(),
      label: count === 0 ? "0 lucrari" : count === 1 ? "1 lucrare" : `${count} lucrari`,
    }))

    return [
      {
        id: "clienti",
        label: "Clienți",
        type: "multiselect" as const,
        options: clienti.map((c) => ({ value: String(c.id || ""), label: String(c.nume || "") })),
        value: [] as string[],
      },
      {
        id: "numarLucrari",
        label: "Număr lucrări",
        type: "multiselect" as const,
        options: numarLucrariOptions,
        value: [] as string[],
      },
    ]
  }, [clienti])

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
            case "clienti":
              if (Array.isArray(filter.value)) {
                return filter.value.includes(item.id)
              }
              return true
            case "numarLucrari":
              // For multiselect filters
              if (Array.isArray(filter.value)) {
                return filter.value.includes((item.numarLucrari || 0).toString())
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
    if (!clienti || clienti.length === 0) {
      setFilteredData([])
      return
    }

    if (!searchText.trim() && !activeFilters.length) {
      setFilteredData(clienti)
      return
    }

    let filtered = clienti

    // Apply active filters
    if (activeFilters.length) {
      filtered = applyFilters(filtered)
    }

    // Apply global search
    if (searchText.trim()) {
      const lowercasedFilter = searchText.toLowerCase()
      filtered = filtered.filter((item) => clientMatchesSearch(item, lowercasedFilter))
    }

    setFilteredData(filtered)
  }, [searchText, clienti, activeFilters]) // Eliminat applyFilters din dependencies

  // Forțăm refiltrarea când datele se încarcă și avem un searchText salvat
  useEffect(() => {
    if (!loading && clienti && clienti.length > 0 && searchText.trim()) {
      // Trigger o refiltrare pentru a aplica searchText-ul încărcat din localStorage
      const timeoutId = setTimeout(() => {
        // Forțăm o actualizare a filteredData aplicând din nou filtrarea
        let filtered = clienti

        if (activeFilters.length) {
          filtered = applyFilters(filtered)
        }

        if (searchText.trim()) {
          const lowercasedFilter = searchText.toLowerCase()
          filtered = filtered.filter((item: any) => clientMatchesSearch(item, lowercasedFilter))
        }

        setFilteredData(filtered)
      }, 100) // Mic delay pentru a se asigura că toate datele sunt încărcate

      return () => clearTimeout(timeoutId)
    }
  }, [loading, clienti, searchText, activeFilters]) // Trigger când loading se termină

  // Automatically set card view on mobile
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  // Calculăm datele pentru paginația cards
  const paginatedCardsData = useMemo(() => {
    const startIndex = (cardsCurrentPage - 1) * cardsPageSize
    const endIndex = startIndex + cardsPageSize
    return filteredData.slice(startIndex, endIndex)
  }, [filteredData, cardsCurrentPage, cardsPageSize])

  const totalCardsPages = Math.ceil(filteredData.length / cardsPageSize)

  // Reset paginația când se schimbă filtrele
  useEffect(() => {
    setCardsCurrentPage(1)
  }, [filteredData.length])

  // Check if we have a client ID for editing from URL
  useEffect(() => {
    const fetchClientForEdit = async () => {
      if (editId) {
        try {
          const client = clienti.find((c) => c.id === editId)
          if (client) {
            setSelectedClient(client)
            setIsEditDialogOpen(true)
          }
        } catch (err) {
          console.error("Eroare la încărcarea clientului pentru editare:", err)
        }
      }
    }

    if (clienti.length > 0 && editId) {
      fetchClientForEdit()
    }
  }, [editId, clienti])

  // Datele filtrate sunt gestionate de useEffect-ul pentru filtrare

  // Populate column options when table is available
  useEffect(() => {
    if (table) {
      const savedSettings = loadSettings()
      const savedColumnVisibility = savedSettings.columnVisibility || {}
      
      const allColumns = table.getAllColumns() as any[]
      
      // Aplicăm vizibilitatea salvată
      allColumns.forEach((column) => {
        if (column.getCanHide() && savedColumnVisibility.hasOwnProperty(column.id)) {
          column.toggleVisibility(savedColumnVisibility[column.id])
        }
      })
      
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
  }, [table, isColumnModalOpen, loadSettings])

  const handleToggleColumn = (columnId: string) => {
    if (!table) return

    const column = table.getColumn(columnId) as any
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Update options state to reflect changes
      const newColumnOptions = columnOptions.map((option) => 
        option.id === columnId ? { ...option, isVisible: !option.isVisible } : option
      )
      setColumnOptions(newColumnOptions)
      
      // Salvăm vizibilitatea coloanelor
      const columnVisibility = newColumnOptions.reduce((acc, option) => {
        acc[option.id] = option.isVisible
        return acc
      }, {})
      saveColumnVisibility(columnVisibility)
    }
  }

  const handleSelectAllColumns = () => {
    if (!table) return

    ;(table.getAllColumns() as any[]).forEach((column) => {
      if (column.getCanHide()) {
        column.toggleVisibility(true)
      }
    })

    // Update all options to visible
    const newColumnOptions = columnOptions.map((option) => ({ ...option, isVisible: true }))
    setColumnOptions(newColumnOptions)
    
    // Salvăm vizibilitatea coloanelor
    const columnVisibility = newColumnOptions.reduce((acc, option) => {
      acc[option.id] = option.isVisible
      return acc
    }, {})
    saveColumnVisibility(columnVisibility)
  }

  const handleDeselectAllColumns = () => {
    if (!table) return

    ;(table.getAllColumns() as any[]).forEach((column) => {
      if (column.getCanHide() && column.id !== "actions") {
        column.toggleVisibility(false)
      }
    })

    // Update all options except actions to not visible
    const newColumnOptions = columnOptions.map((option) => ({
        ...option,
        isVisible: option.id === "actions" ? true : false,
    }))
    setColumnOptions(newColumnOptions)
    
    // Salvăm vizibilitatea coloanelor
    const columnVisibility = newColumnOptions.reduce((acc, option) => {
      acc[option.id] = option.isVisible
      return acc
    }, {})
    saveColumnVisibility(columnVisibility)
  }

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

  const handleDelete = async (id: string) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest client?")) {
      try {
        await deleteClient(id)
        // Refresh data after deletion
        refreshData()
      } catch (err) {
        console.error("Eroare la ștergerea clientului:", err)
        alert("A apărut o eroare la ștergerea clientului.")
      }
    }
  }

  // Modify handleEdit function to include event parameter and prevent propagation
  const handleEdit = (client: Client, e?: React.MouseEvent) => {
    // Prevent event propagation if event exists
    if (e) {
      e.stopPropagation()
    }

    setSelectedClient(client)
    setIsEditDialogOpen(true)

    // Add edit parameter to URL without page reload
    const url = new URL(window.location.href)
    url.searchParams.set("edit", client.id || "")
    window.history.pushState({}, "", url.toString())
  }

  // Modify handleEditDialogClose function to properly handle dialog closure
  const handleEditDialogClose = () => {
    setIsEditDialogOpen(false)

    // Remove "edit" parameter from URL
    if (editId) {
      const url = new URL(window.location.href)
      url.searchParams.delete("edit")
      window.history.pushState({}, "", url.toString())
    }
  }

  const handleViewDetails = (id: string) => {
    router.push(`/dashboard/clienti/${id}`)
  }

  // Modify handleEditSuccess function to refresh data
  const handleEditSuccess = () => {
    handleEditDialogClose()
    refreshData() // Add call to refreshData
  }

  // Function to check if we should show the close confirmation dialog for add
  const handleCloseAddDialog = () => {
    // Întotdeauna solicităm confirmare înainte de a închide dialogul de adăugare
    setActiveDialog("add")
    setShowCloseAlert(true)
  }

  // Function to check if we should show the close confirmation dialog for edit
  const handleCloseEditDialog = () => {
    // Întotdeauna solicităm confirmare înainte de a închide dialogul de editare
    setActiveDialog("edit")
    setShowCloseAlert(true)
  }

  // Function to confirm dialog close
  const confirmCloseDialog = () => {
    setShowCloseAlert(false)

    // Determine which dialog to close based on activeDialog
    if (activeDialog === "add") {
      setIsAddDialogOpen(false)
    } else if (activeDialog === "edit") {
      handleEditDialogClose()
    }

    // Reset activeDialog
    setActiveDialog(null)
  }

  // Define columns for DataTable
  const columns = [
    {
      accessorKey: "updatedAt",
      header: "Ultima modificare",
      enableHiding: true,
      enableFiltering: false,
      cell: ({ row }: any) => {
        const client = row.original
        const hasUpdatedAt = client.updatedAt
        const hasCreatedAt = client.createdAt
        
        // Verificăm dacă clientul a fost modificat (updatedAt diferit de createdAt)
        const wasModified = hasUpdatedAt && hasCreatedAt && 
          Math.abs(client.updatedAt.toMillis() - client.createdAt.toMillis()) > 1000; // diferență > 1 secundă
        
        if (wasModified) {
          // Afișăm data ultimei modificări
          const updatedDate = client.updatedAt.toDate()
          const formattedDate = format(updatedDate, "dd.MM.yyyy", { locale: ro })
          const formattedTime = format(updatedDate, "HH:mm", { locale: ro })
          
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-blue-600">
                Modificat: {formattedDate}
              </div>
              <div className="text-gray-500 text-xs">
                {formattedTime}
              </div>
            </div>
          )
        } else if (hasCreatedAt) {
          // Afișăm data creării dacă nu a fost modificat
          const createdDate = client.createdAt.toDate()
          const formattedDate = format(createdDate, "dd.MM.yyyy", { locale: ro })
          const formattedTime = format(createdDate, "HH:mm", { locale: ro })
          
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-green-600">
                Creat: {formattedDate}
              </div>
              <div className="text-gray-500 text-xs">
                {formattedTime}
              </div>
            </div>
          )
        } else {
          // Fallback pentru clienți vechi
          return (
            <div className="flex flex-col text-sm">
              <div className="font-medium text-gray-600">
                Date vechi
              </div>
              <div className="text-gray-500 text-xs">
                Fără timestamp
              </div>
            </div>
          )
        }
      },
    },
    {
      accessorKey: "nume",
      header: "Nume Companie",
      enableFiltering: true,
      cell: ({ row }: any) => <span className="font-medium">{row.original.nume}</span>,
    },
    {
      accessorKey: "cif",
      header: "CIF/CUI",
      enableFiltering: true,
    },
    {
      accessorKey: "adresa",
      header: "Adresă",
      enableFiltering: true,
    },
    {
      accessorKey: "persoanaContact",
      header: "Persoană Contact",
      enableFiltering: true,
    },
    {
      accessorKey: "telefon",
      header: "Telefon",
      enableFiltering: true,
      cell: ({ row }: any) => <span>{row.original.telefon || "N/A"}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      enableFiltering: true,
    },
    {
      accessorKey: "numarLucrari",
      header: "Lucrări",
      enableFiltering: true,
      cell: ({ row }: any) => <span>{row.original.numarLucrari || 0}</span>,
    },
    {
      id: "actions",
      enableFiltering: false,
              cell: ({ row }: any) => (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEdit(row.original, e)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editează</TooltipContent>
            </Tooltip>
            {userData?.role === "admin" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(row.original.id!)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Șterge</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
    },
  ]

  return (
    <TooltipProvider>
      <DashboardShell>
      <DashboardHeader heading="Clienți" text="Gestionați baza de date a clienților">
        <Dialog
          open={isAddDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              // Când se încearcă închiderea dialogului prin click în afara lui
              handleCloseAddDialog()
            } else {
              setIsAddDialogOpen(open)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Client
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adaugă Client Nou</DialogTitle>
              <DialogDescription>Completați detaliile pentru a adăuga un client nou</DialogDescription>
            </DialogHeader>
            <ClientForm
              ref={addFormRef}
              onSuccess={(clientName) => {
                setIsAddDialogOpen(false)
                refreshData() // Refresh data after addition
              }}
              onCancel={handleCloseAddDialog}
            />
          </DialogContent>
        </Dialog>
      </DashboardHeader>

      {/* Dialog for editing the client */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Când se încearcă închiderea dialogului prin click în afara lui
            handleCloseEditDialog()
          } else {
            setIsEditDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Client</DialogTitle>
            <DialogDescription>Modificați detaliile clientului</DialogDescription>
          </DialogHeader>
          {selectedClient && (
            <ClientEditForm
              ref={editFormRef}
              client={selectedClient}
              onSuccess={handleEditSuccess}
              onCancel={handleCloseEditDialog}
            />
          )}
        </DialogContent>
      </Dialog>

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
          title="Filtrare clienți"
          filterOptions={filterOptions}
          activeFilters={activeFilters}
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
            <span className="ml-2 text-gray-600">Se încarcă clienții...</span>
          </div>
        ) : fetchError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A apărut o eroare la încărcarea clienților. Încercați să reîmprospătați pagina.
            </AlertDescription>
          </Alert>
        ) : activeTab === "tabel" ? (
            <DataTable
              columns={columns}
              data={filteredData}
            defaultSort={{ id: "updatedAt", desc: true }}
            sorting={tableSorting}
            onSortingChange={handleSortingChange}
              table={table}
              setTable={setTable}
              showFilters={false}
              onRowClick={(row) => handleViewDetails(row.id!)}
              persistenceKey="clienti"
            />
        ) : (
          <div className="space-y-4">
            {/* Controale pentru paginația cards */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <p className="text-sm font-medium">Carduri per pagină</p>
                <Select
                  value={`${cardsPageSize}`}
                  onValueChange={handleCardsPageSizeChange}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={cardsPageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[6, 12, 24, 48].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                Pagina {cardsCurrentPage} din {totalCardsPages || 1}
              </div>
            </div>

            {/* Grid cu cards */}
            <div className="grid gap-4 px-4 sm:px-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 w-full overflow-auto">
              {paginatedCardsData.map((client: any) => (
              <Card
                key={client.id}
                className="overflow-hidden cursor-pointer hover:shadow-md"
                onClick={() => handleViewDetails(client.id!)}
              >
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <div>
                      <h3 className="font-medium">{client.nume}</h3>
                      {client.cif && <p className="text-xs text-muted-foreground">CIF/CUI: {client.cif}</p>}
                      <p className="text-sm text-muted-foreground">{client.adresa || "Fără adresă"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline">
                        {client.numarLucrari === 0
                          ? "Fără lucrări"
                          : client.numarLucrari === 1
                            ? "1 lucrare"
                            : `${client.numarLucrari} lucrari`}
                      </Badge>
                      {client.locatii && client.locatii.length > 0 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {client.locatii.length} {client.locatii.length === 1 ? "locație" : "locații"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="mb-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Persoană contact:</span>
                        <span className="text-sm">{client.persoanaContact}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Telefon:</span>
                        <span className="text-sm">{client.telefon || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Email:</span>
                        <span className="text-sm">{client.email || "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1" onClick={(e) => e.stopPropagation()}>
                            Acțiuni
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewDetails(client.id!)
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" /> Vizualizează
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(client, e)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editează
                          </DropdownMenuItem>
                          {userData?.role === "admin" && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(client.id!)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Șterge
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
              {paginatedCardsData.length === 0 && filteredData.length === 0 && (
                <div className="col-span-full text-center py-10">
                  <p className="text-muted-foreground">Nu există clienți care să corespundă criteriilor de căutare.</p>
                </div>
              )}
            </div>

            {/* Paginația pentru cards */}
            {totalCardsPages > 1 && (
              <div className="flex items-center justify-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsCurrentPage(cardsCurrentPage - 1)}
                  disabled={cardsCurrentPage === 1}
                >
                  Anterioară
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: totalCardsPages }, (_, i) => i + 1)
                    .filter((page) => {
                      const distance = Math.abs(page - cardsCurrentPage)
                      return distance <= 2 || page === 1 || page === totalCardsPages
                    })
                    .map((page, index, filteredPages) => {
                      const prevPage = filteredPages[index - 1]
                      const showEllipsis = prevPage && page - prevPage > 1
                      
                      return (
                        <div key={page} className="flex items-center">
                          {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                          <Button
                            variant={page === cardsCurrentPage ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCardsCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        </div>
                      )
                    })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCardsCurrentPage(cardsCurrentPage + 1)}
                  disabled={cardsCurrentPage === totalCardsPages}
                >
                  Următoarea
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi
              pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setShowCloseAlert(false)} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseDialog} className="w-full sm:w-auto">
              Da, închide formularul
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
    </TooltipProvider>
  )
}
;<style jsx global>{`
  .data-table tbody tr {
    cursor: pointer;
  }
  .data-table tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.04);
  }
  .data-table tbody tr:nth-child(even) {
    background-color: #f2f2f2;
  }
  .data-table tbody tr:nth-child(odd) {
    background-color: #ffffff;
  }
`}</style>

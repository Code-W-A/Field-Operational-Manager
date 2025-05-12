"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Eye, Pencil, Trash2, Loader2, AlertCircle, Plus, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/contexts/AuthContext"
import { useClientLucrari } from "@/hooks/use-client-lucrari"
import { ClientEditForm } from "@/components/client-edit-form"
import { useSearchParams, useRouter } from "next/navigation"
import { type Client, deleteClient } from "@/lib/firebase/firestore"
import { DataTable } from "@/components/data-table/data-table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Badge } from "@/components/ui/badge"
import { ClientForm } from "@/components/client-form"
import { UniversalSearch } from "@/components/universal-search"
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
  const [filteredData, setFilteredData] = useState<Client[]>([])
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false)
  const [columnOptions, setColumnOptions] = useState<any[]>([])
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([])
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [activeDialog, setActiveDialog] = useState<"add" | "edit" | null>(null)
  const addFormRef = useRef<any>(null)
  const editFormRef = useRef<any>(null)

  const searchParams = useSearchParams()
  const router = useRouter()
  const editId = searchParams.get("edit")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Add state for activeTab
  const [activeTab, setActiveTab] = useState("tabel")

  // Detect if we're on a mobile device
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Get clients from Firebase
  const { clienti, loading, error: fetchError, refreshData } = useClientLucrari()

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
        id: "numarLucrari",
        label: "Număr lucrări",
        type: "multiselect",
        options: numarLucrariOptions,
        value: [],
      },
    ]
  }, [clienti])

  // Apply active filters
  const applyFilters = useCallback(
    (data: Client[]) => {
      if (!activeFilters.length) return data

      return data.filter((item) => {
        return activeFilters.every((filter) => {
          // If filter has no value, ignore it
          if (!filter.value || (Array.isArray(filter.value) && filter.value.length === 0)) {
            return true
          }

          switch (filter.id) {
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
    let filtered = clienti

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
  }, [searchText, clienti, activeFilters, applyFilters])

  // Automatically set card view on mobile
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

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

  // Initialize filtered data
  useEffect(() => {
    setFilteredData(clienti)
  }, [clienti])

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
    if (addFormRef.current?.hasUnsavedChanges?.()) {
      setActiveDialog("add")
      setShowCloseAlert(true)
    } else {
      setIsAddDialogOpen(false)
    }
  }

  // Function to check if we should show the close confirmation dialog for edit
  const handleCloseEditDialog = () => {
    if (editFormRef.current?.hasUnsavedChanges?.()) {
      setActiveDialog("edit")
      setShowCloseAlert(true)
    } else {
      handleEditDialogClose()
    }
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleViewDetails(row.original.id!)}>
              <Eye className="mr-2 h-4 w-4" /> Vizualizează
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => handleEdit(row.original, e)}>
              <Pencil className="mr-2 h-4 w-4" /> Editează
            </DropdownMenuItem>
            {userData?.role === "admin" && (
              <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(row.original.id!)}>
                <Trash2 className="mr-2 h-4 w-4" /> Șterge
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <DashboardShell>
      <DashboardHeader heading="Clienți" text="Gestionați baza de date a clienților">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Client
            </Button>
          </DialogTrigger>
          <DialogContent
            className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto"
            // Eliminăm butonul X standard
            closeButton={false}
          >
            <div className="flex justify-between items-center">
              <DialogTitle>Adaugă Client Nou</DialogTitle>
              {/* Adăugăm propriul nostru buton X care apelează handleCloseAddDialog */}
              <Button variant="ghost" size="icon" onClick={handleCloseAddDialog} className="h-8 w-8 p-0 rounded-full">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>Completați detaliile pentru a adăuga un client nou</DialogDescription>
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
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto"
          // Eliminăm butonul X standard
          closeButton={false}
        >
          <div className="flex justify-between items-center">
            <DialogTitle>Editează Client</DialogTitle>
            {/* Adăugăm propriul nostru buton X care apelează handleCloseEditDialog */}
            <Button variant="ghost" size="icon" onClick={handleCloseEditDialog} className="h-8 w-8 p-0 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>Modificați detaliile clientului</DialogDescription>
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
          title="Filtrare clienți"
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
          <div className="rounded-md border">
            <DataTable columns={columns} data={filteredData} table={table} setTable={setTable} showFilters={false} />
          </div>
        ) : (
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 w-full overflow-auto">
            {filteredData.map((client) => (
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
                        <span className="text-sm">{client.telefon}</span>
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
            {filteredData.length === 0 && (
              <div className="col-span-full text-center py-10">
                <p className="text-muted-foreground">Nu există clienți care să corespundă criteriilor de căutare.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi
              pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseAlert(false)}>Nu, rămân în formular</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseDialog}>Da, închide formularul</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}

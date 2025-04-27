"use client"

import type React from "react"

import { useState, useEffect } from "react"
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
import { Plus, Eye, Pencil, Trash2, Loader2, AlertCircle, Search, X } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { EnhancedFilterSystem } from "@/components/data-table/enhanced-filter-system"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"

export default function Clienti() {
  const { userData } = useAuth()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<any>(null)

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

  // Define columns for DataTable
  const columns = [
    {
      accessorKey: "nume",
      header: "Nume Companie",
      enableFiltering: true,
      cell: ({ row }: any) => <span className="font-medium">{row.original.nume}</span>,
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
          <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adaugă Client Nou</DialogTitle>
              <DialogDescription>Completați detaliile pentru a adăuga un client nou</DialogDescription>
            </DialogHeader>
            <ClientForm
              onSuccess={(clientName) => {
                setIsAddDialogOpen(false)
                refreshData() // Refresh data after addition
              }}
              onCancel={() => setIsAddDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </DashboardHeader>

      {/* Dialog for editing the client */}
      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogClose}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Client</DialogTitle>
            <DialogDescription>Modificați detaliile clientului</DialogDescription>
          </DialogHeader>
          {selectedClient && (
            <ClientEditForm
              client={selectedClient}
              onSuccess={handleEditSuccess} // Modified to call handleEditSuccess
              onCancel={() => {
                handleEditDialogClose()
              }}
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

        {/* Adăugăm filtrele și căutarea aici, indiferent de modul de vizualizare */}
        {!loading && !fetchError && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  placeholder="Caută în toate coloanele..."
                  value={table?.getState().globalFilter || ""}
                  onChange={(e) => {
                    const value = e.target.value
                    table?.setGlobalFilter(value)
                  }}
                  className="pl-8"
                />
                {table?.getState().globalFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                    onClick={() => {
                      table?.setGlobalFilter("")
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {table && <EnhancedFilterSystem table={table} />}

              <div className="flex justify-end">{table && <DataTableViewOptions table={table} />}</div>
            </div>
          </div>
        )}

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
            <DataTable
              columns={columns}
              data={clienti}
              onRowClick={(client) => handleViewDetails(client.id!)}
              table={table}
              setTable={setTable}
              showFilters={false}
            />
          </div>
        ) : (
          <div className="grid gap-4 px-4 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
            {clienti.map((client) => (
              <Card
                key={client.id}
                className="overflow-hidden cursor-pointer hover:shadow-md"
                onClick={() => handleViewDetails(client.id!)}
              >
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b p-4">
                    <div>
                      <h3 className="font-medium">{client.nume}</h3>
                      <p className="text-sm text-muted-foreground">{client.adresa || "Fără adresă"}</p>
                    </div>
                    <Badge variant="outline">{client.numarLucrari || 0} lucrări</Badge>
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
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

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
import { Plus, Eye, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react"
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

export default function Clienti() {
  const { userData } = useAuth()
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  // Eliminăm state-ul formData și funcțiile asociate
  // Înlocuim:
  // Cu:
  const [error, setError] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const router = useRouter()
  const editId = searchParams.get("edit")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Adăugăm state pentru activeTab
  const [activeTab, setActiveTab] = useState("tabel")

  // Detectăm dacă suntem pe un dispozitiv mobil
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Obținem clienții din Firebase
  const { clienti, loading, error: fetchError, refreshData } = useClientLucrari()

  // Setăm automat vizualizarea cu carduri pe mobil
  useEffect(() => {
    if (isMobile) {
      setActiveTab("carduri")
    } else {
      setActiveTab("tabel")
    }
  }, [isMobile])

  // Verificăm dacă avem un ID de client pentru editare din URL
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
  }, [editId])

  // Eliminăm funcția handleInputChange

  // Eliminăm funcția handleSubmit

  const handleDelete = async (id: string) => {
    if (window.confirm("Sunteți sigur că doriți să ștergeți acest client?")) {
      try {
        await deleteClient(id)
        // Reîmprospătăm datele după ștergere
        refreshData()
      } catch (err) {
        console.error("Eroare la ștergerea clientului:", err)
        alert("A apărut o eroare la ștergerea clientului.")
      }
    }
  }

  // Modificăm funcția handleEdit pentru a preveni navigarea la pagina de detalii
  // și pentru a gestiona corect parametrul "edit" din URL

  // Modificăm funcția handleEdit pentru a include parametrul de eveniment și a preveni propagarea
  const handleEdit = (client: Client, e?: React.MouseEvent) => {
    // Prevenim propagarea evenimentului dacă există
    if (e) {
      e.stopPropagation()
    }

    setSelectedClient(client)
    setIsEditDialogOpen(true)

    // Adăugăm parametrul edit în URL fără a reîncărca pagina
    const url = new URL(window.location.href)
    url.searchParams.set("edit", client.id || "")
    window.history.pushState({}, "", url.toString())
  }

  // Modificăm funcția handleEditDialogClose pentru a gestiona corect închiderea dialogului
  const handleEditDialogClose = () => {
    setIsEditDialogOpen(false)

    // Eliminăm parametrul "edit" din URL
    if (editId) {
      const url = new URL(window.location.href)
      url.searchParams.delete("edit")
      window.history.pushState({}, "", url.toString())
    }
  }

  const handleViewDetails = (id: string) => {
    router.push(`/dashboard/clienti/${id}`)
  }

  // Modificăm funcția handleEditSuccess pentru a reîmprospăta datele
  const handleEditSuccess = () => {
    handleEditDialogClose()
    refreshData() // Adăugăm apelul către refreshData
  }

  // Definim coloanele pentru DataTable
  const columns = [
    {
      accessorKey: "nume",
      header: "Nume Companie",
      cell: ({ row }) => <span className="font-medium">{row.original.nume}</span>,
    },
    {
      accessorKey: "adresa",
      header: "Adresă",
    },
    {
      accessorKey: "persoanaContact",
      header: "Persoană Contact",
    },
    {
      accessorKey: "telefon",
      header: "Telefon",
    },
    {
      accessorKey: "email",
      header: "Email",
    },
    {
      accessorKey: "numarLucrari",
      header: "Lucrări",
      cell: ({ row }) => <span>{row.original.numarLucrari || 0}</span>,
      filterFn: "numLucrariFilter", // Folosim filtrul personalizat definit în data-table.tsx
    },
    {
      id: "actions",
      cell: ({ row }) => (
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
            {/* Modificăm apelul handleEdit în dropdown-ul din tabel */}
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

  // Definim opțiunile de filtrare pentru DataTable
  const filterableColumns = [
    {
      id: "numarLucrari",
      title: "Număr Lucrări",
      options: [
        { label: "Fără lucrări", value: "0" },
        { label: "1-5 lucrări", value: "1-5" },
        { label: "Peste 5 lucrări", value: "5+" },
      ],
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
                refreshData() // Reîmprospătăm datele după adăugare
              }}
              onCancel={() => setIsAddDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </DashboardHeader>

      {/* Dialog pentru editarea clientului */}
      <Dialog open={isEditDialogOpen} onOpenChange={handleEditDialogClose}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editează Client</DialogTitle>
            <DialogDescription>Modificați detaliile clientului</DialogDescription>
          </DialogHeader>
          {selectedClient && (
            <ClientEditForm
              client={selectedClient}
              onSuccess={handleEditSuccess} // Modificăm pentru a apela handleEditSuccess
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

          {!loading && !fetchError && (
            <div className="flex flex-wrap gap-2">
              <DataTable.Filters
                columns={columns}
                data={clienti}
                searchColumn="nume"
                searchPlaceholder="Caută client..."
                filterableColumns={filterableColumns}
              />
            </div>
          )}
        </div>

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
            data={clienti}
            searchColumn="nume"
            searchPlaceholder="Caută client..."
            filterableColumns={filterableColumns}
            onRowClick={(client) => handleViewDetails(client.id!)}
            showFilters={false}
          />
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
                          {/* Modificăm apelul handleEdit în dropdown-ul din carduri */}
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

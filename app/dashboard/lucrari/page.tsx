"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { useAuth } from "@/contexts/AuthContext"
import { LucrareForm } from "@/components/lucrare-form"
import { addLucrare, updateLucrare, deleteLucrare, type Lucrare } from "@/lib/firebase/firestore"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { where } from "firebase/firestore"

export default function LucrariPage() {
  const router = useRouter()
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedLucrare, setSelectedLucrare] = useState<Lucrare | null>(null)
  const [dataEmiterii, setDataEmiterii] = useState("")
  const [dataInterventie, setDataInterventie] = useState("")

  // Obținem toate lucrările
  const {
    data: toateLucrarile,
    loading,
    refreshData,
  } = useFirebaseCollection<Lucrare>(
    "lucrari",
    role === "tehnician" && userData?.displayName ? [where("tehnicieni", "array-contains", userData.displayName)] : [],
  )

  // Filtrăm lucrările pentru tehnician (doar cele active)
  const lucrari =
    role === "tehnician"
      ? toateLucrarile.filter(
          (lucrare) =>
            lucrare.statusLucrare.toLowerCase() === "în așteptare" || lucrare.statusLucrare.toLowerCase() === "în curs",
        )
      : toateLucrarile

  // Setăm data emiterii și data intervenției când se deschide dialogul de adăugare
  useEffect(() => {
    if (isAddDialogOpen) {
      const now = new Date()
      setDataEmiterii(format(now, "dd.MM.yyyy HH:mm"))

      // Setăm data intervenției la ziua următoare, aceeași oră
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      setDataInterventie(format(tomorrow, "dd.MM.yyyy HH:mm"))
    }
  }, [isAddDialogOpen])

  // Funcție pentru a adăuga o lucrare
  const handleAddLucrare = async (data: Omit<Lucrare, "id">) => {
    try {
      await addLucrare(data)
      setIsAddDialogOpen(false)
      refreshData()
      toast({
        title: "Lucrare adăugată",
        description: "Lucrarea a fost adăugată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru a actualiza o lucrare
  const handleUpdateLucrare = async (data: Partial<Lucrare>) => {
    if (!selectedLucrare?.id) return

    try {
      await updateLucrare(selectedLucrare.id, data)
      setIsEditDialogOpen(false)
      setSelectedLucrare(null)
      refreshData()
      toast({
        title: "Lucrare actualizată",
        description: "Lucrarea a fost actualizată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la actualizarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la actualizarea lucrării.",
        variant: "destructive",
      })
    }
  }

  // Funcție pentru a șterge o lucrare
  const handleDeleteLucrare = async (id: string) => {
    try {
      await deleteLucrare(id)
      refreshData()
      toast({
        title: "Lucrare ștearsă",
        description: "Lucrarea a fost ștearsă cu succes.",
      })
    } catch (error) {
      console.error("Eroare la ștergerea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la ștergerea lucrării.",
        variant: "destructive",
      })
    }
  }

  // Definim coloanele pentru tabel
  const columns = [
    {
      accessorKey: "dataEmiterii",
      header: "Data emiterii",
    },
    {
      accessorKey: "dataInterventie",
      header: "Data solicitată intervenție",
    },
    {
      accessorKey: "tipLucrare",
      header: "Tip lucrare",
    },
    {
      accessorKey: "client",
      header: "Client",
    },
    {
      accessorKey: "persoanaContact",
      header: "Persoană contact",
    },
    {
      accessorKey: "statusLucrare",
      header: "Status lucrare",
      cell: ({ row }) => {
        const status = row.getValue("statusLucrare") as string
        return (
          <Badge
            variant={
              status.toLowerCase() === "în așteptare"
                ? "warning"
                : status.toLowerCase() === "în curs"
                  ? "default"
                  : "success"
            }
          >
            {status}
          </Badge>
        )
      },
    },
    // Ascundem statusul de facturare pentru tehnician
    ...(role !== "tehnician"
      ? [
          {
            accessorKey: "statusFacturare",
            header: "Status facturare",
            cell: ({ row }) => {
              const status = row.getValue("statusFacturare") as string
              return (
                <Badge
                  variant={
                    status.toLowerCase() === "nefacturat"
                      ? "outline"
                      : status.toLowerCase() === "facturat"
                        ? "default"
                        : "success"
                  }
                >
                  {status}
                </Badge>
              )
            },
          },
        ]
      : []),
    {
      id: "actions",
      cell: ({ row }) => {
        const lucrare = row.original as Lucrare
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Deschide meniu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  router.push(`/dashboard/lucrari/${lucrare.id}`)
                }}
              >
                Vizualizare
              </DropdownMenuItem>
              {(role === "admin" || role === "dispecer") && (
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedLucrare(lucrare)
                    setIsEditDialogOpen(true)
                  }}
                >
                  Editare
                </DropdownMenuItem>
              )}
              {role === "admin" && (
                <DropdownMenuItem
                  onClick={() => {
                    if (window.confirm("Sigur doriți să ștergeți această lucrare?")) {
                      handleDeleteLucrare(lucrare.id!)
                    }
                  }}
                >
                  Ștergere
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // Definim opțiunile de filtrare pentru tabel
  const filterableColumns = [
    {
      id: "statusLucrare",
      title: "Status lucrare",
      options: [
        { label: "În așteptare", value: "în așteptare" },
        { label: "În curs", value: "în curs" },
        { label: "Finalizat", value: "finalizat" },
      ],
    },
  ]

  // Adăugăm opțiunea de filtrare după status facturare doar pentru admin și dispecer
  if (role !== "tehnician") {
    filterableColumns.push({
      id: "statusFacturare",
      title: "Status facturare",
      options: [
        { label: "Nefacturat", value: "nefacturat" },
        { label: "Facturat", value: "facturat" },
        { label: "Încasat", value: "încasat" },
      ],
    })
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Lucrări" text="Gestionează lucrările companiei">
        {(role === "admin" || role === "dispecer") && (
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Adaugă lucrare
          </Button>
        )}
      </DashboardHeader>
      <div>
        <DataTable
          columns={columns}
          data={lucrari}
          searchColumn="client"
          searchPlaceholder="Caută după client..."
          filterableColumns={filterableColumns}
          dateRangeColumn="dataInterventie"
          defaultSort={{ id: "dataEmiterii", desc: true }}
          onRowClick={(row) => router.push(`/dashboard/lucrari/${(row as Lucrare).id}`)}
        />
      </div>

      {/* Dialog pentru adăugare lucrare */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Adaugă lucrare</DialogTitle>
          </DialogHeader>
          <LucrareForm
            onSubmit={handleAddLucrare}
            onCancel={() => setIsAddDialogOpen(false)}
            initialData={{
              dataEmiterii,
              dataInterventie,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog pentru editare lucrare */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editează lucrare</DialogTitle>
          </DialogHeader>
          {selectedLucrare && (
            <LucrareForm
              onSubmit={handleUpdateLucrare}
              onCancel={() => setIsEditDialogOpen(false)}
              initialData={selectedLucrare}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}

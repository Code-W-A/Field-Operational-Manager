"use client"

import { useState, useEffect, useMemo } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DataTable } from "@/components/data-table/data-table"
import { EnhancedFilterSystem } from "@/components/data-table/enhanced-filter-system"
import { Badge } from "@/components/ui/badge"
import { ColumnDef } from "@tanstack/react-table"
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Plus, Pencil, Trash2, Loader2, AlertCircle, MoreHorizontal, FileText } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTablePersistence } from "@/hooks/use-table-persistence"
import { UniversalSearch } from "@/components/universal-search"

interface Contract {
  id: string
  name: string
  number: string
  type?: string // Adăugăm câmpul pentru tipul contractului
  createdAt: any
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [newContractType, setNewContractType] = useState("Abonament") // Adăugăm starea pentru tipul contractului
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [activeDialog, setActiveDialog] = useState<"add" | "edit" | "delete" | null>(null)

  // State pentru tabelul avansat
  const [table, setTable] = useState<any>(null)
  const [tableSorting, setTableSorting] = useState([{ id: "createdAt", desc: true }])
  const [searchText, setSearchText] = useState("")
  const [activeFilters, setActiveFilters] = useState<any[]>([])
  const [columnOptions, setColumnOptions] = useState<any[]>([])

  // Persistența tabelului
  const { loadSettings, saveFilters, saveColumnVisibility, saveSorting } = useTablePersistence("contracte")

  // Handler pentru schimbarea sortării
  const handleSortingChange = (newSorting: { id: string; desc: boolean }[]) => {
    setTableSorting(newSorting)
    saveSorting(newSorting)
  }

  // Încărcăm setările salvate la inițializare
  useEffect(() => {
    const savedSettings = loadSettings()
    if (savedSettings.activeFilters) {
      setActiveFilters(savedSettings.activeFilters)
    }
    if (savedSettings.sorting) {
      setTableSorting(savedSettings.sorting)
    } else {
      // Dacă nu avem sortare salvată, setăm implicit descrescător pe createdAt
      setTableSorting([{ id: "createdAt", desc: true }])
    }
  }, [loadSettings])

  // Populăm opțiunile pentru coloane când tabelul este disponibil
  useEffect(() => {
    if (table) {
      const savedSettings = loadSettings()
      const savedColumnVisibility = savedSettings.columnVisibility || {}
      
      const allColumns = table.getAllColumns()
      
      // Aplicăm vizibilitatea salvată
      allColumns.forEach((column: any) => {
        if (column.getCanHide() && savedColumnVisibility.hasOwnProperty(column.id)) {
          column.toggleVisibility(savedColumnVisibility[column.id])
        }
      })
      
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
  }, [table, loadSettings])

  // Handler pentru comutarea vizibilității coloanelor
  const handleToggleColumn = (columnId: string) => {
    if (!table) return

    const column = table.getColumn(columnId)
    if (column) {
      column.toggleVisibility(!column.getIsVisible())

      // Actualizăm starea opțiunilor pentru a reflecta schimbările
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

  // Handler-ele pentru filtre au fost eliminate - EnhancedFilterSystem gestionează persistența automat

  // Sortăm datele pe partea de client după încărcare
  const sortedContracts = useMemo(() => {
    if (!contracts.length || !tableSorting.length) return contracts

    return [...contracts].sort((a, b) => {
      const sortConfig = tableSorting[0] // Luăm prima sortare
      const { id: sortKey, desc } = sortConfig

      let aValue = a[sortKey as keyof Contract]
      let bValue = b[sortKey as keyof Contract]

      // Tratăm cazul special pentru date
      if (sortKey === "createdAt") {
        aValue = aValue?.toDate ? aValue.toDate() : new Date(aValue || 0)
        bValue = bValue?.toDate ? bValue.toDate() : new Date(bValue || 0)
      }

      // Comparare
      if (aValue < bValue) return desc ? 1 : -1
      if (aValue > bValue) return desc ? -1 : 1
      return 0
    })
  }, [contracts, tableSorting])

  // Setăm search-ul global în tabel când se schimbă searchText
  useEffect(() => {
    if (table && searchText !== undefined) {
      table.setGlobalFilter(searchText)
    }
  }, [table, searchText])

  // Persistența filtrelor este acum gestionată automat de EnhancedFilterSystem

  // Definim coloanele pentru tabelul de contracte
  const columns: ColumnDef<Contract>[] = useMemo(() => [
    {
      accessorKey: "name",
      header: "Nume Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "number",
      header: "Număr Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <div className="font-mono text-sm">
          {row.original.number}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Tip Contract",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
      cell: ({ row }) => (
        <Badge variant="outline" className={
          row.original.type === "Abonament" 
            ? "bg-blue-50 text-blue-700 border-blue-200" 
            : "bg-green-50 text-green-700 border-green-200"
        }>
          {row.original.type || "Nespecificat"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data Adăugării",
      enableHiding: true,
      enableSorting: true,
      enableFiltering: true,
      cell: ({ row }) => {
        const date = row.original.createdAt
        if (!date) return "N/A"
        
        try {
          const dateObj = date.toDate ? date.toDate() : new Date(date)
          return (
            <div className="text-sm">
              {format(dateObj, "dd MMMM yyyy", { locale: ro })}
              <div className="text-xs text-muted-foreground">
                {format(dateObj, "HH:mm", { locale: ro })}
              </div>
            </div>
          )
        } catch (error) {
          return "Data invalidă"
        }
      },
    },
    {
      id: "actions",
      header: "Acțiuni",
      enableHiding: false,
      enableSorting: false,
      enableFiltering: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editează
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => openDeleteDialog(row.original)}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Șterge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  // Încărcăm contractele din Firestore
  useEffect(() => {
    const fetchContracts = async () => {
      try {
        setLoading(true)
        setError(null)

        const contractsQuery = query(collection(db, "contracts"), orderBy("name", "asc"))

        const unsubscribe = onSnapshot(
          contractsQuery,
          (snapshot) => {
            const contractsData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as Contract[]

            setContracts(contractsData)
            setLoading(false)
          },
          (error) => {
            console.error("Eroare la încărcarea contractelor:", error)
            setError("Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.")
            setLoading(false)
          },
        )

        return () => unsubscribe()
      } catch (error) {
        console.error("Eroare la încărcarea contractelor:", error)
        setError("Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.")
        setLoading(false)
      }
    }

    fetchContracts()
  }, [])

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
    if (!newContractName || !newContractNumber || !newContractType) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Verificăm dacă există deja un contract cu același număr
      const duplicateContract = contracts.find(
        (contract) => contract.number.toLowerCase() === newContractNumber.toLowerCase(),
      )

      if (duplicateContract) {
        toast({
          title: "Eroare",
          description: "Există deja un contract cu acest număr",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      // Adăugăm contractul în Firestore
      await addDoc(collection(db, "contracts"), {
        name: newContractName,
        number: newContractNumber,
        type: newContractType, // Adăugăm tipul contractului
        createdAt: serverTimestamp(),
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setNewContractType("Abonament")
      setIsAddDialogOpen(false)

      toast({
        title: "Contract adăugat",
        description: "Contractul a fost adăugat cu succes",
      })
    } catch (error) {
      console.error("Eroare la adăugarea contractului:", error)
      setError("Nu s-a putut adăuga contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru editarea unui contract
  const handleEditContract = async () => {
    if (!selectedContract || !newContractName || !newContractNumber || !newContractType) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să completați toate câmpurile",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Verificăm dacă există deja un alt contract cu același număr
      const duplicateContract = contracts.find(
        (contract) =>
          contract.number.toLowerCase() === newContractNumber.toLowerCase() && contract.id !== selectedContract.id,
      )

      if (duplicateContract) {
        toast({
          title: "Eroare",
          description: "Există deja un contract cu acest număr",
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      // Actualizăm contractul în Firestore
      const contractRef = doc(db, "contracts", selectedContract.id)
      await updateDoc(contractRef, {
        name: newContractName,
        number: newContractNumber,
        type: newContractType, // Actualizăm tipul contractului
        updatedAt: serverTimestamp(),
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setNewContractType("Abonament")
      setSelectedContract(null)
      setIsEditDialogOpen(false)

      toast({
        title: "Contract actualizat",
        description: "Contractul a fost actualizat cu succes",
      })
    } catch (error) {
      console.error("Eroare la actualizarea contractului:", error)
      setError("Nu s-a putut actualiza contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru ștergerea unui contract
  const handleDeleteContract = async () => {
    if (!selectedContract) return

    try {
      setIsSubmitting(true)
      setError(null)

      // Ștergem contractul din Firestore
      const contractRef = doc(db, "contracts", selectedContract.id)
      await deleteDoc(contractRef)

      // Resetăm starea și închidem dialogul
      setSelectedContract(null)
      setIsDeleteDialogOpen(false)

      toast({
        title: "Contract șters",
        description: "Contractul a fost șters cu succes",
      })
    } catch (error) {
      console.error("Eroare la ștergerea contractului:", error)
      setError("Nu s-a putut șterge contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru deschiderea dialogului de editare
  const openEditDialog = (contract: Contract) => {
    setSelectedContract(contract)
    setNewContractName(contract.name)
    setNewContractNumber(contract.number)
    setNewContractType(contract.type || "Abonament") // Setăm tipul contractului sau valoarea implicită
    setIsEditDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de ștergere
  const openDeleteDialog = (contract: Contract) => {
    setSelectedContract(contract)
    setIsDeleteDialogOpen(true)
  }

  // Funcție pentru formatarea datei
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return format(date, "dd MMMM yyyy, HH:mm", { locale: ro })
    } catch (error) {
      return "Data invalidă"
    }
  }

  // Function to check if we should show the close confirmation dialog
  const handleCloseDialog = (dialogType: "add" | "edit" | "delete") => {
    // For contracts, we'll check if the form fields have values
    if (dialogType === "add" && (newContractName || newContractNumber)) {
      setActiveDialog(dialogType)
      setShowCloseAlert(true)
    } else if (
      dialogType === "edit" &&
      (newContractName !== selectedContract?.name ||
        newContractNumber !== selectedContract?.number ||
        newContractType !== selectedContract?.type)
    ) {
      setActiveDialog(dialogType)
      setShowCloseAlert(true)
    } else {
      // No unsaved changes, close directly
      if (dialogType === "add") setIsAddDialogOpen(false)
      if (dialogType === "edit") setIsEditDialogOpen(false)
      if (dialogType === "delete") setIsDeleteDialogOpen(false)
    }
  }

  // Function to confirm dialog close
  const confirmCloseDialog = () => {
    setShowCloseAlert(false)

    // Close the active dialog
    if (activeDialog === "add") setIsAddDialogOpen(false)
    if (activeDialog === "edit") setIsEditDialogOpen(false)
    if (activeDialog === "delete") setIsDeleteDialogOpen(false)

    setActiveDialog(null)
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Contracte" text="Gestionați contractele din sistem">
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Adaugă Contract
        </Button>
      </DashboardHeader>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Se încarcă contractele...</span>
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nu există contracte în sistem.</p>
          <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" /> Adaugă primul contract
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Layout pentru căutare și filtrare ca pe pagina de clienți */}
          <div className="flex flex-col sm:flex-row gap-2">
            <UniversalSearch 
              onSearch={setSearchText} 
              className="flex-1"
              placeholder="Căutare contracte..."
            />
            <div className="flex gap-2">
              {/* EnhancedFilterSystem se va randa cu propriul său buton de filtrare */}
              {table && <EnhancedFilterSystem table={table} persistenceKey="contracte" />}
            </div>
          </div>
          
          {/* Tabelul de contracte */}
          <DataTable
            columns={columns}
            data={sortedContracts}
            defaultSort={{ id: "createdAt", desc: true }}
            sorting={tableSorting}
            onSortingChange={handleSortingChange}
            table={table}
            setTable={setTable}
            showFilters={false}
          />
        </div>
      )}

      {/* Dialog pentru adăugarea unui contract nou */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("add")
          } else {
            setIsAddDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adaugă Contract Nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contractName">Nume Contract</Label>
              <Input
                id="contractName"
                value={newContractName}
                onChange={(e) => setNewContractName(e.target.value)}
                placeholder="Introduceți numele contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractNumber">Număr Contract</Label>
              <Input
                id="contractNumber"
                value={newContractNumber}
                onChange={(e) => setNewContractNumber(e.target.value)}
                placeholder="Introduceți numărul contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractType">Tip Contract</Label>
              <Select value={newContractType} onValueChange={setNewContractType}>
                <SelectTrigger id="contractType">
                  <SelectValue placeholder="Selectați tipul contractului" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Abonament">Abonament</SelectItem>
                  <SelectItem value="Cu plată la intervenție">Cu plată la intervenție</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog("add")}>
              Anulează
            </Button>
            <Button
              onClick={handleAddContract}
              disabled={isSubmitting || !newContractName || !newContractNumber || !newContractType}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Adaugă"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru editarea unui contract */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("edit")
          } else {
            setIsEditDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editează Contract</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editContractName">Nume Contract</Label>
              <Input
                id="editContractName"
                value={newContractName}
                onChange={(e) => setNewContractName(e.target.value)}
                placeholder="Introduceți numele contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContractNumber">Număr Contract</Label>
              <Input
                id="editContractNumber"
                value={newContractNumber}
                onChange={(e) => setNewContractNumber(e.target.value)}
                placeholder="Introduceți numărul contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editContractType">Tip Contract</Label>
              <Select value={newContractType} onValueChange={setNewContractType}>
                <SelectTrigger id="editContractType">
                  <SelectValue placeholder="Selectați tipul contractului" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Abonament">Abonament</SelectItem>
                  <SelectItem value="Cu plată la intervenție">Cu plată la intervenție</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog("edit")}>
              Anulează
            </Button>
            <Button
              onClick={handleEditContract}
              disabled={isSubmitting || !newContractName || !newContractNumber || !newContractType}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru ștergerea unui contract */}
      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog("delete")
          } else {
            setIsDeleteDialogOpen(open)
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Șterge Contract</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>
              Sunteți sigur că doriți să ștergeți contractul <strong>{selectedContract?.name}</strong> cu numărul{" "}
              <strong>{selectedContract?.number}</strong>?
            </p>
            <p className="text-red-600 mt-2">Această acțiune nu poate fi anulată.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog("delete")}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteContract} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Șterge"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

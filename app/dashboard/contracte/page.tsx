"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
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
import {
  collection,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  getDocs,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Plus, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { addLog } from "@/lib/firebase/firestore"

interface Contract {
  id: string
  numar: string
  client: string
  dataInceput: string
  dataSfarsit: string
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentContract, setCurrentContract] = useState<Contract | null>(null)

  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    numar: "",
    client: "",
    dataInceput: "",
    dataSfarsit: "",
  })
  const [formErrors, setFormErrors] = useState<string[]>([])

  // Încărcăm contractele la încărcarea paginii
  useEffect(() => {
    fetchContracts()
  }, [])

  // Funcție pentru a încărca contractele din Firestore
  const fetchContracts = async () => {
    try {
      setLoading(true)
      setError(null)
      const contractsQuery = query(collection(db, "contracte"), orderBy("numar"))
      const snapshot = await getDocs(contractsQuery)
      const contractsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contract[]
      setContracts(contractsData)
    } catch (error) {
      console.error("Eroare la încărcarea contractelor:", error)
      setError("Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.")
      toast({
        title: "Eroare",
        description: "Nu s-au putut încărca contractele. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Funcție pentru a gestiona schimbările în formular
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value,
    })
  }

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
    if (!formData.numar || !formData.client || !formData.dataInceput || !formData.dataSfarsit) {
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
        (contract) => contract.numar.toLowerCase() === formData.numar.toLowerCase(),
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
      await addDoc(collection(db, "contracte"), {
        ...formData,
        createdAt: serverTimestamp(),
      })

      await addLog("Adăugare contract", `Contractul cu numărul ${formData.numar} a fost adăugat.`)

      // Resetăm formularul și închidem dialogul
      setFormData({
        numar: "",
        client: "",
        dataInceput: "",
        dataSfarsit: "",
      })
      setIsAddDialogOpen(false)

      toast({
        title: "Contract adăugat",
        description: "Contractul a fost adăugat cu succes",
      })

      // Reîncărcăm lista de contracte
      fetchContracts()
    } catch (error) {
      console.error("Eroare la adăugarea contractului:", error)
      setError("Nu s-a putut adăuga contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru editarea unui contract
  const handleEditContract = async () => {
    if (!currentContract || !formData.numar || !formData.client || !formData.dataInceput || !formData.dataSfarsit) {
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
          contract.numar.toLowerCase() === formData.numar.toLowerCase() && contract.id !== currentContract.id,
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
      const contractRef = doc(db, "contracte", currentContract.id)
      await updateDoc(contractRef, {
        ...formData,
        updatedAt: serverTimestamp(),
      })

      await addLog("Editare contract", `Contractul cu numărul ${formData.numar} a fost editat.`)

      // Resetăm formularul și închidem dialogul
      setFormData({
        numar: "",
        client: "",
        dataInceput: "",
        dataSfarsit: "",
      })
      setCurrentContract(null)
      setIsEditDialogOpen(false)

      toast({
        title: "Contract actualizat",
        description: "Contractul a fost actualizat cu succes",
      })

      // Reîncărcăm lista de contracte
      fetchContracts()
    } catch (error) {
      console.error("Eroare la actualizarea contractului:", error)
      setError("Nu s-a putut actualiza contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru ștergerea unui contract
  const handleDeleteContract = async () => {
    if (!currentContract) return

    try {
      setIsSubmitting(true)
      setError(null)

      // Ștergem contractul din Firestore
      const contractRef = doc(db, "contracte", currentContract.id)
      await deleteDoc(contractRef)

      await addLog("Ștergere contract", `Contractul cu numărul ${currentContract.numar} a fost șters.`)

      // Resetăm starea și închidem dialogul
      setCurrentContract(null)
      setIsDeleteDialogOpen(false)

      toast({
        title: "Contract șters",
        description: "Contractul a fost șters cu succes",
      })

      // Reîncărcăm lista de contracte
      fetchContracts()
    } catch (error) {
      console.error("Eroare la ștergerea contractului:", error)
      setError("Nu s-a putut șterge contractul. Vă rugăm să încercați din nou.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Funcție pentru deschiderea dialogului de editare
  const openEditDialog = (contract: Contract) => {
    setCurrentContract(contract)
    setFormData({
      numar: contract.numar,
      client: contract.client,
      dataInceput: contract.dataInceput,
      dataSfarsit: contract.dataSfarsit,
    })
    setIsEditDialogOpen(true)
  }

  // Funcție pentru deschiderea dialogului de ștergere
  const openDeleteDialog = (contract: Contract) => {
    setCurrentContract(contract)
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
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Număr Contract</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Data Început</TableHead>
                <TableHead>Data Sfârșit</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">{contract.numar}</TableCell>
                  <TableCell>{contract.client}</TableCell>
                  <TableCell>{contract.dataInceput}</TableCell>
                  <TableCell>{contract.dataSfarsit}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEditDialog(contract)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-600"
                        onClick={() => openDeleteDialog(contract)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog pentru adăugarea unui contract nou */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adaugă Contract Nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="numar">Număr Contract</Label>
              <Input
                id="numar"
                name="numar"
                value={formData.numar}
                onChange={handleInputChange}
                placeholder="Introduceți numărul contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                name="client"
                value={formData.client}
                onChange={handleInputChange}
                placeholder="Introduceți numele clientului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataInceput">Data Început</Label>
              <Input
                type="date"
                id="dataInceput"
                name="dataInceput"
                value={formData.dataInceput}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataSfarsit">Data Sfârșit</Label>
              <Input
                type="date"
                id="dataSfarsit"
                name="dataSfarsit"
                value={formData.dataSfarsit}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleAddContract} disabled={isSubmitting}>
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
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Editează Contract</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="numar">Număr Contract</Label>
              <Input
                id="numar"
                name="numar"
                value={formData.numar}
                onChange={handleInputChange}
                placeholder="Introduceți numărul contractului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                name="client"
                value={formData.client}
                onChange={handleInputChange}
                placeholder="Introduceți numele clientului"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataInceput">Data Început</Label>
              <Input
                type="date"
                id="dataInceput"
                name="dataInceput"
                value={formData.dataInceput}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataSfarsit">Data Sfârșit</Label>
              <Input
                type="date"
                id="dataSfarsit"
                name="dataSfarsit"
                value={formData.dataSfarsit}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleEditContract} disabled={isSubmitting}>
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
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sunteți sigur?</AlertDialogTitle>
            <AlertDialogDescription>
              Această acțiune nu poate fi anulată. Ești sigur că vrei să ștergi contractul cu numărul{" "}
              {currentContract?.numar}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContract} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Șterge"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  )
}

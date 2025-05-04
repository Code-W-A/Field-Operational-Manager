"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
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
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { addLog } from "@/lib/firebase/firestore"
import { Loader2 } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import {
  orderBy as orderByFn,
  where,
  query as queryFn,
  collection as collectionFn,
  onSnapshot,
} from "firebase/firestore"
import type { Client, PersoanaContact, Locatie, Echipament } from "@/lib/firebase/firestore"
import { formatDateTime24, formatTime24 } from "@/lib/utils/time-format"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
// Adăugați aceste importuri la începutul fișierului
import { useNavigationPrompt } from "@/hooks/use-navigation-prompt"
import { differenceInMonths } from "date-fns"

interface Contract {
  id: string
  numar: string
  client: string
  dataInceput: string
  dataSfarsit: string
}

// Define the Lucrare type
interface Lucrare {
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  tehnicieni: string[]
  client: string
  locatie: string
  echipament: string
  descriere: string
  persoanaContact: string
  telefon: string
  statusLucrare: string
  statusFacturare: string
  contract?: string
  contractNumber?: string
  defectReclamat?: string
  persoaneContact?: PersoanaContact[]
  echipamentId?: string
  echipamentCod?: string
}

// Add the defectReclamat field to the LucrareFormProps interface
interface LucrareFormProps {
  isEdit?: boolean
  dataEmiterii: Date | undefined
  setDataEmiterii: (date: Date | undefined) => void
  dataInterventie: Date | undefined
  setDataInterventie: (date: Date | undefined) => void
  formData: {
    tipLucrare: string
    tehnicieni: string[]
    client: string
    locatie: string
    echipament: string
    descriere: string
    persoanaContact: string
    telefon: string
    statusLucrare: string
    statusFacturare: string
    contract?: string
    contractNumber?: string
    defectReclamat?: string
    persoaneContact?: PersoanaContact[]
    echipamentId?: string
    echipamentCod?: string
  }
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleSelectChange: (id: string, value: string) => void
  handleTehnicieniChange: (value: string) => void
  handleCustomChange?: (field: string, value: any) => void
  fieldErrors?: string[]
  onSubmit?: (data: Partial<Lucrare>) => Promise<void>
  onCancel?: () => void
  initialData?: Lucrare | null
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

// Add the following to the LucrareForm component
export function LucrareForm({
  isEdit = false,
  dataEmiterii,
  setDataEmiterii,
  dataInterventie,
  setDataInterventie,
  formData,
  handleInputChange,
  handleSelectChange,
  handleTehnicieniChange,
  handleCustomChange,
  fieldErrors = [],
  onSubmit,
  onCancel,
  initialData,
}: LucrareFormProps) {
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)
  const [tehnicieni, setTehnicieni] = useState<any[]>([])
  const [loadingTehnicieni, setLoadingTehnicieni] = useState(true)
  const [timeEmiterii, setTimeEmiterii] = useState<string>(
    dataEmiterii ? formatTime24(dataEmiterii) : formatTime24(new Date()),
  )
  const [timeInterventie, setTimeInterventie] = useState<string>(
    dataInterventie ? formatTime24(dataInterventie) : formatTime24(new Date()),
  )
  const [error, setError] = useState<string | null>(null)
  const [clientSearchTerm, setClientSearchTerm] = useState("")
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
  const [formModified, setFormModified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [garantieWarning, setGarantieWarning] = useState<string | null>(null)

  // Track initial form state
  const [initialFormState, setInitialFormState] = useState({
    dataEmiterii,
    dataInterventie,
    formData: JSON.stringify(formData),
  })

  // Use the unsaved changes hook
  const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
    useUnsavedChanges(formModified)

  // Add state for controlling the popovers
  const [dateEmiteriiOpen, setDateEmiteriiOpen] = useState(false)
  const [dateInterventieOpen, setDateInterventieOpen] = useState(false)

  // Adăugăm state pentru clientul selectat
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Adăugăm state pentru locația selectată
  const [selectedLocatie, setSelectedLocatie] = useState<Locatie | null>(null)
  const [locatii, setLocatii] = useState<Locatie[]>([])

  // Adăugăm state pentru persoanele de contact ale locației selectate
  const [persoaneContact, setPersoaneContact] = useState<PersoanaContact[]>([])

  // Adăugăm state pentru a controla vizibilitatea acordeonului
  const [showContactAccordion, setShowContactAccordion] = useState(false)

  // Adăugăm state pentru a stoca echipamentele disponibile pentru locația selectată
  const [availableEquipments, setAvailableEquipments] = useState<Echipament[]>([])

  // Adăugăm state pentru a urmări dacă echipamentele au fost încărcate
  const [equipmentsLoaded, setEquipmentsLoaded] = useState(false)

  // Check if form has been modified
  useEffect(() => {
    const currentState = {
      dataEmiterii,
      dataInterventie,
      formData: JSON.stringify(formData),
    }

    const hasChanged =
      currentState.dataEmiterii !== initialFormState.dataEmiterii ||
      currentState.dataInterventie !== initialFormState.dataInterventie ||
      currentState.formData !== initialFormState.formData

    setFormModified(hasChanged)
  }, [dataEmiterii, dataInterventie, formData, initialFormState])

  // Reset form modified state after successful submission
  useEffect(() => {
    if (onSubmit && !isSubmitting) {
      // Update the initial state to match current state after successful save
      setInitialFormState({
        dataEmiterii,
        dataInterventie,
        formData: JSON.stringify(formData),
      })
      setFormModified(false)
    }
  }, [onSubmit, isSubmitting, dataEmiterii, dataInterventie, formData])

  // În componenta LucrareForm, adăugați:
  const { showPrompt, handleConfirm, handleCancel, handleCancel2 } = useNavigationPrompt(formModified)

  // Handle cancel with confirmation if form is modified
  const handleCancelWithConfirmation = () => {
    if (formModified && onCancel) {
      // Show confirmation dialog
      handleNavigation("#cancel")
    } else if (onCancel) {
      onCancel()
    }
  }

  // Confirm cancel action
  const confirmCancelAction = () => {
    if (onCancel) {
      onCancel()
    }
  }

  // Handle date selection with proper time preservation
  const handleDateEmiteriiSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) {
        setDataEmiterii(undefined)
        return
      }

      // Create a new date to avoid mutation
      const newDate = new Date(date)

      // If we already have a date, preserve the time
      if (dataEmiterii) {
        newDate.setHours(dataEmiterii.getHours(), dataEmiterii.getMinutes(), dataEmiterii.getSeconds())
      }

      setDataEmiterii(newDate)
    },
    [dataEmiterii, setDataEmiterii],
  )

  const handleDateInterventieSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) {
        setDataInterventie(undefined)
        return
      }

      // Create a new date to avoid mutation
      const newDate = new Date(date)

      // If we already have a date, preserve the time
      if (dataInterventie) {
        newDate.setHours(dataInterventie.getHours(), dataInterventie.getMinutes(), dataInterventie.getSeconds())
      }

      setDataInterventie(newDate)
    },
    [dataInterventie, setDataInterventie],
  )

  // Actualizăm funcția handleTimeEmiteriiChange pentru a folosi formatul de 24 de ore
  const handleTimeEmiteriiChange = useCallback(
    (newTime: string) => {
      setTimeEmiterii(newTime)

      if (dataEmiterii) {
        // Creăm o nouă dată cu ora actualizată
        const [hours, minutes] = newTime.split(":").map(Number)
        const newDate = new Date(dataEmiterii)
        newDate.setHours(hours, minutes)
        setDataEmiterii(newDate)
      }
    },
    [dataEmiterii, setDataEmiterii],
  )

  // Actualizăm funcția handleTimeInterventieChange pentru a folosi formatul de 24 de ore
  const handleTimeInterventieChange = useCallback(
    (newTime: string) => {
      setTimeInterventie(newTime)

      if (dataInterventie) {
        // Creăm o nouă dată cu ora actualizată
        const [hours, minutes] = newTime.split(":").map(Number)
        const newDate = new Date(dataInterventie)
        newDate.setHours(hours, minutes)
        setDataInterventie(newDate)
      }
    },
    [dataInterventie, setDataInterventie],
  )

  // Actualizăm efectul pentru a folosi formatul de 24 de ore
  useEffect(() => {
    if (dataEmiterii) {
      // Păstrăm ora curentă dacă data se schimbă
      const currentTime = timeEmiterii || formatTime24(new Date())
      setTimeEmiterii(currentTime)
    }
  }, [dataEmiterii, timeEmiterii])

  // Actualizăm efectul pentru a folosi formatul de 24 de ore
  useEffect(() => {
    if (dataInterventie) {
      // Păstrăm ora curentă dacă data se schimbă
      const currentTime = timeInterventie || formatTime24(new Date())
      setTimeInterventie(currentTime)
    }
  }, [dataInterventie, timeInterventie])

  // Obținem clienții din Firestore
  const {
    data: clienti,
    loading: loadingClienti,
    error: clientiError,
  } = useFirebaseCollection<Client>("clienti", [orderByFn("nume", "asc")])

  // Actualizăm lista filtrată de clienți când se schimbă termenul de căutare sau lista de clienți
  useEffect(() => {
    if (clienti && clienti.length > 0) {
      if (clientSearchTerm.trim() === "") {
        setFilteredClients(clienti)
      } else {
        const searchTermLower = clientSearchTerm.toLowerCase()
        const filtered = clienti.filter((client) => client.nume.toLowerCase().includes(searchTermLower))
        setFilteredClients(filtered)
      }
    } else {
      setFilteredClients([])
    }
  }, [clientSearchTerm, clienti])

  // Încărcăm tehnicienii direct din Firestore
  useEffect(() => {
    const fetchTehnicieni = async () => {
      try {
        setLoadingTehnicieni(true)
        const tehnicieniQuery = queryFn(collectionFn(db, "users"), where("role", "==", "tehnician"))

        const unsubscribe = onSnapshot(
          tehnicieniQuery,
          (snapshot) => {
            const tehnicieniData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            setTehnicieni(tehnicieniData)
            setLoadingTehnicieni(false)
          },
          (error) => {
            console.error("Eroare la încărcarea tehnicienilor:", error)
            setLoadingTehnicieni(false)
          },
        )

        return () => unsubscribe()
      } catch (error) {
        console.error("Eroare la încărcarea tehnicienilor:", error)
        setLoadingTehnicieni(false)
      }
    }

    fetchTehnicieni()
  }, [])

  // Verificăm validitatea garanției când se schimbă tipul lucrării sau echipamentul
  useEffect(() => {
    if (formData.tipLucrare === "Intervenție în garanție" && formData.echipamentId) {
      const selectedEquipment = availableEquipments.find(e => e.id === formData.echipamentId)
      
      if (selectedEquipment && selectedEquipment.dataInstalare) {
        const installDate = new Date(selectedEquipment.dataInstalare)
        const currentDate = new Date()
        const monthsDiff = differenceInMonths(currentDate, installDate)
        
        // Verificăm dacă au trecut mai mult de 24 de luni de la instalare
        if (monthsDiff > 24) {
          setGarantieWarning(`
Atenție!
Au
trecut
$
{
  monthsDiff
}
luni
de
la
instalare (${format(installDate, "dd.MM.yyyy")}). Garanția
standard
este
de
maxim
24
de
luni.`)
        } else if (monthsDiff > 12) {
          // Afișăm un avertisment mai puțin sever dacă au trecut între 12 și 24 de luni
          setGarantieWarning(`
Informare: Au
trecut
$
{
  monthsDiff
}
luni
de
la
instalare (${format(installDate, "dd.MM.yyyy")}). Verificați
dacă
echipamentul
are
garanție
extinsă
de
24
de
luni.`)
        } else {
          setGarantieWarning(null)
        }
      } else if (selectedEquipment && !selectedEquipment.dataInstalare) {
        setGarantieWarning("Atenție! Echipamentul selectat nu are înregistrată o dată de instalare. Verificați dacă este în garanție.")
      } else {
        setGarantieWarning(null)
      }
    } else {
      setGarantieWarning(null)
    }
  }, [formData.tipLucrare, formData.echipamentId, availableEquipments])

  // Modificăm funcția handleClientChange pentru a reseta echipamentul când se schimbă clientul
  const handleClientChange = async (value: string) => {
    // Găsim clientul selectat
    const client = clienti.find((c) => c.nume === value)

    if (!client) {
      console.error("Clientul selectat nu a fost găsit în lista de clienți")
      toast({
        title: "Eroare",
        description: "Clientul selectat nu a fost găsit. Vă rugăm să încercați din nou.",
        variant: "destructive",
      })
      return
    }

    // Actualizăm formData cu noul client
    handleSelectChange("client", value)

    // Resetăm câmpurile dependente doar dacă clientul s-a schimbat
    if (selectedClient?.id !== client.id) {
      handleSelectChange("locatie", "")
      handleSelectChange("echipament", "")
      handleSelectChange("persoanaContact", "")
      handleSelectChange("telefon", "")

      // Resetăm echipamentul selectat
      if (handleCustomChange) {
        handleCustomChange("echipamentId", "")
        handleCustomChange("echipamentCod", "")
      }

      // Resetăm echipamentele disponibile
      setAvailableEquipments([])
      setEquipmentsLoaded(false)

      // Resetăm acordeonul doar dacă clientul s-a schimbat
      setShowContactAccordion(false)
    }

    // Actualizăm starea pentru clientul selectat
    setSelectedClient(client)

    console.log("Client selectat:", client)
  }

  // Modificăm funcția handleLocationChange pentru a încărca echipamentele disponibile pentru locația selectată
  const handleLocationChange = (value: string) => {
    if (!selectedClient) {
      console.error("Nu există un client selectat")
      return
    }

    const selectedLocation = selectedClient.locatii?.find((loc) => loc.nume === value)

    // Actualizăm datele formularului
    handleSelectChange("locatie", value)

    // Resetăm echipamentul selectat doar dacă locația s-a schimbat
    if (selectedLocatie?.nume !== value) {
      handleSelectChange("echipament", "")

      // Resetăm echipamentul selectat
      if (handleCustomChange) {
        handleCustomChange("echipamentId", "")
        handleCustomChange("echipamentCod", "")
      }
    }

    // Actualizăm echipamentele disponibile
    if (selectedLocation && selectedLocation.echipamente) {
      console.log("Setăm echipamentele disponibile:", selectedLocation.echipamente)
      setAvailableEquipments(selectedLocation.echipamente)
      setEquipmentsLoaded(true)
    } else {
      console.log("Nu există echipamente pentru locația selectată")
      setAvailableEquipments([])
      setEquipmentsLoaded(true)
    }

    // Actualizăm locația selectată
    setSelectedLocatie(selectedLocation || null)
  }

  // Adăugăm funcție pentru selectarea echipamentului
  const handleEquipmentSelect = (equipmentId: string, equipment: Echipament) => {
    console.log("Echipament selectat în LucrareForm:", equipment)

    // Actualizăm toate câmpurile relevante
    handleSelectChange("echipament", equipment.nume)

    if (handleCustomChange) {
      handleCustomChange("echipamentId", equipmentId)
      handleCustomChange("echipamentCod", equipment.cod)
    }

    // Afișăm un toast pentru feedback
    toast({
      title: "Echipament selectat",
      description: `
Ați
selectat
echipamentul
$
{
  equipment.nume
}
(cod: ${equipment.cod})`,
      variant: "default",
    })
  }

  // Actualizăm clientul selectat și locațiile când se schimbă clientul
  useEffect(() => {
    if (formData && formData.client && clienti && clienti.length > 0) {
      const client = clienti.find((c) => c.nume === formData.client)
      if (client) {
        setSelectedClient(client)

        // Actualizăm locațiile
        if (client.locatii && client.locatii.length > 0) {
          setLocatii(client.locatii)
        } else {
          // Dacă clientul nu are locații, creăm una implicită cu persoanele de contact existente
          const defaultLocatie: Locatie = {
            nume: "Sediu principal",
            adresa: client.adresa || "",
            persoaneContact:
              client.persoaneContact && client.persoaneContact.length > 0
                ? client.persoaneContact
                : [{ nume: client.persoanaContact || "", telefon: client.telefon || "", email: "", functie: "" }],
            echipamente: [],
          }
          setLocatii([defaultLocatie])
        }

        // Nu resetăm locația selectată dacă avem deja o locație selectată
        if (!selectedLocatie) {
          setSelectedLocatie(null)
          setPersoaneContact([])
          setShowContactAccordion(false)
          setAvailableEquipments([])
          setEquipmentsLoaded(false)
        }
      }
    }
  }, [formData, formData?.client, clienti, selectedLocatie])

  // Adăugăm funcție pentru gestionarea selecției locației
  const handleLocatieSelect = (locatieNume: string) => {
    console.log("Locație selectată:", locatieNume)
    const locatie = locatii.find((loc) => loc.nume === locatieNume)
    if (locatie) {
      console.log("Locație găsită:", locatie)
      setSelectedLocatie(locatie)

      // Actualizăm persoanele de contact disponibile pentru această locație
      if (locatie.persoaneContact && locatie.persoaneContact.length > 0) {
        console.log("Persoane de contact găsite:", locatie.persoaneContact)
        setPersoaneContact(locatie.persoaneContact)

        // Automatically associate all contacts with the work entry
        if (handleCustomChange) {
          handleCustomChange("persoaneContact", locatie.persoaneContact)
        }

        // If there's at least one contact, set the first one as the primary contact
        // for backward compatibility
        if (locatie.persoaneContact.length > 0) {
          const primaryContact = locatie.persoaneContact[0]
          handleSelectChange("persoanaContact", primaryContact.nume || "")
          handleSelectChange("telefon", primaryContact.telefon || "")
        }
      } else {
        console.log("Nu există persoane de contact pentru această locație")
        setPersoaneContact([])

        // Clear the contacts array
        if (handleCustomChange) {
          handleCustomChange("persoaneContact", [])
        }

        // Clear the primary contact fields
        handleSelectChange("persoanaContact", "")
        handleSelectChange("telefon", "")
      }

      // Actualizăm echipamentele disponibile pentru această locație
      if (locatie.echipamente && locatie.echipamente.length > 0) {
        console.log("Echipamente găsite pentru locație:", locatie.echipamente)
        setAvailableEquipments(locatie.echipamente)
        setEquipmentsLoaded(true)
      } else {
        console.log("Nu există echipamente pentru această locație")
        setAvailableEquipments([])
        setEquipmentsLoaded(true)
      }

      // Activăm afișarea acordeonului și nu-l dezactivăm
      setShowContactAccordion(true)

      // Actualizăm câmpul locație în formData
      handleSelectChange("locatie", locatieNume)
    }
  }

  // Adăugăm un efect pentru a actualiza echipamentele când se schimbă locația selectată
  // fără a reseta selecția existentă
  useEffect(() => {
    if (selectedLocatie && selectedLocatie.echipamente) {
      console.log("Actualizare echipamente pentru locația selectată:", selectedLocatie.echipamente)
      setAvailableEquipments(selectedLocatie.echipamente || [])
      setEquipmentsLoaded(true)

      // Verificăm dacă echipamentul selectat există în noua listă
      if (formData.echipamentId) {
        const echipamentExista = selectedLocatie.echipamente?.some((e) => e.id === formData.echipamentId)
        if (!echipamentExista) {
          console.log("Echipamentul selectat anterior nu există în noua locație")
          // Opțional: putem reseta selecția aici dacă dorim
          // handleSelectChange("echipament", "");
          // if (handleCustomChange) {
          //   handleCustomChange("echipamentId", "");
          //   handleCustomChange("echipamentCod", "");
          // }
        }
      }
    }
  }, [selectedLocatie, formData.echipamentId])

  // Adăugăm un efect pentru a menține starea echipamentului selectat
  useEffect(() => {
    if (formData.echipamentId && availableEquipments.length > 0) {
      const selectedEquipment = availableEquipments.find((e) => e.id === formData.echipamentId)
      if (selectedEquipment) {
        console.log("Echipament găsit și setat în formular:", selectedEquipment)
        // Nu este nevoie să actualizăm formData aici, doar ne asigurăm că echipamentul este găsit
      } else {
        console.log("Echipamentul cu ID-ul", formData.echipamentId, "nu a fost găsit în lista disponibilă")
      }
    }
  }, [formData.echipamentId, availableEquipments])

  // Adaugă acest efect pentru debugging
  useEffect(() => {
    console.log("Stare availableEquipments:", availableEquipments)
    console.log("Stare formData.locatie:", formData.locatie)
    console.log("Stare formData.echipamentId:", formData.echipamentId)
    console.log("Stare formData.echipament:", formData.echipament)
    console.log("Condiție disabled:", !formData.locatie)
  }, [availableEquipments, formData.locatie, formData.echipamentId, formData.echipament])

  // Modificăm funcția handleClientAdded pentru a gestiona corect adăugarea clientului
  const handleClientAdded = (clientName: string) => {
    handleSelectChange("client", clientName)
    setIsAddClientDialogOpen(false)
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"

  const validateForm = () => {
    let isValid = true
    const errors: string[] = []

    if (!dataEmiterii) {
      errors.push("dataEmiterii")
      isValid = false
    }

    if (!dataInterventie) {
      errors.push("dataInterventie")
      isValid = false
    }

    if (!formData.tipLucrare) {
      errors.push("tipLucrare")
      isValid = false
    }

    if (formData.tipLucrare === "Intervenție în contract" && !formData.contract) {
      errors.push("contract")
      isValid = false
    }

    return isValid
  }

  // Add a submit handler if onSubmit is provided
  const handleSubmit = async () => {
    if (!onSubmit) return

    if (!validateForm()) {
      setError("Vă rugăm să completați toate câmpurile obligatorii")
      return
    }

    setIsSubmitting(true)

    try {
      const updatedData: Partial<Lucrare> = {
        dataEmiterii: dataEmiterii ? formatDateTime24(dataEmiterii) : "",
        dataInterventie: dataInterventie ? formatDateTime24(dataInterventie) : "",
        tipLucrare: formData.tipLucrare,
        tehnicieni: formData.tehnicieni,
        client: formData.client,
        locatie: formData.locatie,
        echipament: formData.echipament,
        descriere: formData.descriere,
        persoanaContact: formData.persoanaContact,
        telefon: formData.telefon,
        statusLucrare: formData.statusLucrare,
        statusFacturare: formData.statusFacturare,
        contract: formData.contract,
        contractNumber: formData.contractNumber,
        defectReclamat: formData.defectReclamat,
        // Include all contact persons from the selected location
        persoaneContact: formData.persoaneContact || persoaneContact,
        echipamentId: formData.echipamentId,
        echipamentCod: formData.echipamentCod,
      }

      await onSubmit(updatedData)
    } finally {
      setIsSubmitting(false)
    }
  }

  const validateGarantie = useCallback((echipament: any) => {
    if (!echipament || !echipament.dataInstalare) return true;
    
    const dataInstalare = new Date(echipament.dataInstalare);
    const dataCurenta = new Date();
    
    // Calculează diferența în luni
    const diferentaLuni = 
      (dataCurenta.getFullYear() - dataInstalare.getFullYear()) * 12 + 
      (dataCurenta.getMonth() - dataInstalare.getMonth());
    
    // Verifică dacă sunt mai puțin de 24 de luni
    return diferentaLuni <= 24;
  }, []);

  // Add buttons at the end if onSubmit and onCancel are provided
  // Adăugăm un efect pentru a actualiza persoanele de contact când se schimbă locația selectată
  // și pentru a menține starea când se schimbă alte câmpuri
  useEffect(() => {
    if (selectedLocatie) {
      console.log("Locație selectată (effect):", selectedLocatie)
      if (selectedLocatie.persoaneContact) {
        console.log("Persoane de contact (effect):", selectedLocatie.persoaneContact)
        setPersoaneContact(selectedLocatie.persoaneContact)

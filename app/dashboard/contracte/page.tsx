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

        // Automatically associate all contacts with the work entry
        if (handleCustomChange) {
          handleCustomChange("persoaneContact", selectedLocatie.persoaneContact)
        }
      }
      // Activăm afișarea acordeonului și nu-l dezactivăm niciodată după ce a fost activat
      setShowContactAccordion(true)
    }
  }, [selectedLocatie, handleCustomChange])

  // Adăugăm un efect pentru a actualiza starea când se încarcă datele inițiale
  useEffect(() => {
    if (initialData && initialData.locatie && locatii.length > 0) {
      const locatie = locatii.find((loc) => loc.nume === initialData.locatie)
      if (locatie) {
        setSelectedLocatie(locatie)
        if (locatie.persoaneContact) {
          setPersoaneContact(locatie.persoaneContact)

          // If we have initial data but no persoaneContact field, initialize it
          if (handleCustomChange && (!initialData.persoaneContact || initialData.persoaneContact.length === 0)) {
            handleCustomChange("persoaneContact", locatie.persoaneContact)
          }
        }
        setShowContactAccordion(true)

        // Încărcăm echipamentele pentru locația inițială
        if (locatie.echipamente) {
          setAvailableEquipments(locatie.echipamente)
          setEquipmentsLoaded(true)
        }
      }
    }

    // If we have initial data with persoaneContact, use that
    if (initialData && initialData.persoaneContact && initialData.persoaneContact.length > 0) {
      setPersoaneContact(initialData.persoaneContact)
      setShowContactAccordion(true)
    }
  }, [initialData, locatii, handleCustomChange])

  // Adăugăm un efect pentru a afișa erori de încărcare a clienților
  useEffect(() => {
    if (clientiError) {
      console.error("Eroare la încărcarea clienților:", clientiError)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la încărcarea listei de clienți. Vă rugăm să reîncărcați pagina.",
        variant: "destructive",
      })
    }
  }, [clientiError])

  // Înlocuiți funcția handleCancel cu:
  const handleFormCancel = () => {
    handleCancel2(onCancel)
  }

  const tipuriLucrari = [
    "Ofertare",
    "Contractare",
    "Pregătire în atelier",
    "Instalare",
    "Predare",
    "Intervenție în garanție",
    "Intervenție contra cost",
    "Intervenție în contract",
    "Re-Interventie"
  ];

  return (
    <div className="modal-calendar-container">
      {error && <div className="text-red-500 mb-4">{error}</div>}
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-1 gap-6">
          {/* Data Emiterii - Setată automat și nemodificabilă */}
          <div className="space-y-2">
            <label htmlFor="dataEmiterii" className="text-sm font-medium flex items-center">
              Data Emiterii
              <span className="ml-2 text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded">Automată</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="sm:w-2/3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal opacity-90 cursor-not-allowed"
                  disabled
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataEmiterii ? format(dataEmiterii, "dd.MM.yyyy", { locale: ro }) : "Data curentă"}
                </Button>
              </div>
              <div className="relative sm:w-1/3">
                <Input
                  type="text"
                  value={formatTime24(dataEmiterii || new Date())}
                  className="cursor-not-allowed opacity-90"
                  disabled
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Data și ora emiterii sunt setate automat cu data curentă</p>
          </div>

          {/* Data Solicitată Intervenție - Updated with new date picker */}
          <div className="space-y-2">
            <label htmlFor="dataInterventie" className="text-sm font-medium">
              Data solicitată intervenție *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="sm:w-2/3">
                <Popover open={dateInterventieOpen} onOpenChange={setDateInterventieOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={`
w - full
justify - start
text - left
font - normal
$
{
  hasError("dataInterventie") ? errorStyle : ""
}
;`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataInterventie ? (
                        format(dataInterventie, "dd.MM.yyyy", { locale: ro })
                      ) : (
                        <span>Selectați data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                    <CustomDatePicker
                      selectedDate={dataInterventie}
                      onDateChange={handleDateInterventieSelect}
                      onClose={() => setDateInterventieOpen(false)}
                      hasError={hasError("dataInterventie")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative sm:w-1/3">
                <TimeSelector
                  value={timeInterventie}
                  onChange={handleTimeInterventieChange}
                  label="Ora intervenției"
                  id="timeInterventie"
                  hasError={hasError("dataInterventie")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Data și ora solicitată pentru intervenție</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="tipLucrare" className="text-sm font-medium">
              Tip Lucrare *
            </label>
            <Select value={formData.tipLucrare} onValueChange={(value) => handleSelectChange("tipLucrare", value)}>
              <SelectTrigger id="tipLucrare" className={hasError("tipLucrare") ? errorStyle : ""}>
                <SelectValue placeholder="Selectați tipul" />
              </SelectTrigger>
              <SelectContent>
                {tipuriLucrari.map((tip) => (
                  <SelectItem key={tip} value={tip}>
                    {tip}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {formData.tipLucrare === "Intervenție în contract" && (
            <div className="space-y-2">
              <label htmlFor="contract" className="text-sm font-medium">
                Contract *
              </label>
              <ContractSelect
                value={formData.contract || ""}
                onChange={(value, contractNumber) => {
                  handleSelectChange("contract", value)
                  handleSelectChange("contractNumber", contractNumber || "")
                }}
                hasError={hasError("contract")}
                errorStyle={errorStyle}
              />
              <p className="text-xs text-muted-foreground">Selectați contractul asociat intervenției</p>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="tehnicieni" className="text-sm font-medium">
              Tehnicieni
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tehnicieni.map((tech) => (
                <Badge key={tech} variant="secondary" className="bg-blue-100 text-blue-800">
                  {tech}{" "}
                  <span className="ml-1 cursor-pointer" onClick={() => handleTehnicieniChange(tech)}>
                    ×
                  </span>
                </Badge>
              ))}
            </div>
            <Select onValueChange={handleTehnicieniChange}>
              <SelectTrigger id="tehnicieni">
                <SelectValue placeholder="Selectați tehnicienii" />
              </SelectTrigger>
              <SelectContent>
                {loadingTehnicieni ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Se încarcă...</span>
                  </div>
                ) : tehnicieni.length > 0 ? (
                  tehnicieni.map((tehnician) => (
                    <SelectItem key={tehnician.id} value={tehnician.displayName || ""}>
                      {tehnician.displayName}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-center text-sm text-muted-foreground">Nu există tehnicieni disponibili</div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Puteți selecta mai mulți tehnicieni</p>
          </div>
        </div>

        {/* Afișăm avertismentul pentru garanție dacă este cazul */}
        {garantieWarning && (
          <Alert variant="warning" className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">Verificare garanție</AlertTitle>
            <AlertDescription className="text-amber-700">
              {garantieWarning}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label htmlFor="client" className="text-sm font-medium">
            Client *
          </label>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Popover open={isClientDropdownOpen} onOpenChange={setIsClientDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isClientDropdownOpen}
                    className={`
w - full
justify - between
$
{
  hasError("client") ? errorStyle : ""
}
;`}
                  >
                    {formData.client || "Selectați clientul"}
                    <span className="ml-2 opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <div className="p-2">
                    <Input
                      placeholder="Căutare client..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="mb-2"
                    />
                    <div className="max-h-[200px] overflow-y-auto">
                      {loadingClienti ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span>Se încarcă clienții...</span>
                        </div>
                      ) : filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <div
                            key={client.id}
                            className={`
px - 2
py - 1
cursor - pointer
hover: bg - gray - 100
rounded
$
{
  formData.client === client.nume ? "bg-blue-50 text-blue-600" : ""
}
`}
                            onClick={() => {
                              handleClientChange(client.nume)
                              setIsClientDropdownOpen(false)
                              setClientSearchTerm("")
                            }}
                          >
                            {client.nume}
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-center text-sm text-muted-foreground">
                          {clientSearchTerm ? "Nu s-au găsit clienți" : "Nu există clienți disponibili"}
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" onClick={() => setIsAddClientDialogOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {selectedClient && (
              <div className="text-xs text-muted-foreground">
                Client selectat: <span className="font-medium">{selectedClient.nume}</span>
                {selectedClient.cif && <span> (CIF: {selectedClient.cif})</span>}
              </div>
            )}
          </div>
        </div>

        {/* Dialog pentru adăugarea unui client nou */}
        <Dialog open={isAddClientDialogOpen} onOpenChange={setIsAddClientDialogOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adaugă Client Nou</DialogTitle>
            </DialogHeader>
            <ClientForm onSuccess={handleClientAdded} onCancel={() => setIsAddClientDialogOpen(false)} />
          </DialogContent>
        </Dialog>

        {/* Adăugăm secțiunea de locație */}
        {locatii.length > 0 && (
          <div className="space-y-2">
            <label htmlFor="locatie" className="text-sm font-medium">
              Locație *
            </label>
            <Select value={formData.locatie} onValueChange={handleLocatieSelect}>
              <SelectTrigger id="locatie" className={hasError("locatie") ? errorStyle : ""}>
                <SelectValue placeholder="Selectați locația" />
              </SelectTrigger>
              <SelectContent>
                {locatii.map((loc, index) => (
                  <SelectItem key={index} value={loc.nume}>
                    {loc.nume}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Selectați locația clientului pentru această lucrare. Toate persoanele de contact vor fi asociate automat.
            </p>
          </div>
        )}

        {/* Înlocuim componenta EquipmentSelect cu CustomEquipmentSelect */}
        <div className="space-y-2">
          <label htmlFor="echipament" className="text-sm font-medium">
            Echipament
          </label>
          <CustomEquipmentSelect
            equipments={availableEquipments}
            value={formData.echipamentId}
            onSelect={handleEquipmentSelect}
            disabled={!formData.locatie}
            placeholder={formData.locatie ? "Selectați echipamentul" : "Selectați mai întâi o locație"}
            emptyMessage={
              formData.locatie ? "Nu există echipamente pentru această locație" : "Selectați mai întâi o locație"
            }
          />
          {availableEquipments.length === 0 && formData.locatie && equipmentsLoaded && (
            <div>
              <p className="text-xs text-amber-600">
                Nu există echipamente definite pentru această locație. Puteți adăuga echipamente din secțiunea de
                gestionare a clientului.
              </p>
              <p className="text-xs text-gray-500 mt-1">Locație selectată: {formData.locatie}</p>
            </div>
          )}
          {availableEquipments.length > 0 && (
            <p className="text-xs text-green-600">
              {availableEquipments.length} echipamente disponibile pentru această locație
            </p>
          )}
        </div>

        {/* Secțiunea de persoane de contact - afișată ca card informativ */}
        {showContactAccordion && (
          <Card className="p-4 border rounded-md">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-blue-600" />
              <h3 className="text-md font-medium">Persoane de Contact Asociate</h3>
              <Badge variant="outline" className="ml-2">
                {persoaneContact.length}
              </Badge>
            </div>

            {persoaneContact.length > 0 ? (
              <div className="space-y-4">
                {persoaneContact.map((contact, index) => (
                  <div key={index} className="p-3 border rounded-md space-y-2 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <h5 className="text-sm font-medium">{contact.nume}</h5>
                      {contact.functie && (
                        <Badge variant="secondary" className="text-xs">
                          {contact.functie}
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>{contact.telefon || "Fără telefon"}</span>
                      </div>

                      {contact.email && (
                        <div className="flex items-center text-sm">
                          <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span>{contact.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                Nu există persoane de contact pentru această locație
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Toate persoanele de contact vor fi asociate automat cu această lucrare
            </p>
          </Card>
        )}

        {/* Add the defectReclamat field to the form, after the equipment field */}
        <div className="space-y-2">
          <label htmlFor="defectReclamat" className="text-sm font-medium">
            Defect reclamat
          </label>
          <Textarea
            id="defectReclamat"
            placeholder="Introduceți defectul reclamat de client"
            value={formData.defectReclamat || ""}
            onChange={handleInputChange}
            className="min-h-[80px] resize-y"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="descriere" className="text-sm font-medium">
            Descriere Intervenție
          </label>
          <Textarea
            id="descriere"
            placeholder="Descrieți intervenția"
            value={formData.descriere}
            onChange={handleInputChange}
            className="min-h-[100px] resize-y"
          />
        </div>

        {isEdit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="statusLucrare" className="text-sm font-medium">
                Status Lucrare
              </label>
              <Select
                value={formData.statusLucrare}
                onValueChange={(value) => handleSelectChange("statusLucrare", value)}
              >
                <SelectTrigger id="statusLucrare">
                  <SelectValue placeholder="Selectați statusul" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="În așteptare">În așteptare</SelectItem>
                  <SelectItem value="În curs">În curs</SelectItem>
                  <SelectItem value="Finalizat">Finalizat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="statusFacturare" className="text-sm font-medium">
                Status Facturare
              </label>
              <Select
                value={formData.statusFacturare}
                onValueChange={(value) => handleSelectChange("statusFacturare", value)}
              >
                <SelectTrigger id="statusFacturare">
                  <SelectValue placeholder="Selectați statusul" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nefacturat">Nefacturat</SelectItem>
                  <SelectItem value="Facturat">Facturat</SelectItem>
                  <SelectItem value="Nu se facturează">Nu se facturează</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
      {formData.tipLucrare === "Intervenție în garanție" && formData.echipament && (
        <div className="mb-4">
          {!validateGarantie(formData.echipament) ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Atenție</AlertTitle>
              <AlertDescription>
                Garanția pentru acest echipament a expirat (depășește 24 de luni de la instalare).
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertTitle>Informație</AlertTitle>
              <AlertDescription>
                Echipamentul este în perioada de garanție.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {(onSubmit || onCancel) && (
        <div className="flex justify-end space-x-2 mt-6">
          {onCancel && (
            // Înlocuiți butonul de anulare cu:
            <Button variant="outline" onClick={handleFormCancel}>
              Anulează
            </Button>
          )}
          {onSubmit && <Button onClick={handleSubmit}>Salvează</Button>}
        </div>
      )}

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        open={showDialog}
        onConfirm={pendingUrl === "#cancel" ? confirmCancelAction : confirmNavigation}
        onCancel={cancelNavigation}
      />
      {/* Adăugați dialogul la sfârșitul componentei, înainte de ultimul </div>: */}
      <NavigationPromptDialog open={showPrompt} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}

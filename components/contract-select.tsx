"use client"

import { useState, useEffect, useRef } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { validateContractAssignment } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

// Modificăm interfața pentru a include proprietatea type
interface ContractSelectProps {
  value: string
  onChange: (value: string, number?: string, type?: string) => void
  hasError?: boolean
  errorStyle?: string
  // Dacă este setat, listează doar contractele asignate acestui client
  clientIdFilter?: string
}

export function ContractSelect({ value, onChange, hasError = false, errorStyle = "", clientIdFilter }: ContractSelectProps) {
  const [contracts, setContracts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSelectDialogOpen, setIsSelectDialogOpen] = useState(false) // Dialog pentru selecția contractelor
  const [newContractName, setNewContractName] = useState("")
  const [newContractNumber, setNewContractNumber] = useState("")
  const [newContractType, setNewContractType] = useState("Abonament") // Adăugăm starea pentru tipul contractului
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("") // Adăugăm starea pentru căutare
  const searchInputRef = useRef<HTMLInputElement>(null) // Referință pentru input

  // Add close confirmation states
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [initialFormState, setInitialFormState] = useState({
    name: "",
    number: "",
    type: "Abonament"
  })

  // Încărcăm contractele din Firestore (reactiv la clientIdFilter)
  useEffect(() => {
    try {
      setLoading(true)
      let contractsQuery
      if (clientIdFilter) {
        // Când avem un client selectat, aducem DOAR contractele asignate acelui client
        contractsQuery = query(collection(db, "contracts"), where("clientId", "==", clientIdFilter))
      } else {
        // Altfel aducem toate contractele (folosit când nu e selectat clientul)
        contractsQuery = query(collection(db, "contracts"), orderBy("name", "asc"))
      }

      const unsubscribe = onSnapshot(
        contractsQuery,
        (snapshot) => {
          const contractsData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          setContracts(contractsData)
          setLoading(false)
        },
        (error) => {
          console.error("Eroare la încărcarea contractelor:", error)
          setLoading(false)
        },
      )

      return () => unsubscribe()
    } catch (error) {
      console.error("Eroare la încărcarea contractelor:", error)
      setLoading(false)
    }
  }, [clientIdFilter])

  // Dacă avem clientIdFilter, limităm lista doar la contractele asignate acelui client
  const contractsForClient = clientIdFilter
    ? contracts.filter((c) => c.clientId === clientIdFilter)
    : contracts

  // Filtrăm contractele pe baza termenului de căutare peste lista deja filtrată după client
  const filteredContracts = contractsForClient.filter((contract) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      contract.name.toLowerCase().includes(searchLower) ||
      contract.number.toLowerCase().includes(searchLower) ||
      (contract.type && contract.type.toLowerCase().includes(searchLower))
    )
  })

  // Găsim contractul selectat pentru afișare
  const selectedContract = contracts.find((contract) => contract.id === value)

  // Funcție pentru deschiderea dialogului de selecție
  const handleOpenSelectDialog = () => {
    setIsSelectDialogOpen(true)
    setSearchTerm("") // Resetăm căutarea
  }

  // Funcție pentru selectarea unui contract din dialog
  const handleSelectContract = (contractId: string) => {
    const selectedContract = contracts.find((contract) => contract.id === contractId)
    onChange(contractId, selectedContract?.number, selectedContract?.type)
    setIsSelectDialogOpen(false)
    setSearchTerm("") // Resetăm căutarea
  }

  // Funcție pentru adăugarea unui contract nou
  const handleAddContract = async () => {
    if (!newContractName || !newContractNumber || !newContractType) return

    try {
      setIsSubmitting(true)

      // Validăm contractul înainte de adăugare (fără client pentru că este neasignat)
      const validation = await validateContractAssignment(newContractNumber, "")
      
      if (!validation.isValid) {
        toast({
          title: "Eroare",
          description: validation.error,
          variant: "destructive",
        })
        setIsSubmitting(false)
        return
      }

      // Adăugăm contractul în Firestore
      const contractData: any = {
        name: newContractName,
        number: newContractNumber,
        type: newContractType, // Adăugăm tipul contractului
        createdAt: serverTimestamp(),
      }
      
      // Nu setăm clientId pentru contracte create din ContractSelect - rămân neasignate
      // Acest lucru asigură consistența cu sistemul de asignare din pagina de contracte
      
      await addDoc(collection(db, "contracts"), contractData)

      toast({
        title: "Contract adăugat",
        description: "Contractul a fost adăugat cu succes",
      })

      // Resetăm formularul și închidem dialogul
      setNewContractName("")
      setNewContractNumber("")
      setNewContractType("Abonament")
      setIsAddDialogOpen(false)
    } catch (error) {
      console.error("Eroare la adăugarea contractului:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut adăuga contractul",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Function to check if form has unsaved changes
  const hasUnsavedChanges = () => {
    return newContractName.trim() !== "" || 
           newContractNumber.trim() !== "" || 
           newContractType !== "Abonament"
  }

  // Handle dialog close attempt
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      handleDialogClose()
    }
  }

  // Actually close the dialog
  const handleDialogClose = () => {
    setIsAddDialogOpen(false)
    setNewContractName("")
    setNewContractNumber("")
    setNewContractType("Abonament")
  }

  // Confirm close with unsaved changes
  const confirmClose = () => {
    setShowCloseAlert(false)
    handleDialogClose()
  }

  // Cancel close
  const cancelClose = () => {
    setShowCloseAlert(false)
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleOpenSelectDialog}
        className={`flex-1 justify-between ${hasError ? errorStyle : ""}`}
        disabled={loading}
      >
        <span className="truncate text-left">
          {loading 
            ? "Se încarcă..." 
            : selectedContract 
              ? `${selectedContract.name} (${selectedContract.number})` 
              : "Selectați contractul"
          }
        </span>
        <Search className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
      </Button>
      {/* Butonul de adăugare rămâne disponibil doar când nu filtrăm după client,
          pentru a evita confuzia (contractele noi sunt neasignate și nu vor apărea în listă) */}
      {!clientIdFilter && (
        <Button variant="outline" size="icon" onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      )}

      {/* Dialog pentru selecția contractelor */}
      <Dialog open={isSelectDialogOpen} onOpenChange={setIsSelectDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Selectați Contractul</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            {/* Input de căutare */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Căutați contract după nume, număr sau tip..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 h-11"
                autoFocus
              />
              {searchTerm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Lista de contracte */}
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Se încarcă contractele...</span>
                </div>
              ) : filteredContracts.length > 0 ? (
                <div className="divide-y">
                  {filteredContracts.map((contract) => (
                    <div
                      key={contract.id}
                      className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                        value === contract.id ? "bg-muted" : ""
                      }`}
                      onClick={() => handleSelectContract(contract.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">
                            {contract.name}
                          </h4>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span>Număr: {contract.number}</span>
                            <span>Tip: {contract.type || "Nespecificat"}</span>
                          </div>
                        </div>
                        {value === contract.id && (
                          <div className="flex items-center text-primary">
                            <span className="text-xs mr-1">Selectat</span>
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : contractsForClient.length > 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nu s-au găsit contracte pentru "{searchTerm}"</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSearchTerm("")}
                  >
                    Șterge căutarea
                  </Button>
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  {clientIdFilter ? (
                    <p>Nu există contracte asignate acestui client</p>
                  ) : (
                    <>
                      <p>Nu există contracte disponibile</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          setIsSelectDialogOpen(false)
                          setIsAddDialogOpen(true)
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adaugă primul contract
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

       
        </DialogContent>
      </Dialog>

      {/* Dialog pentru adăugarea unui contract nou */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseAttempt()
        } else {
          setIsAddDialogOpen(open)
        }
      }}>
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCloseAttempt}>
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
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close confirmation alert */}
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={cancelClose} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClose} 
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              Da, închide formularul
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

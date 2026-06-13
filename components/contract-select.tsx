"use client"

import { useState, useEffect, useRef } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, updateDoc, doc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { validateContractAssignment } from "@/lib/firebase/firestore"
import { toast } from "@/hooks/use-toast"
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
import { useTargetList } from "@/hooks/use-settings"
import { isContractSuspended } from "@/lib/contracts/contract-status"

// Modificăm interfața pentru a include proprietatea type
interface ContractSelectProps {
  value: string
  onChange: (value: string, number?: string, type?: string) => void
  hasError?: boolean
  errorStyle?: string
  // Dacă este setat, listează doar contractele asignate acestui client
  clientIdFilter?: string
  // Filtre suplimentare pentru locație/echipament
  locationIdFilter?: string
  locationNameFilter?: string
  equipmentIdFilter?: string
  equipmentCodeFilter?: string
  // Include doar contractele cu tipurile specificate (ex. "Abonament")
  includeTypes?: string[]
  // Exclude contractele cu anumite tipuri (ex. "La cerere")
  excludeTypes?: string[]
}

export function ContractSelect({
  value,
  onChange,
  hasError = false,
  errorStyle = "",
  clientIdFilter,
  locationIdFilter,
  locationNameFilter,
  equipmentIdFilter,
  equipmentCodeFilter,
  includeTypes = [],
  excludeTypes = [],
}: ContractSelectProps) {
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
  // Tipuri contract dinamice (din setări)
  const { items: contractTypeOptions } = useTargetList("contracts.create.types")

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

  const resolveContractType = (contract: any): string | undefined => {
    const cf = (contract as any)?.customFields || {}
    const direct =
      contract.type ||
      (contract as any)?.contractType ||
      cf.contractType ||
      cf.type ||
      cf.tipContract ||
      cf.tip ||
      cf["Tip contract"] ||
      cf["tip contract"]
    if (direct) return direct
    // fallback: first string value from customFields
    const firstString = Object.values(cf).find((v) => typeof v === "string" && v.trim().length > 0)
    if (typeof firstString === "string") return firstString
    return undefined
  }

  const normalizedIncluded = includeTypes.map((t) => t.toLowerCase().trim()).filter(Boolean)
  const normalizedExcluded = excludeTypes.map((t) => t.toLowerCase().trim()).filter(Boolean)

  const normalize = (value?: string) => String(value || "").trim()

  // Filtrăm tipurile (include/exclude)
  const allowedContracts = contractsForClient.filter((c) => {
    if (isContractSuspended(c)) return false
    const t =
      ((resolveContractType(c) || c.type || "") as string).toString().trim().toLowerCase()
    if (normalizedIncluded.length > 0 && !normalizedIncluded.includes(t)) return false
    return !normalizedExcluded.includes(t)
  })

  const filteredByAssignment = allowedContracts.filter((contract) => {
    // Location matching:
    // - prefer ID match when both have IDs
    // - fallback to name match when contract doesn't have locationId (backward compatibility)
    const targetLocationId = normalize(locationIdFilter)
    const targetLocationName = normalize(locationNameFilter)
    const contractLocationId = normalize(contract.locationId)
    const contractLocationName = normalize(contract.locationName)
    const contractLocationNames = Array.isArray(contract.locationNames)
      ? contract.locationNames.map((l: any) => normalize(l))
      : []

    let locationMatch = true
    if (targetLocationId) {
      // Accept match by id OR by name (contracts saved with location name in locationId)
      locationMatch =
        (Boolean(contractLocationId) && contractLocationId === targetLocationId) ||
        (Boolean(targetLocationName) &&
          (contractLocationName === targetLocationName || contractLocationNames.includes(targetLocationName)))
    } else if (targetLocationName) {
      locationMatch = contractLocationName === targetLocationName || contractLocationNames.includes(targetLocationName)
    }

    // Equipment matching:
    // contract.equipmentIds may contain either equipmentId OR equipmentCode, depending on older/newer data
    const equipmentIdTarget = normalize(equipmentIdFilter)
    const equipmentCodeTarget = normalize(equipmentCodeFilter)
    const ids = Array.isArray(contract.equipmentIds) ? contract.equipmentIds.map((id: any) => normalize(id)) : []
    const hasEquipmentFilter = Boolean(equipmentIdTarget || equipmentCodeTarget)
    let equipmentMatch = true
    if (hasEquipmentFilter) {
      equipmentMatch =
        (equipmentIdTarget ? ids.includes(equipmentIdTarget) : false) ||
        (equipmentCodeTarget ? ids.includes(equipmentCodeTarget) : false)
    } else if (includeTypes.length > 0) {
      // For "Intervenție în contract", we require an equipment selection
      equipmentMatch = false
    }

    return locationMatch && equipmentMatch
  })

  // Filtrăm contractele pe baza termenului de căutare peste lista deja filtrată după client
  const filteredContracts = filteredByAssignment.filter((contract) => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      contract.name.toLowerCase().includes(searchLower) ||
      contract.number.toLowerCase().includes(searchLower) ||
      (contract.type && contract.type.toLowerCase().includes(searchLower)) ||
      (resolveContractType(contract)?.toLowerCase().includes(searchLower))
    )
  })

  useEffect(() => {
    // Debug: ajută să vedem de ce nu apar contractele în selecție
    console.log("[ContractSelect] filters", {
      clientIdFilter,
      locationIdFilter,
      locationNameFilter,
      equipmentIdFilter,
      equipmentCodeFilter,
      includeTypes,
      excludeTypes,
      equipmentRequired: includeTypes.length > 0,
      totalContracts: contracts.length,
      contractsForClient: contractsForClient.length,
      allowedContracts: allowedContracts.length,
      filteredByAssignment: filteredByAssignment.length,
      filteredContracts: filteredContracts.length,
    })
  }, [
    clientIdFilter,
    locationIdFilter,
    locationNameFilter,
    equipmentIdFilter,
    equipmentCodeFilter,
    includeTypes,
    excludeTypes,
    contracts.length,
    contractsForClient.length,
    allowedContracts.length,
    filteredByAssignment.length,
    filteredContracts.length,
  ])

  // Găsim contractul selectat pentru afișare (doar dacă nu este exclus)
  const selectedContract = filteredByAssignment.find((contract) => contract.id === value)

  useEffect(() => {
    if (!value || loading) return
    const currentContract = contracts.find((contract) => contract.id === value)
    if (currentContract && isContractSuspended(currentContract)) {
      onChange("", "", "")
      toast({
        title: "Contract suspendat",
        description: "Contractul selectat a fost suspendat și nu mai poate fi folosit pentru tichete noi.",
        variant: "destructive",
      })
    }
  }, [contracts, loading, onChange, value])

  // Funcție pentru deschiderea dialogului de selecție
  const handleOpenSelectDialog = () => {
    setIsSelectDialogOpen(true)
    setSearchTerm("") // Resetăm căutarea
  }

  // Funcție pentru selectarea unui contract din dialog
  const handleSelectContract = (contractId: string) => {
    const selectedContract = filteredByAssignment.find((contract) => contract.id === contractId)
    if (!selectedContract) {
      toast({
        title: "Contract indisponibil",
        description: "Acest contract nu poate fi selectat pentru acest tip de tichet.",
        variant: "destructive",
      })
      return
    }
    const resolvedType = resolveContractType(selectedContract)
    const typeNormalized = (resolvedType || selectedContract.type || "").toString().trim().toLowerCase()
    if (normalizedExcluded.includes(typeNormalized)) {
      toast({
        title: "Contract indisponibil",
        description: `Contractele de tip "${resolvedType || selectedContract.type}" nu pot fi selectate pentru această tichet.`,
        variant: "destructive",
      })
      return
    }
    onChange(contractId, selectedContract?.number, resolveContractType(selectedContract))
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
        status: "active",
        createdAt: serverTimestamp(),
      }
      
      // Nu setăm clientId pentru contracte create din ContractSelect - rămân neasignate
      // Acest lucru asigură consistența cu sistemul de asignare din pagina de contracte
      
      const docRef = await addDoc(collection(db, "contracts"), contractData)
      // Backward compatible: persistăm și câmpul `id` în document (egal cu doc id)
      try {
        await updateDoc(doc(db, "contracts", docRef.id), { id: docRef.id } as any)
      } catch {}

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
              ? `${selectedContract.name} (${selectedContract.number})${resolveContractType(selectedContract) ? ` · ${resolveContractType(selectedContract)}` : ""}` 
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
                            <span>Tip: {resolveContractType(contract) || "Nespecificat"}</span>
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
              ) : allowedContracts.length > 0 ? (
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
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-[400px]"
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            handleCloseAttempt()
          }}
          onInteractOutside={(e) => {
            e.preventDefault()
            handleCloseAttempt()
          }}
        >
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
                  {contractTypeOptions?.length ? (
                    contractTypeOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.name}>
                        {opt.name}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="Abonament">Abonament</SelectItem>
                      <SelectItem value="Cu plată la intervenție">Cu plată la intervenție</SelectItem>
                    </>
                  )}
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

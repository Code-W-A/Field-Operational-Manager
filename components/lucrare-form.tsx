"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, Loader2, Plus, Phone, Mail, Users } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { orderBy, where, query, collection, onSnapshot } from "firebase/firestore"
import type { Client, PersoanaContact, Locatie } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"
// Importăm componenta ContractSelect
import { ContractSelect } from "./contract-select"
// Importăm componenta ClientForm
import { ClientForm } from "./client-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDateTime24, formatTime24 } from "@/lib/utils/time-format"
// Import the TimeSelector component
import { TimeSelector } from "./time-selector"
// Import our new CustomDatePicker component
import { CustomDatePicker } from "./custom-date-picker"
import { Card } from "@/components/ui/card"

// Define the Lucrare type
interface Lucrare {
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  tehnicieni: string[]
  client: string
  locatie: string
  descriere: string
  persoanaContact: string
  telefon: string
  statusLucrare: string
  statusFacturare: string
  contract?: string
  contractNumber?: string
  defectReclamat?: string
  persoaneContact?: PersoanaContact[]
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
    descriere: string
    persoanaContact: string
    telefon: string
    statusLucrare: string
    statusFacturare: string
    contract?: string
    contractNumber?: string
    defectReclamat?: string
    persoaneContact?: PersoanaContact[]
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
  const { data: clienti, loading: loadingClienti } = useFirebaseCollection<Client>("clienti", [orderBy("nume", "asc")])

  // Încărcăm tehnicienii direct din Firestore
  useEffect(() => {
    const fetchTehnicieni = async () => {
      try {
        setLoadingTehnicieni(true)
        const tehnicieniQuery = query(collection(db, "users"), where("role", "==", "tehnician"))

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
          }
          setLocatii([defaultLocatie])
        }

        // Resetăm locația selectată când se schimbă clientul
        setSelectedLocatie(null)
        setPersoaneContact([])
        setShowContactAccordion(false)
      }
    }
  }, [formData, formData?.client, clienti])

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

      // Activăm afișarea acordeonului
      setShowContactAccordion(true)

      // Actualizăm câmpul locație în formData
      handleSelectChange("locatie", locatieNume)
    }
  }

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

    const updatedData: Partial<Lucrare> = {
      dataEmiterii: dataEmiterii ? formatDateTime24(dataEmiterii) : "",
      dataInterventie: dataInterventie ? formatDateTime24(dataInterventie) : "",
      tipLucrare: formData.tipLucrare,
      tehnicieni: formData.tehnicieni,
      client: formData.client,
      locatie: formData.locatie,
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
    }

    await onSubmit(updatedData)
  }

  // Add buttons at the end if onSubmit and onCancel are provided
  // Adăugăm un efect pentru a actualiza persoanele de contact când se schimbă locația selectată
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
      } else {
        console.log("Nu există persoane de contact (effect)")
        setPersoaneContact([])

        // Clear the contacts array
        if (handleCustomChange) {
          handleCustomChange("persoaneContact", [])
        }
      }
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
      }
    }

    // If we have initial data with persoaneContact, use that
    if (initialData && initialData.persoaneContact && initialData.persoaneContact.length > 0) {
      setPersoaneContact(initialData.persoaneContact)
      setShowContactAccordion(true)
    }
  }, [initialData, locatii, handleCustomChange])

  return (
    <div className="modal-calendar-container">
      {error && <div className="text-red-500 mb-4">{error}</div>}
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-1 gap-6">
          {/* Data Emiterii - Updated with new date picker */}
          <div className="space-y-2">
            <label htmlFor="dataEmiterii" className="text-sm font-medium">
              Data Emiterii *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="sm:w-2/3">
                <Popover open={dateEmiteriiOpen} onOpenChange={setDateEmiteriiOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={`w-full justify-start text-left font-normal ${hasError("dataEmiterii") ? errorStyle : ""}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataEmiterii ? format(dataEmiterii, "dd.MM.yyyy", { locale: ro }) : <span>Selectați data</span>}
                    </Button>
                  </PopoverTrigger>

                  <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
                    <CustomDatePicker
                      selectedDate={dataEmiterii}
                      onDateChange={handleDateEmiteriiSelect}
                      onClose={() => setDateEmiteriiOpen(false)}
                      hasError={hasError("dataEmiterii")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative sm:w-1/3">
                <TimeSelector
                  value={timeEmiterii}
                  onChange={handleTimeEmiteriiChange}
                  label="Ora emiterii"
                  id="timeEmiterii"
                  hasError={hasError("dataEmiterii")}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Data și ora emiterii documentului</p>
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
                      className={`w-full justify-start text-left font-normal ${hasError("dataInterventie") ? errorStyle : ""}`}
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
                <SelectItem value="Intervenție contra cost">Intervenție contra cost</SelectItem>
                <SelectItem value="Pregătire în atelier">Pregătire în atelier</SelectItem>
                <SelectItem value="Instalare">Instalare</SelectItem>
                <SelectItem value="Intervenție în contract">Intervenție în contract</SelectItem>
                <SelectItem value="Re-Intervenție">Re-Intervenție</SelectItem>
                <SelectItem value="Intervenție garanție">Intervenție garanție</SelectItem>
                <SelectItem value="Predare lucrare">Predare lucrare</SelectItem>
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

        <div className="space-y-2">
          <label htmlFor="client" className="text-sm font-medium">
            Client *
          </label>
          <div className="flex gap-2">
            <Select value={formData.client} onValueChange={(value) => handleSelectChange("client", value)}>
              <SelectTrigger id="client" className={`flex-1 ${hasError("client") ? errorStyle : ""}`}>
                <SelectValue placeholder={loadingClienti ? "Se încarcă..." : "Selectați clientul"} />
              </SelectTrigger>
              <SelectContent>
                {clienti.map((client) => (
                  <SelectItem key={client.id} value={client.nume}>
                    {client.nume}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => setIsAddClientDialogOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
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

        {/* Câmpul pentru echipament */}
        <div className="space-y-2">
          <label htmlFor="locatie" className="text-sm font-medium">
            Echipament
          </label>
          <Input
            id="locatie"
            placeholder="Introduceți echipamentul"
            value={formData.locatie}
            onChange={handleInputChange}
          />
        </div>

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

      {(onSubmit || onCancel) && (
        <div className="flex justify-end space-x-2 mt-6">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Anulează
            </Button>
          )}
          {onSubmit && <Button onClick={handleSubmit}>Salvează</Button>}
        </div>
      )}
    </div>
  )
}

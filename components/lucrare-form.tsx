"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, Loader2, Clock } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { orderBy, where, query, collection, onSnapshot } from "firebase/firestore"
import type { Client, PersoanaContact } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"
// Importăm componenta ContractSelect
import { ContractSelect } from "./contract-select"

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
    defectReclamat?: string // Add this field
  }
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleSelectChange: (id: string, value: string) => void
  handleTehnicieniChange: (value: string) => void
  fieldErrors?: string[]
}

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
  fieldErrors = [],
}: LucrareFormProps) {
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)
  const [tehnicieni, setTehnicieni] = useState<any[]>([])
  const [loadingTehnicieni, setLoadingTehnicieni] = useState(true)
  const [timeEmiterii, setTimeEmiterii] = useState<string>(
    dataEmiterii ? format(dataEmiterii, "HH:mm") : format(new Date(), "HH:mm"),
  )
  const [timeInterventie, setTimeInterventie] = useState<string>(
    dataInterventie ? format(dataInterventie, "HH:mm") : format(new Date(), "HH:mm"),
  )

  // Adăugăm state pentru persoanele de contact ale clientului selectat
  const [persoaneContact, setPersoaneContact] = useState<PersoanaContact[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Actualizăm ora când se schimbă data emiterii
  useEffect(() => {
    if (dataEmiterii) {
      // Păstrăm ora curentă dacă data se schimbă
      const currentTime = timeEmiterii || format(new Date(), "HH:mm")
      setTimeEmiterii(currentTime)
    }
  }, [dataEmiterii])

  // Actualizăm ora când se schimbă data intervenției
  useEffect(() => {
    if (dataInterventie) {
      // Păstrăm ora curentă dacă data se schimbă
      const currentTime = timeInterventie || format(new Date(), "HH:mm")
      setTimeInterventie(currentTime)
    }
  }, [dataInterventie])

  // Actualizăm data completă când se schimbă ora emiterii
  const handleTimeEmiteriiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value
    setTimeEmiterii(newTime)

    if (dataEmiterii) {
      // Creăm o nouă dată cu ora actualizată
      const [hours, minutes] = newTime.split(":").map(Number)
      const newDate = new Date(dataEmiterii)
      newDate.setHours(hours, minutes)
      setDataEmiterii(newDate)
    }
  }

  // Actualizăm data completă când se schimbă ora intervenției
  const handleTimeInterventieChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value
    setTimeInterventie(newTime)

    if (dataInterventie) {
      // Creăm o nouă dată cu ora actualizată
      const [hours, minutes] = newTime.split(":").map(Number)
      const newDate = new Date(dataInterventie)
      newDate.setHours(hours, minutes)
      setDataInterventie(newDate)
    }
  }

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

  // Actualizăm persoanele de contact când se schimbă clientul selectat
  useEffect(() => {
    // Make sure formData, formData.client, and clienti are all defined
    if (formData && formData.client && clienti && clienti.length > 0) {
      const client = clienti.find((c) => c.nume === formData.client)
      if (client) {
        setSelectedClient(client)
        if (client.persoaneContact && client.persoaneContact.length > 0) {
          setPersoaneContact(client.persoaneContact)
        } else {
          // Dacă clientul nu are persoane de contact, adăugăm persoana de contact principală
          setPersoaneContact([
            {
              nume: client.persoanaContact || "",
              telefon: client.telefon || "",
              email: client.email || "",
              functie: "",
            },
          ])
        }
      }
    }
  }, [formData, formData?.client, clienti])

  // Modificăm funcția handleClientAdded pentru a gestiona corect adăugarea clientului
  const handleClientAdded = (clientName: string) => {
    handleSelectChange("client", clientName)
    setIsAddClientDialogOpen(false)
  }

  // Actualizăm funcția handleContactSelect pentru a ne asigura că populează corect numărul de telefon
  const handleContactSelect = (contact: PersoanaContact) => {
    handleSelectChange("persoanaContact", contact.nume)
    if (contact.telefon) {
      handleSelectChange("telefon", contact.telefon)
    }
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-1 gap-6">
        {/* Data Emiterii */}
        <div className="space-y-2">
          <label htmlFor="dataEmiterii" className="text-sm font-medium">
            Data Emiterii *
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-2/3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${hasError("dataEmiterii") ? errorStyle : ""}`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataEmiterii ? format(dataEmiterii, "dd.MM.yyyy", { locale: ro }) : <span>Selectați data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dataEmiterii} onSelect={setDataEmiterii} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="relative sm:w-1/3">
              <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                type="time"
                value={timeEmiterii}
                onChange={handleTimeEmiteriiChange}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="pl-10"
                aria-label="Ora emiterii"
                step="60"
                lang="ro"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Data și ora emiterii documentului</p>
        </div>

        {/* Data Solicitată Intervenție */}
        <div className="space-y-2">
          <label htmlFor="dataInterventie" className="text-sm font-medium">
            Data solicitată intervenție *
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-2/3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
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
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dataInterventie} onSelect={setDataInterventie} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="relative sm:w-1/3">
              <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input
                type="time"
                value={timeInterventie}
                onChange={handleTimeInterventieChange}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="pl-10"
                aria-label="Ora intervenției"
                step="60"
                lang="ro"
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
              onChange={(value) => handleSelectChange("contract", value)}
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
      {/* Insert this code after the equipment field and before the descriere field: */}
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
  )
}

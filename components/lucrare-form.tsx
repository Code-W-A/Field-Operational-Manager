"use client"

import type React from "react"
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, Loader2, Plus, Phone, Mail, Users, LightbulbIcon } from "lucide-react"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { orderBy, where, query, collection, onSnapshot } from "firebase/firestore"
import type { Client, PersoanaContact, Locatie, Echipament } from "@/lib/firebase/firestore"
import { getClienti, getClientById } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"
// Importăm componenta ContractSelect
import { ContractSelect } from "./contract-select"
// Importăm componenta ClientForm
import { ClientForm } from "./client-form"
// Importăm componenta ClientEditForm pentru editarea locațiilor
import { ClientEditForm } from "./client-edit-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatDateTime24, formatTime24 } from "@/lib/utils/time-format"
// Import the TimeSelector component
import { TimeSelector } from "./time-selector"
// Import our new CustomDatePicker component
import { CustomDatePicker } from "./custom-date-picker"
import { Card } from "@/components/ui/card"
// Înlocuim importul pentru componenta EquipmentSelect cu CustomEquipmentSelect
import { CustomEquipmentSelect } from "@/components/custom-equipment-select"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"
// Adăugați aceste importuri la începutul fișierului
import { useNavigationPrompt } from "@/hooks/use-navigation-prompt"
import { NavigationPromptDialog } from "@/components/navigation-prompt-dialog"
import { useAuth } from "@/contexts/AuthContext"
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
import { INVOICE_STATUS_OPTIONS, WORK_TYPE_OPTIONS } from "@/lib/utils/constants"
import { getWorkStatusClass } from "@/lib/utils/status-classes"
// Adăugăm importurile pentru calcularea garanției
import { calculateWarranty, getWarrantyDisplayInfo, updateWorkOrderWarrantyInfo } from "@/lib/utils/warranty-calculator"

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

// În componenta LucrareForm, actualizăm interfața LucrareFormProps pentru a include contractType
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
    contractType?: string // Adăugăm tipul contractului
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
  setFieldErrors?: (errors: string[]) => void
  onSubmit?: (data: Partial<Lucrare>) => Promise<void>
  onCancel?: () => void
  initialData?: Lucrare | null
}

// Define a ref type for the form
export interface LucrareFormRef {
  hasUnsavedChanges: () => boolean
  confirmClose: () => void
}

// Add the following to the LucrareForm component
export const LucrareForm = forwardRef<LucrareFormRef, LucrareFormProps>(
  (
    {
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
      setFieldErrors,
      onSubmit,
      onCancel,
      initialData,
    },
    ref,
  ) => {
    const { userData } = useAuth()
    const userRole = userData?.role
    const isAdminOrDispatcher = userRole === "admin" || userRole === "dispecer"

    const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false)
    const [isEditClientDialogOpen, setIsEditClientDialogOpen] = useState(false)
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
    const [clientActiveIndex, setClientActiveIndex] = useState<number>(-1)
    const clientListRef = useRef<HTMLDivElement>(null)
    const [formModified, setFormModified] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showCloseAlert, setShowCloseAlert] = useState(false)
    const equipmentSelectRef = useRef<any>(null)

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

    // Adăugăm state pentru a urmări dacă am încercat să găsim echipamentul după nume
    const [triedFindByName, setTriedFindByName] = useState(false)

    // Adăugăm state pentru a urmări dacă am încercat să selectăm echipamentul
    const [triedSelectEquipment, setTriedSelectEquipment] = useState(false)

    // Adăugăm state pentru informațiile de garanție
    const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
    const [selectedEquipment, setSelectedEquipment] = useState<Echipament | null>(null)

    // State pentru editarea echipamentului din cardul de garanție
    const [isEditEquipmentDialogOpen, setIsEditEquipmentDialogOpen] = useState(false)
    const [equipmentToEdit, setEquipmentToEdit] = useState<{ equipment: Echipament; locationIndex: number; equipmentIndex: number } | null>(null)

    // Expose methods to parent component via ref
    useImperativeHandle(ref, () => ({
      hasUnsavedChanges: () => formModified,
      confirmClose: () => {
        if (onCancel) {
          onCancel()
        }
      },
    }))

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

    // Adăugăm efect pentru calcularea garanției când se schimbă tipul de lucrare
    useEffect(() => {
      // Calculăm garanția doar pentru "Intervenție în garanție" și când avem echipament selectat
      if (formData.tipLucrare === "Intervenție în garanție" && selectedEquipment) {
        const warranty = getWarrantyDisplayInfo(selectedEquipment)
        setWarrantyInfo(warranty)
        
        // Actualizăm informațiile de garanție în formData
        if (handleCustomChange) {
          handleCustomChange("garantieExpira", warranty.warrantyExpires)
          handleCustomChange("garantieZileRamase", warranty.daysRemaining)
        }
      } else if (formData.tipLucrare !== "Intervenție în garanție") {
        // Resetăm informațiile de garanție pentru alte tipuri de lucrări
        setWarrantyInfo(null)
        if (handleCustomChange) {
          handleCustomChange("garantieExpira", null)
          handleCustomChange("garantieZileRamase", null)
        }
      }
    }, [formData.tipLucrare, selectedEquipment, handleCustomChange])

    // Obținem clienții din Firestore
    const {
      data: clienti,
      loading: loadingClienti,
      error: clientiError,
    } = useFirebaseCollection<Client>("clienti", [orderBy("nume", "asc")])

    // Actualizăm lista filtrată de clienți când se schimbă termenul de căutare sau lista de clienți
    useEffect(() => {
      if (clienti && clienti.length > 0) {
        if (clientSearchTerm.trim() === "") {
          setFilteredClients(clienti)
        } else {
          const searchTermLower = clientSearchTerm.toLowerCase()
          const normalized = (s?: string) => String(s || "").toLowerCase()
          const filtered = clienti.filter((client) => {
            // match pe nume client
            if (normalized(client.nume).includes(searchTermLower)) return true
            // match pe locații (nume/adresă)
            const locs = Array.isArray(client.locatii) ? client.locatii : []
            return locs.some((loc: any) => normalized(loc?.nume).includes(searchTermLower) || normalized(loc?.adresa).includes(searchTermLower))
          })
          setFilteredClients(filtered)
        }
      } else {
        setFilteredClients([])
      }
      // Resetăm indexul activ când se modifică lista sau termenul de căutare
      setClientActiveIndex(-1)
    }, [clientSearchTerm, clienti])

    // Scroll către elementul activ din listă pentru vizibilitate
    useEffect(() => {
      if (clientActiveIndex < 0) return
      const container = clientListRef.current
      if (!container) return
      const el = container.querySelector(`[data-index="${clientActiveIndex}"]`) as HTMLElement | null
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
    }, [clientActiveIndex])

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

      // Resetăm câmpurile dependente doar dacă clientul s-a schimbă
      if (selectedClient?.id !== client.id) {
        handleSelectChange("locatie", "")
        handleSelectChange("echipament", "")
        handleSelectChange("persoanaContact", "")
        handleSelectChange("telefon", "")
        // Resetăm contractul selectat (pentru Intervenție în contract/Contractare)
        handleSelectChange("contract", "")
        handleSelectChange("contractNumber", "")
        handleSelectChange("contractType", "")

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
        setAvailableEquipments([...(selectedLocation.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
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
    // Înlocuim funcția handleEquipmentSelect existentă cu această versiune actualizată:
    const handleEquipmentSelect = (equipmentId: string, equipment: Echipament) => {
      console.log("Echipament selectat în LucrareForm:", equipment)

      // Actualizăm toate câmpurile relevante
      handleSelectChange("echipament", equipment.nume)

      if (handleCustomChange) {
        handleCustomChange("echipamentId", equipmentId)
        handleCustomChange("echipamentCod", equipment.cod)
        // Adăugăm și modelul echipamentului dacă există
        if (equipment.model) {
          handleCustomChange("echipamentModel", equipment.model)
        }
      }

      // Setăm echipamentul selectat și calculăm garanția
      setSelectedEquipment(equipment)
      
      // Calculăm informațiile de garanție pentru echipamentul selectat
      if (formData.tipLucrare === "Intervenție în garanție") {
        const warranty = getWarrantyDisplayInfo(equipment)
        setWarrantyInfo(warranty)
        
        // Actualizăm informațiile de garanție în formData dacă există handleCustomChange
        if (handleCustomChange) {
          handleCustomChange("garantieExpira", warranty.warrantyExpires)
          handleCustomChange("garantieZileRamase", warranty.daysRemaining)
        }
      }

      // Afișăm un toast pentru feedback
      toast({
        title: "Echipament selectat",
        description: `Ați selectat echipamentul ${equipment.nume} (cod: ${equipment.cod})`,
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
            setLocatii([...client.locatii].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
          } else {
            // Dacă clientul nu are locații, creăm una implicită cu persoanele de contact existente
            const defaultLocatie: Locatie = {
              nume: "Sediu principal",
              adresa: client.adresa || "",
              persoaneContact:
                client.persoaneContact && client.persoaneContact.length > 0
                  ? client.persoaneContact
                  : [{ nume: (client as any).persoanaContact || "", telefon: (client as any).telefon || "", email: "", functie: "" }],
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

    // Adăugăm un efect special pentru a gestiona încărcarea inițială a locației și echipamentelor
    useEffect(() => {
      // Verificăm dacă avem date inițiale și client selectat
      if (initialData && selectedClient && formData.locatie) {
        console.log("Încărcare inițială a locației și echipamentelor", {
          initialData,
          selectedClient,
          formDataLocatie: formData.locatie,
          formDataEchipamentId: formData.echipamentId,
          formDataEchipament: formData.echipament,
        })

        // Găsim locația selectată în client
        const locatie = selectedClient.locatii?.find((loc) => loc.nume === formData.locatie)

        if (locatie) {
          console.log("Locație găsită în client:", locatie)
          setSelectedLocatie(locatie)

          // Setăm persoanele de contact
          if (locatie.persoaneContact) {
            setPersoaneContact([...(locatie.persoaneContact || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))

            // Actualizăm persoanele de contact în formData dacă nu există deja
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", locatie.persoaneContact)
            }
          }

          // Activăm afișarea acordeonului
          setShowContactAccordion(true)

          // Încărcăm echipamentele pentru locația selectată
          if (locatie.echipamente && locatie.echipamente.length > 0) {
            console.log("Echipamente găsite pentru locație:", locatie.echipamente)
            setAvailableEquipments([...(locatie.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
            setEquipmentsLoaded(true)

            // Verificăm dacă există un echipament selectat în datele inițiale
            if (formData.echipamentId) {
              console.log("Căutăm echipamentul cu ID:", formData.echipamentId)
              const selectedEquipment = locatie.echipamente.find((e) => e.id === formData.echipamentId)

              if (selectedEquipment) {
                console.log("Echipament găsit în locație după ID:", selectedEquipment)
              } else {
                console.log("Echipamentul cu ID", formData.echipamentId, "nu a fost găsit în locația", formData.locatie)

                // Dacă nu am găsit echipamentul după ID, dar avem numele echipamentului, încercăm să-l găsim după nume
                if (formData.echipament && !triedFindByName) {
                  console.log("Încercăm să găsim echipamentul după nume:", formData.echipament)
                  const equipmentByName = locatie.echipamente.find((e) => e.nume === formData.echipament)

                  if (equipmentByName) {
                    console.log("Echipament găsit în locație după nume:", equipmentByName)

                    // Actualizăm ID-ul echipamentului în formData
                    if (handleCustomChange) {
                      handleCustomChange("echipamentId", equipmentByName.id)
                      handleCustomChange("echipamentCod", equipmentByName.cod)
                    }

                    setTriedFindByName(true)
                  } else {
                    console.log(
                      "Echipamentul cu numele",
                      formData.echipament,
                      "nu a fost găsit în locația",
                      formData.locatie,
                    )
                  }
                }
              }
            } else if (formData.echipament && !triedFindByName) {
              // Dacă nu avem ID, dar avem numele echipamentului, încercăm să-l găsim după nume
              console.log("Nu avem ID, încercăm să găsim echipamentul după nume:", formData.echipament)
              const equipmentByName = locatie.echipamente.find((e) => e.nume === formData.echipament)

              if (equipmentByName) {
                console.log("Echipament găsit în locație după nume:", equipmentByName)

                // Actualizăm ID-ul echipamentului în formData
                if (handleCustomChange) {
                  handleCustomChange("echipamentId", equipmentByName.id)
                  handleCustomChange("echipamentCod", equipmentByName.cod)
                }

                setTriedFindByName(true)
              } else {
                console.log(
                  "Echipamentul cu numele",
                  formData.echipament,
                  "nu a fost găsit în locația",
                  formData.locatie,
                )
              }
            }
          } else {
            console.log("Nu există echipamente pentru locația", formData.locatie)
            setAvailableEquipments([])
            setEquipmentsLoaded(true)
          }
        } else {
          console.log("Locația", formData.locatie, "nu a fost găsită în clientul", selectedClient.nume)
        }
      }
    }, [
      initialData,
      selectedClient,
      formData.locatie,
      formData.echipamentId,
      formData.echipament,
      handleCustomChange,
      triedFindByName,
    ])

    // Adăugăm un efect special pentru a încerca să găsim echipamentul după nume când se încarcă datele inițiale
    useEffect(() => {
      // Verificăm dacă avem un nume de echipament, dar nu avem ID
      if (formData.echipament && !formData.echipamentId && availableEquipments.length > 0 && !triedFindByName) {
        console.log("Încercăm să găsim echipamentul după nume la încărcarea inițială:", formData.echipament)

        const equipmentByName = availableEquipments.find((e) => e.nume === formData.echipament)

        if (equipmentByName) {
          console.log("Echipament găsit după nume la încărcarea inițială:", equipmentByName)

          // Actualizăm ID-ul echipamentului în formData
          if (handleCustomChange) {
            handleCustomChange("echipamentId", equipmentByName.id)
            handleCustomChange("echipamentCod", equipmentByName.cod)

            // Afișăm un toast pentru feedback
            toast({
              title: "Echipament identificat",
              description: `Am identificat echipamentul "${equipmentByName.nume}" după nume`,
              variant: "default",
            })

            setTriedFindByName(true)
          }
        } else {
          console.log("Echipamentul cu numele", formData.echipament, "nu a fost găsit în lista disponibilă")
          setTriedFindByName(true)
        }
      }
    }, [formData.echipament, formData.echipamentId, availableEquipments, triedFindByName, handleCustomChange])

    // Adăugăm un nou efect pentru a forța selecția echipamentului după nume
    // Adăugăm acest efect după efectul care încarcă echipamentele:

    // Efect special pentru a forța selecția echipamentului după nume
    useEffect(() => {
      // Verificăm dacă avem echipamente disponibile și un nume de echipament
      if (availableEquipments.length > 0 && formData.echipament && isEdit) {
        console.log("Încercăm să forțăm selecția echipamentului după nume:", formData.echipament)

        // Căutăm echipamentul după nume exact
        let selectedEquipment = availableEquipments.find((e) => e.nume === formData.echipament)

        // Dacă nu găsim o potrivire exactă, încercăm o potrivire parțială (case insensitive)
        if (!selectedEquipment) {
          const equipmentNameLower = formData.echipament.toLowerCase()
          selectedEquipment = availableEquipments.find(
            (e) =>
              e.nume.toLowerCase().includes(equipmentNameLower) || equipmentNameLower.includes(e.nume.toLowerCase()),
          )
        }

        if (selectedEquipment) {
          console.log("Echipament găsit după nume pentru selecție forțată:", selectedEquipment)

          // Actualizăm ID-ul echipamentului în formData
          if (handleCustomChange) {
            handleCustomChange("echipamentId", selectedEquipment.id)
            handleCustomChange("echipamentCod", selectedEquipment.cod)

            // Afișăm un toast pentru feedback
            toast({
              title: "Echipament identificat",
              description: `Am identificat echipamentul "${selectedEquipment.nume}" după nume`,
              variant: "default",
            })
          }
        } else {
          console.log("Nu am putut găsi echipamentul după nume:", formData.echipament)

          // Dacă nu găsim echipamentul, dar avem un nume, îl păstrăm în formData
          // pentru a-l afișa în dropdown ca text
          if (formData.echipament && !formData.echipamentId && handleCustomChange) {
            console.log("Păstrăm numele echipamentului pentru afișare:", formData.echipament)
          }
        }
      }
    }, [availableEquipments, formData.echipament, isEdit, handleCustomChange])

    // Adăugăm un nou efect pentru a forța selecția echipamentului în dropdown
    useEffect(() => {
      // Verificăm dacă avem echipamente disponibile și un echipament selectat
      if (
        availableEquipments.length > 0 &&
        formData.echipament &&
        isEdit &&
        !triedSelectEquipment &&
        equipmentsLoaded
      ) {
        console.log("Încercăm să selectăm echipamentul în dropdown:", formData.echipament)

        // Căutăm echipamentul după ID sau nume
        let selectedEquipment: Echipament | undefined

        if (formData.echipamentId) {
          selectedEquipment = availableEquipments.find((e) => e.id === formData.echipamentId)
          if (selectedEquipment) {
            console.log("Echipament găsit după ID pentru selecție:", selectedEquipment)
          }
        }

        if (!selectedEquipment && formData.echipament) {
          selectedEquipment = availableEquipments.find((e) => e.nume === formData.echipament)
          if (selectedEquipment) {
            console.log("Echipament găsit după nume pentru selecție:", selectedEquipment)
          }
        }

        if (selectedEquipment) {
          // Actualizăm ID-ul echipamentului în formData dacă nu există deja
          if (!formData.echipamentId && handleCustomChange) {
            handleCustomChange("echipamentId", selectedEquipment.id)
            handleCustomChange("echipamentCod", selectedEquipment.cod)
          }

          // Afișăm un toast pentru feedback
          toast({
            title: "Echipament selectat automat",
            description: `Am selectat automat echipamentul "${selectedEquipment.nume}"`,
            variant: "default",
          })
        } else {
          console.log("Nu am putut găsi echipamentul pentru selecție automată")
        }

        // Marcăm că am încercat să selectăm echipamentul
        setTriedSelectEquipment(true)
      }
    }, [
      availableEquipments,
      formData.echipament,
      formData.echipamentId,
      isEdit,
      triedSelectEquipment,
      equipmentsLoaded,
      handleCustomChange,
    ])

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
          setPersoaneContact([...(locatie.persoaneContact || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))

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
          setAvailableEquipments([...(locatie.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
          setEquipmentsLoaded(true)

          // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
          setTriedSelectEquipment(false)
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

    // Adăugăm o funcție pentru a forța încărcarea echipamentelor pentru o locație
    // Adăugați această funcție după handleLocatieSelect (în jurul liniei 350):

    // Funcție pentru a forța încărcarea echipamentelor pentru o locație
    const forceLoadEquipments = useCallback(
      (locatieNume: string) => {
        if (!selectedClient) return

        const locatie = selectedClient.locatii?.find((loc) => loc.nume === locatieNume)
        if (locatie) {
          console.log("Forțăm încărcarea echipamentelor pentru locația:", locatieNume)

          if (locatie.echipamente && locatie.echipamente.length > 0) {
            console.log("Echipamente găsite pentru locație:", locatie.echipamente)
            setAvailableEquipments([...(locatie.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
            setEquipmentsLoaded(true)

            // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
            setTriedSelectEquipment(false)

            // Prioritizăm selecția după nume dacă avem un nume de echipament
            if (formData.echipament) {
              console.log("Prioritizăm selecția după nume:", formData.echipament)

              // Căutăm echipamentul după nume exact
              let selectedEquipment = locatie.echipamente.find((e) => e.nume === formData.echipament)

              // Dacă nu găsim o potrivire exactă, încercăm o potrivire parțială (case insensitive)
              if (!selectedEquipment) {
                const equipmentNameLower = formData.echipament.toLowerCase()
                selectedEquipment = locatie.echipamente.find(
                  (e) =>
                    e.nume.toLowerCase().includes(equipmentNameLower) ||
                    equipmentNameLower.includes(e.nume.toLowerCase()),
                )
              }

              if (selectedEquipment) {
                console.log("Echipament găsit după nume:", selectedEquipment)

                // Actualizăm ID-ul echipamentului în formData
                if (handleCustomChange) {
                  handleCustomChange("echipamentId", selectedEquipment.id)
                  handleCustomChange("echipamentCod", selectedEquipment.cod)

                  // Afișăm un toast pentru feedback
                  toast({
                    title: "Echipament identificat",
                    description: `Am identificat echipamentul "${selectedEquipment.nume}" după nume`,
                    variant: "default",
                  })
                }
              } else {
                console.log("Nu am putut găsi echipamentul după nume:", formData.echipament)
              }
            }

            // Verificăm dacă există un echipament selectat în formData după ID
            // Acest cod rămâne pentru compatibilitate cu selecția după ID
            if (formData.echipamentId) {
              const selectedEquipment = locatie.echipamente.find((e) => e.id === formData.echipamentId)
              if (selectedEquipment) {
                console.log("Echipament găsit în locație după ID:", selectedEquipment)
              } else {
                console.log("Echipamentul cu ID", formData.echipamentId, "nu a fost găsit în locația", locatieNume)
              }
            }
          } else {
            console.log("Nu există echipamente pentru locația", locatieNume)
            setAvailableEquipments([])
            setEquipmentsLoaded(true)
          }
        }
      },
      [selectedClient, formData.echipamentId, formData.echipament, handleCustomChange, toast],
    )

    // Adăugăm un efect pentru a forța încărcarea echipamentelor când se schimbă locația
    // Adăugați acest efect după efectul care actualizează clientul selectat:

    // Efect pentru a forța încărcarea echipamentelor când se schimbă locația
    useEffect(() => {
      if (formData.locatie && selectedClient) {
        console.log("Locația s-a schimbat, forțăm încărcarea echipamentelor:", formData.locatie)
        forceLoadEquipments(formData.locatie)
      }
    }, [formData.locatie, selectedClient, forceLoadEquipments])

    // Adăugăm un efect pentru a actualiza echipamentele când se schimbă locația selectată
    // fără a reseta selecția existentă
    useEffect(() => {
      if (selectedLocatie && selectedLocatie.echipamente) {
        console.log("Actualizare echipamente pentru locația selectată:", selectedLocatie.echipamente)
        setAvailableEquipments([...(selectedLocatie.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
        setEquipmentsLoaded(true)

        // Resetăm flag-ul pentru a permite o nouă încercare de selecție a echipamentului
        setTriedSelectEquipment(false)

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

    // Funcție pentru a deschide editarea clientului selectat pentru adăugarea de locații
    const handleAddLocationToClient = () => {
      if (!selectedClient) {
        toast({
          title: "Eroare",
          description: "Nu există un client selectat",
          variant: "destructive",
        })
        return
      }
      setIsEditClientDialogOpen(true)
    }

    // Funcție pentru a gestiona editarea cu succes a clientului
    const handleClientEdited = async () => {
      // Reîncărcăm lista de clienți pentru a reflecta modificările
      console.log("Client editat, reîncărcând datele...")
      
      // Închide dialogul
      setIsEditClientDialogOpen(false)
      
      // Opțional: afișăm un mesaj de succes
      toast({
        title: "Client actualizat",
        description: "Locația nouă a fost adăugată cu succes la client.",
      })
    }

    // Funcții pentru editarea echipamentului din cardul de garanție
    const handleOpenEditEquipmentDialog = () => {
      if (!selectedClient || !selectedLocatie || !selectedEquipment) {
        toast({
          title: "Eroare",
          description: "Nu se poate edita echipamentul. Informații lipsă.",
          variant: "destructive",
        })
        return
      }

      // Găsim indexul locației în lista de locații a clientului
      const locationIndex = selectedClient.locatii?.findIndex(loc => loc.nume === selectedLocatie.nume) ?? -1
      if (locationIndex === -1) {
        toast({
          title: "Eroare", 
          description: "Nu s-a putut găsi locația în structura clientului.",
          variant: "destructive",
        })
        return
      }

      // Găsim indexul echipamentului în lista de echipamente a locației
      const equipmentIndex = selectedLocatie.echipamente.findIndex(eq => eq.id === selectedEquipment.id || eq.cod === selectedEquipment.cod) ?? -1
      if (equipmentIndex === -1) {
        toast({
          title: "Eroare",
          description: "Nu s-a putut găsi echipamentul în structura locației.",
          variant: "destructive", 
        })
        return
      }

      // Setăm datele pentru editare
      setEquipmentToEdit({
        equipment: selectedEquipment,
        locationIndex,
        equipmentIndex
      })

      // Deschidem dialogul de editare
      setIsEditEquipmentDialogOpen(true)
    }

    const handleEquipmentEdited = async () => {
      console.log("Echipament editat, reîncărcând datele...")
      
      try {
        // Reîncărcăm clientul pentru a obține datele actualizate
        if (selectedClient?.id) {
          const updatedClient = await getClientById(selectedClient.id)
          if (updatedClient) {
            setSelectedClient(updatedClient)
            
            // Actualizăm locațiile
            if (updatedClient.locatii && updatedClient.locatii.length > 0) {
              setLocatii([...updatedClient.locatii].sort((a: any, b: any) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
              
                             // Găsim locația actualizată
               const updatedLocation = updatedClient.locatii.find((loc: Locatie) => loc.nume === selectedLocatie?.nume)
              if (updatedLocation) {
                setSelectedLocatie(updatedLocation)
                setAvailableEquipments([...(updatedLocation.echipamente || [])].sort((a: any, b: any) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
                
                                 // Găsim echipamentul actualizat
                 const updatedEquipment = updatedLocation.echipamente.find((eq: Echipament) => 
                   eq.id === selectedEquipment?.id || eq.cod === selectedEquipment?.cod
                 )
                if (updatedEquipment) {
                  setSelectedEquipment(updatedEquipment)
                  
                  // Recalculăm garanția cu datele actualizate
                  if (formData.tipLucrare === "Intervenție în garanție") {
                    const warranty = getWarrantyDisplayInfo(updatedEquipment)
                    setWarrantyInfo(warranty)
                    
                    if (handleCustomChange) {
                      handleCustomChange("garantieExpira", warranty.warrantyExpires)
                      handleCustomChange("garantieZileRamase", warranty.daysRemaining)
                    }
                  }
                }
              }
            }
          }
        }
        
        // Închide dialogul
        setIsEditEquipmentDialogOpen(false)
        setEquipmentToEdit(null)
        
        // Afișăm mesaj de succes
        toast({
          title: "Echipament actualizat",
          description: "Informațiile echipamentului au fost actualizate cu succes. Garanția a fost recalculată.",
        })
        
      } catch (error) {
        console.error("Eroare la reîncărcarea datelor după editarea echipamentului:", error)
        toast({
          title: "Avertisment",
          description: "Echipamentul a fost salvat, dar datele ar putea să nu se reflecte imediat. Reîncărcați pagina dacă este necesar.",
          variant: "destructive",
        })
      }
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

      if (
        (formData.tipLucrare === "Intervenție în contract" || formData.tipLucrare === "Contractare") &&
        !formData.contract
      ) {
        errors.push("contract")
        isValid = false
      }

      // Setăm erorile pentru a fi afișate vizual
      if (setFieldErrors) {
        setFieldErrors(errors)
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
        // PĂSTRĂM EXACT ACEEAȘI STRUCTURĂ DE DATE CA ÎNAINTE
        // Pentru lucrări noi: setăm ora la 00:00 pentru data intervenției
        let dataInterventieFormatted = ""
        if (dataInterventie) {
          if (isEdit) {
            // Pentru editare: păstrăm data+ora existentă
            dataInterventieFormatted = formatDateTime24(dataInterventie)
          } else {
            // Pentru lucrări noi: setăm ora la 00:00 pentru a păstra structura
            const dateOnly = new Date(dataInterventie)
            dateOnly.setHours(0, 0, 0, 0)
            dataInterventieFormatted = formatDateTime24(dateOnly)
          }
        }

        const updatedData: Partial<Lucrare> = {
          dataEmiterii: dataEmiterii ? formatDateTime24(dataEmiterii) : "",
          dataInterventie: dataInterventieFormatted,
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

    // Add buttons at the end if onSubmit and onCancel are provided
    // Adăugăm un efect pentru a actualiza persoanele de contact când se schimbă locația selectată
    // și pentru a menține starea când se schimbă alte câmpuri
    useEffect(() => {
      if (selectedLocatie) {
        console.log("Locație selectată (effect):", selectedLocatie)
        if (selectedLocatie.persoaneContact) {
          console.log("Persoane de contact (effect):", selectedLocatie.persoaneContact)
          setPersoaneContact([...(selectedLocatie.persoaneContact || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))

          // Automatically associate all contacts with the work entry
          if (handleCustomChange) {
            handleCustomChange("persoaneContact", selectedLocatie.persoaneContact)
          }
        }
        // Activăm afișarea acordeonului și nu-l dezactivăm niciodată după ce a fost activat
        setShowContactAccordion(true)
      }
    }, [selectedLocatie, handleCustomChange])

    // Modificăm efectul pentru a încărca persoanele de contact când se încarcă datele inițiale
    // Înlocuim efectul existent de la linia ~700 cu această versiune îmbunătățită:

    // Adăugăm un efect pentru a actualiza starea când se încarcă datele inițiale
    useEffect(() => {
      if (initialData) {
        console.log("Încărcare date inițiale pentru persoanele de contact:", initialData)

        // Verificăm dacă avem persoane de contact în datele inițiale
        if (initialData.persoaneContact && initialData.persoaneContact.length > 0) {
          console.log("Persoane de contact găsite în datele inițiale:", initialData.persoaneContact)
          setPersoaneContact(initialData.persoaneContact)
          setShowContactAccordion(true)
        } else {
          // Dacă nu avem persoane de contact în datele inițiale, dar avem persoanaContact și telefon,
          // creăm o persoană de contact implicită
          if (initialData.persoanaContact && initialData.telefon) {
            console.log("Creăm persoană de contact implicită din datele inițiale")
            const defaultContact: PersoanaContact = {
              nume: initialData.persoanaContact,
              telefon: initialData.telefon,
              email: "",
              functie: "",
            }
            setPersoaneContact([defaultContact])

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", [defaultContact])
            }

            setShowContactAccordion(true)
          }
        }

        // Forțăm afișarea acordeonului în modul de editare
        if (isEdit) {
          setShowContactAccordion(true)
        }
      }
    }, [initialData, handleCustomChange, formData.persoaneContact, isEdit])

    // Adăugăm un nou efect pentru a forța încărcarea persoanelor de contact când se încarcă locația
    // Adăugați acest efect după efectul de mai sus:

    // Efect pentru a forța încărcarea persoanelor de contact când se încarcă locația
    useEffect(() => {
      if (selectedClient && formData.locatie && isEdit) {
        console.log("Forțăm încărcarea persoanelor de contact pentru locația:", formData.locatie)

        const locatie = selectedClient.locatii?.find((loc) => loc.nume === formData.locatie)

        if (locatie) {
          console.log("Locație găsită pentru încărcarea persoanelor de contact:", locatie)

          if (locatie.persoaneContact && locatie.persoaneContact.length > 0) {
            console.log("Persoane de contact găsite în locație:", locatie.persoaneContact)
            setPersoaneContact([...(locatie.persoaneContact || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", locatie.persoaneContact)
            }

            // Dacă nu avem persoanaContact și telefon setate, le setăm cu prima persoană de contact
            if ((!formData.persoanaContact || !formData.telefon) && locatie.persoaneContact.length > 0) {
              const primaryContact = locatie.persoaneContact[0]
              handleSelectChange("persoanaContact", primaryContact.nume || "")
              handleSelectChange("telefon", primaryContact.telefon || "")
            }
          } else if (formData.persoanaContact && formData.telefon) {
            // Dacă nu avem persoane de contact în locație, dar avem persoanaContact și telefon în formData,
            // creăm o persoană de contact implicită
            console.log("Creăm persoană de contact implicită din formData")
            const defaultContact: PersoanaContact = {
              nume: formData.persoanaContact,
              telefon: formData.telefon,
              email: "",
              functie: "",
            }
            setPersoaneContact([defaultContact])

            // Actualizăm și formData dacă este necesar
            if (handleCustomChange && (!formData.persoaneContact || formData.persoaneContact.length === 0)) {
              handleCustomChange("persoaneContact", [defaultContact])
            }
          }

          // Forțăm afișarea acordeonului
          setShowContactAccordion(true)
        }
      }
    }, [
      selectedClient,
      formData.locatie,
      isEdit,
      formData.persoanaContact,
      formData.telefon,
      handleCustomChange,
      handleSelectChange,
    ])

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

    // Function to handle close attempt
    const handleCloseAttempt = () => {
      if (formModified) {
        setShowCloseAlert(true)
      } else if (onCancel) {
        onCancel()
      }
    }

    // Function to confirm close
    const confirmClose = () => {
      setShowCloseAlert(false)
      if (onCancel) {
        onCancel()
      }
    }

    // Function to cancel close
    const cancelClose = () => {
      setShowCloseAlert(false)
    }

    // Adaugă acest efect special pentru a forța încărcarea și selecția echipamentului la editare
    useEffect(() => {
      // Rulăm acest efect doar în modul de editare și când avem date inițiale
      if (isEdit && initialData && selectedClient && formData.locatie) {
        console.log("LucrareForm - Forțăm încărcarea și selecția echipamentului la editare")

        // Găsim locația selectată
        const locatie = selectedClient.locatii?.find((loc) => loc.nume === formData.locatie)

        if (locatie && locatie.echipamente && locatie.echipamente.length > 0) {
          console.log("LucrareForm - Locație găsită cu echipamente:", locatie.echipamente.length)

          // Actualizăm lista de echipamente disponibile
          setAvailableEquipments([...(locatie.echipamente || [])].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" })))
          setEquipmentsLoaded(true)

          // Resetăm flag-urile pentru a permite o nouă încercare de selecție
          setTriedFindByName(false)
          setTriedSelectEquipment(false)

          // Verificăm dacă avem un echipament în datele inițiale
          if (initialData.echipament) {
            console.log("LucrareForm - Echipament în datele inițiale:", initialData.echipament)

            // Căutăm echipamentul după ID
            if (initialData.echipamentId) {
              const equipment = locatie.echipamente.find((e) => e.id === initialData.echipamentId)
              if (equipment) {
                console.log("LucrareForm - Echipament găsit după ID:", equipment)
                // Nu este nevoie să facem nimic, CustomEquipmentSelect va găsi echipamentul după ID
              } else {
                console.log("LucrareForm - Echipamentul cu ID", initialData.echipamentId, "nu a fost găsit")

                // Încercăm să găsim echipamentul după nume
                const equipmentByName = locatie.echipamente.find((e) => e.nume === initialData.echipament)
                if (equipmentByName) {
                  console.log("LucrareForm - Echipament găsit după nume:", equipmentByName)

                  // Actualizăm ID-ul echipamentului în formData
                  if (handleCustomChange) {
                    handleCustomChange("echipamentId", equipmentByName.id)
                    handleCustomChange("echipamentCod", equipmentByName.cod)
                  }
                }
              }
            } else {
              // Nu avem ID, încercăm să găsim echipamentul după nume
              const equipmentByName = locatie.echipamente.find((e) => e.nume === initialData.echipament)
              if (equipmentByName) {
                console.log("LucrareForm - Echipament găsit după nume:", equipmentByName)

                // Actualizăm ID-ul echipamentului în formData
                if (handleCustomChange) {
                  handleCustomChange("echipamentId", equipmentByName.id)
                  handleCustomChange("echipamentCod", equipmentByName.cod)
                }
              }
            }
          }
        }
      }
    }, [isEdit, initialData, selectedClient, formData.locatie, handleCustomChange])

    return (
      <div className="modal-calendar-container">
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <div className="grid gap-4 py-4">
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

          {/* 1. Data când se solicită intervenția (fără oră în UI, dar cu ora în baza de date) */}
          <div className="space-y-2">
            <label htmlFor="dataInterventie" className="text-sm font-medium">
              Data când se solicită intervenția *
            </label>
            <div className="w-full">
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
            <p className="text-xs text-muted-foreground">
              Data când se solicită intervenția
            </p>
          </div>

          {/* 2. Client */}
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
                      className={`w-full justify-between ${hasError("client") ? errorStyle : ""}`}
                      onKeyDown={(e) => {
                        // Deschidem și inițializăm navigarea cu tastatura
                        if ((e.key === 'ArrowDown' || e.key === 'Enter') && !isClientDropdownOpen) {
                          e.preventDefault()
                          setIsClientDropdownOpen(true)
                          setClientActiveIndex(filteredClients.length > 0 ? 0 : -1)
                        }
                      }}
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
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            if (filteredClients.length === 0) return
                            setClientActiveIndex((prev) => {
                              const next = (prev + 1) % filteredClients.length
                              return next
                            })
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            if (filteredClients.length === 0) return
                            setClientActiveIndex((prev) => {
                              const next = prev <= 0 ? filteredClients.length - 1 : prev - 1
                              return next
                            })
                          } else if (e.key === 'Enter') {
                            e.preventDefault()
                            const idx = clientActiveIndex >= 0 ? clientActiveIndex : (filteredClients.length > 0 ? 0 : -1)
                            if (idx >= 0) {
                              const client = filteredClients[idx]
                              handleClientChange(client.nume)
                              setIsClientDropdownOpen(false)
                              setClientSearchTerm("")
                              setClientActiveIndex(-1)
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setIsClientDropdownOpen(false)
                          }
                        }}
                      />
                      <div ref={clientListRef} className="max-h-[200px] overflow-y-auto">
                        {loadingClienti ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            <span>Se încarcă clienții...</span>
                          </div>
                        ) : filteredClients.length > 0 ? (
                          filteredClients.map((client, index) => {
                            const norm = (s?: string) => String(s || '').toLowerCase()
                            const term = clientSearchTerm.toLowerCase()
                            const matchedLocation = Array.isArray((client as any).locatii)
                              ? (client as any).locatii.find((loc: any) => norm(loc?.nume).includes(term) || norm(loc?.adresa).includes(term))
                              : undefined
                            return (
                            <div
                              key={client.id}
                              data-index={index}
                              className={`px-2 py-1 cursor-pointer rounded ${
                                formData.client === client.nume ? "bg-blue-50 text-blue-600" : (clientActiveIndex === index ? "bg-gray-100" : "hover:bg-gray-100")
                              }`}
                              onClick={() => {
                                handleClientChange(client.nume)
                                setIsClientDropdownOpen(false)
                                setClientSearchTerm("")
                              }}
                              onMouseEnter={() => setClientActiveIndex(index)}
                            >
                              <div className="flex flex-col">
                                <span>{client.nume}</span>
                                {matchedLocation && (
                                  <span className="text-xs text-muted-foreground">locație: {matchedLocation.nume || matchedLocation.adresa}</span>
                                )}
                              </div>
                            </div>
                            )
                          })
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
                  {(selectedClient as any).cif && <span> (CIF: {(selectedClient as any).cif})</span>}
                </div>
              )}
            </div>
          </div>

          {/* 3. Locația */}
          {locatii.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="locatie" className="text-sm font-medium">
                Locație *
              </label>
              <div className="flex gap-2">
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
                {selectedClient && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleAddLocationToClient}
                    title="Adaugă locație nouă la client"
                    className="shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selectați locația clientului pentru această lucrare. Toate persoanele de contact vor fi asociate
                automat.
              </p>
            </div>
          )}

          {/* 4. Echipamentul */}
          <div className="space-y-2">
            <label htmlFor="echipament" className="text-sm font-medium">
              Echipament
            </label>
            <CustomEquipmentSelect
              key={`equipment-select-${availableEquipments.length}-${formData.echipamentCod || formData.echipament}`}
              equipments={availableEquipments}
              value={formData.echipamentId || formData.echipamentCod}
              onSelect={handleEquipmentSelect}
              disabled={!formData.locatie}
              placeholder={formData.locatie ? "Selectați echipamentul" : "Selectați mai întâi o locație"}
              emptyMessage={
                formData.locatie ? "Nu există echipamente pentru această locație" : "Selectați mai întâi o locație"
              }
              fallbackName={formData.echipament}
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

          {/* 5. Tipul de intervenție */}
          <div className="space-y-2">
            <label htmlFor="tipLucrare" className="text-sm font-medium">
              Tip Intervenție *
            </label>
            <Select value={formData.tipLucrare} onValueChange={(value) => handleSelectChange("tipLucrare", value)}>
              <SelectTrigger id="tipLucrare" className={hasError("tipLucrare") ? errorStyle : ""}>
                <SelectValue placeholder="Selectați tipul intervenției" />
              </SelectTrigger>
              <SelectContent>
                {WORK_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {formData.tipLucrare === "Intervenție în garanție" && (
              <p className="text-xs text-amber-600 mt-1">
                Notă: Garanția nu poate depăși 24 de luni de la instalare. Există cazuri cu 12 luni și cazuri cu 24
                luni de la predare.
              </p>
            )}
          </div>

          {/* Afișarea informațiilor de garanție pentru "Intervenție în garanție" */}
          {formData.tipLucrare === "Intervenție în garanție" && selectedEquipment && (
            <Card className="p-4 border rounded-md bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">G</span>
                </div>
                <h3 className="text-md font-medium text-blue-900">Informații Garanție Echipament</h3>
              </div>

              {warrantyInfo ? (
                <div className="space-y-3">
                  {/* Status garanție */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Status garanție:</span>
                    <Badge className={warrantyInfo.statusBadgeClass}>
                      {warrantyInfo.statusText}
                    </Badge>
                  </div>

                  {/* Informații detaliate despre garanție */}
                  {warrantyInfo.hasWarrantyData && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Data instalării:</span>
                          <p className="text-gray-600">{warrantyInfo.installationDate || "Nedefinită"}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Perioada garanție:</span>
                          <p className="text-gray-600">{warrantyInfo.warrantyMonths} luni</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Garanția expiră:</span>
                          <p className="text-gray-600">{warrantyInfo.warrantyExpires || "Nedefinită"}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Zile rămase:</span>
                          <p className={`font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                            {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                          </p>
                        </div>
                      </div>

                      {/* Mesaj despre status garanție */}
                      <div className="mt-3 p-3 rounded-md bg-white border">
                        <p className="text-sm text-gray-700">{warrantyInfo.warrantyMessage}</p>
                      </div>

                      {/* Avertisment pentru echipamente fără garanție explicit setată */}
                      {!warrantyInfo.hasExplicitWarranty && (
                        <div className="mt-2 p-3 rounded-md bg-yellow-50 border border-yellow-200">
                          <div className="flex items-start justify-between">
                            <p className="text-xs text-yellow-800 flex items-center flex-1">
                              <span className="mr-1">⚠️</span>
                              Acest echipament nu are perioada de garanție explicit setată. Se folosește valoarea implicită de 12 luni.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleOpenEditEquipmentDialog}
                              className="ml-2 h-6 px-2 text-xs bg-white hover:bg-yellow-100 border-yellow-300"
                            >
                              Editează echipament
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Mesaj de eroare dacă nu se poate calcula garanția */}
                  {!warrantyInfo.hasWarrantyData && (
                    <div className="p-3 rounded-md bg-red-50 border border-red-200">
                      <p className="text-sm text-red-700">{warrantyInfo.warrantyMessage}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">Selectați un echipament pentru a afișa informațiile de garanție</p>
                </div>
              )}
            </Card>
          )}

          {/* 6. Contractul */}
          {(formData.tipLucrare === "Intervenție în contract" || formData.tipLucrare === "Contractare") && (
            <div className="space-y-2">
              <label htmlFor="contract" className="text-sm font-medium">
                Contract *
              </label>
              <ContractSelect
                value={formData.contract || ""}
                onChange={(value, contractNumber, contractType) => {
                  handleSelectChange("contract", value)
                  handleSelectChange("contractNumber", contractNumber || "")
                  handleSelectChange("contractType", contractType || "")
                }}
                hasError={hasError("contract")}
                errorStyle={errorStyle}
                clientIdFilter={selectedClient?.id}
              />
              {formData.contractType && (
                <p className="text-xs text-blue-600">
                  Tip contract: <span className="font-medium">{formData.contractType}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">Selectați contractul asociat intervenției</p>
            </div>
          )}

          {/* 7. Tehnicianul alocat */}
          <div className="space-y-2">
            <label htmlFor="tehnicieni" className="text-sm font-medium">
              Tehnician alocat
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
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    Nu există tehnicieni disponibili
                  </div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Puteți selecta mai mulți tehnicieni</p>
          </div>

          {/* 8. Defect reclamat */}
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

          {/* 9. Notă internă */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label htmlFor="descriere" className="text-sm font-medium">
                Notă internă
              </label>
              {isAdminOrDispatcher && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  Doar uz intern
                </Badge>
              )}
            </div>
            <Textarea
              id="descriere"
              placeholder="Adăugați sfaturi sau instrucțiuni pentru tehnician (nu vor apărea în raportul final)"
              value={formData.descriere}
              onChange={handleInputChange}
              className="min-h-[100px] resize-y"
              disabled={!isAdminOrDispatcher}
            />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <LightbulbIcon className="h-3 w-3 text-amber-500" />
              Acest câmp este vizibil doar pentru uz intern și nu va apărea în raportul generat pentru client
            </p>
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

          {/* Dialog pentru adăugarea unui client nou */}
          <Dialog open={isAddClientDialogOpen} onOpenChange={setIsAddClientDialogOpen}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adaugă Client Nou</DialogTitle>
              </DialogHeader>
              <ClientForm onSuccess={handleClientAdded} onCancel={() => setIsAddClientDialogOpen(false)} />
            </DialogContent>
          </Dialog>

          {/* Dialog pentru editarea clientului selectat */}
          <Dialog open={isEditClientDialogOpen} onOpenChange={setIsEditClientDialogOpen}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editează {selectedClient?.nume} - Adaugă Locații</DialogTitle>
              </DialogHeader>
              {selectedClient && (
                <ClientEditForm 
                  client={selectedClient} 
                  onSuccess={handleClientEdited} 
                  onCancel={() => setIsEditClientDialogOpen(false)} 
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Dialog pentru editarea echipamentului din cardul de garanție */}
          <Dialog open={isEditEquipmentDialogOpen} onOpenChange={setIsEditEquipmentDialogOpen}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[800px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editează Client - {selectedClient?.nume}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  Găsiți echipamentul "{equipmentToEdit?.equipment.nume}" în lista de echipamente și editați perioada de garanție.
                </p>
              </DialogHeader>
              {selectedClient && equipmentToEdit && (
                <ClientEditForm 
                  client={selectedClient} 
                  onSuccess={handleEquipmentEdited} 
                  onCancel={() => {
                    setIsEditEquipmentDialogOpen(false)
                    setEquipmentToEdit(null)
                  }}
                />
              )}
            </DialogContent>
          </Dialog>

          {isEdit && (
            <div className="space-y-2">
              <label htmlFor="statusLucrare" className="text-sm font-medium">
                Status Lucrare
              </label>
              <div className="flex items-center h-10 px-3 py-2 text-sm border rounded-md bg-muted/50">
                <Badge className={getWorkStatusClass(formData.statusLucrare)}>{formData.statusLucrare}</Badge>
                <span className="ml-2 text-xs text-muted-foreground">Status automatizat</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Statusul lucrării este actualizat automat în funcție de atribuirea tehnicienilor și progresul lucrării
              </p>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-700">
                  {/* <strong>Notă:</strong> Statusul facturării se actualizează din pagina de detalii a lucrării după finalizarea și preluarea acesteia de către dispecer. */}
                </p>
              </div>
            </div>
          )}
        </div>

        {(onSubmit || onCancel) && (
          <div className="flex justify-end space-x-2 mt-6">
            {/* {onCancel && (
              <Button variant="outline" onClick={handleCloseAttempt}>
                Anulează
              </Button>
            )} */}
            {onSubmit && (
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="mr-2">⏳</span>
                    Se salvează...
                  </>
                ) : (
                  "Salvează"
                )}
              </Button>
            )}
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
        {/* Close confirmation alert */}
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
              <AlertDialogCancel onClick={cancelClose}>Anulează</AlertDialogCancel>
              <AlertDialogAction onClick={confirmClose}>Închide</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  },
)

// Add display name for the component
LucrareForm.displayName = "LucrareForm"
